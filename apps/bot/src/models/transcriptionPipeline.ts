import { Subject } from 'rxjs';
import { filter, map, concatMap, mergeMap } from 'rxjs/operators';
import type { VoiceReceiver } from '@discordjs/voice';
import type { User } from 'discord.js';

import { startListening } from '@/utils/createMeeting.js';

import type { Utterance } from './utterance.js';
import type { Teno } from './teno.js';
import type { Meeting } from './meeting.js';

const inputIsUtterance = (input: Utterance | null): input is Utterance => {
	return !!input && !!input.textContent;
};

export class TranscriptionPipeline {
	private audio$ = new Subject<{ user: User; receiver: VoiceReceiver }>();
	private teno: Teno;
	private meeting: Meeting;
	private onEnd: (() => void) | undefined;

	constructor({ teno, meeting, onEnd }: { teno: Teno; meeting: Meeting; onEnd?: () => void }) {
		this.teno = teno;
		this.meeting = meeting;
		this.onEnd = onEnd;

		this.createAudioStream();
		this.fillStream();
	}

	private createAudioStream() {
		const audio$ = this.audio$.pipe(
			// filter out sentences uttered by ignored users
			filter(({ user }) => {
				return !this.meeting.isIgnored(user.id) && !this.meeting.isSpeaking(user.id);
			}),

			mergeMap(async (payload) => {
				const { user } = payload;
				await this.meeting.addMember(user.id, user.username, user.discriminator);
				this.meeting.addSpeaking(user.id);

				return payload;
			}),

			// map all incoming voice buffers into utterances
			mergeMap(async (payload) => {
				const { user, receiver } = payload;
				const utterance = await this.meeting.createUtterance(receiver, user.id);

				const newPayload: { user: User; utterance: typeof utterance } = { user, utterance };

				return newPayload;
			}),

			map((payload) => {
				const { user, utterance } = payload;
				this.meeting.stoppedSpeaking(user.id);

				if (utterance === null) {
					return utterance;
				}

				if (utterance === 'STOP') {
					this.teno.getResponder().stopResponding();
					return null;
				}

				return utterance;
			}),

			filter(inputIsUtterance),

			// map all transcribed sentence into a redis.set call
			mergeMap(async (utterance) => {
				await this.meeting.writeToTranscript(utterance);

				return utterance;
			}),

			filter(() => {
				return !this.teno.getResponder().isThinking();
			}),

			// map one transcribed sentence into a responder.respondOnUtteranceIfAble call at a time
			concatMap(async (utterance) => {
				await this.teno.getResponder().respondOnUtteranceIfAble(utterance, this.meeting);
			}),
		);

		const sub = audio$.subscribe({
			error: (err) => console.error(`Error completing transcription pipeline: ${err}`),
			complete: () => {
				sub.unsubscribe();
				console.log('transcription pipeline complete');
			},
		});
	}

	fillStream = () => {
		const voiceChannel = this.meeting.getVoiceChannel();
		const voiceConnection = this.meeting.getConnection();
		if (voiceChannel && voiceConnection) {
			startListening({
				voiceChannel,
				connection: voiceConnection,
				onVoiceReceiver: this.onNewVoiceReceiver,
			});
		}
	};

	// Function to simulate receiving tokens from the LLM
	onNewVoiceReceiver = (payload: { user: User; receiver: VoiceReceiver }) => {
		this.audio$.next(payload);
	};

	// Function to complete the tokens$ Subject when you're done
	complete = () => {
		this.audio$.complete();
	};
}
