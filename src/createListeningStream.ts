import { createWriteStream } from 'fs';
import { pipeline } from 'node:stream';
import { AudioReceiveStream, EndBehaviorType, VoiceReceiver } from '@discordjs/voice';
import type { User } from 'discord.js';
import * as prism from 'prism-media';
import { createTranscribeStream, downloadTranscribe } from './deepgram';

function getDisplayName(userId: string, user?: User) {
	return user ? `${user.username}_${user.discriminator}` : userId;
}

export function downloadRecording(
	opusStream: AudioReceiveStream,
	oggStream: prism.opus.OggLogicalBitstream,
	userId: string,
	user?: User,
) {
	const filename = `./recordings/${Date.now()}-${getDisplayName(userId, user)}.ogg`;
	const out = createWriteStream(filename);
	console.log(`👂 Started recording ${filename}`);
	pipeline(opusStream, oggStream, out, (err) => {
		if (err) {
			console.warn(`❌ Error recording file ${filename} - ${err.message}`);
		} else {
			console.log(`✅ Recorded ${filename}`);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			downloadTranscribe(filename);
		}
	});
}

export function streamRecording(
	opusStream: AudioReceiveStream,
	oggStream: prism.opus.OggLogicalBitstream,
	userId: string,
	user?: User,
) {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
	const transcribeStream = createTranscribeStream();
	console.log(`👂 Started recording ${getDisplayName(userId, user)}`);
	pipeline(opusStream, oggStream, transcribeStream, (err) => {
		if (err) {
			console.warn(`❌ Error recording`);
		} else {
			console.log(`✅ Recorded ${getDisplayName(userId, user)}`);
		}
	});
}

export function createListeningStream(receiver: VoiceReceiver, userId: string, user?: User) {
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

	downloadRecording(opusStream, oggStream, userId, user);
	// streamRecording(opusStream, oggStream, userId, user);
}
