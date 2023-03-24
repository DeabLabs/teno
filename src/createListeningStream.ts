import { pipeline } from 'node:stream';
import { EndBehaviorType, VoiceReceiver } from '@discordjs/voice';
import type { User } from 'discord.js';
import * as prism from 'prism-media';
import { createTranscribeStream } from './deepgram';

function getDisplayName(userId: string, user?: User) {
	return user ? `${user.username}_${user.discriminator}` : userId;
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
