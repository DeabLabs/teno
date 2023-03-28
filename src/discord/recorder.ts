import { pipeline } from 'node:stream';
import type { AudioReceiveStream, VoiceReceiver } from '@discordjs/voice';
import { EndBehaviorType } from '@discordjs/voice';
import type { User } from 'discord.js';
import * as prism from 'prism-media';
import type { Meeting } from '../classes/meeting.js';
import { streamTranscribe } from '../services/transcriber.js';
import { PassThrough } from 'node:stream';

function getDisplayName(userId: string, user?: User) {
	return user ? `${user.username}_${user.discriminator}` : userId;
}

export async function downloadRecording(
	opusStream: AudioReceiveStream,
	oggStream: prism.opus.OggLogicalBitstream,
	meeting: Meeting,
	userId: string,
	user?: User,
): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const passThrough = new PassThrough();

		passThrough.on('data', (chunk) => {
			chunks.push(chunk);
		});

		pipeline(opusStream, oggStream, passThrough, async (err) => {
			if (err) {
				console.warn(`❌ Error recording - ${err.message}`);
				reject(err);
			} else {
				meeting.stoppedSpeaking(userId);
				console.log(`✅ Recorded`);
				const combinedBuffer = Buffer.concat(chunks);
				await streamTranscribe(combinedBuffer, getDisplayName(userId, user), meeting.transcript.addUtterance);
				resolve(combinedBuffer);
			}
		});
	});
}

export function createListeningStream(receiver: VoiceReceiver, userId: string, meeting: Meeting, user?: User) {
	const opusStream = receiver.subscribe(userId, {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			duration: 1000,
		},
	});

	const oggStream = new prism.opus.OggLogicalBitstream({
		opusHead: new prism.opus.OpusHead({
			channelCount: 2,
			sampleRate: 48000,
		}),
		pageSizeControl: {
			maxPackets: 10,
		},
	});

	downloadRecording(opusStream, oggStream, meeting, userId, user);
}
