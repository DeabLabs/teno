import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { EndBehaviorType, VoiceReceiver } from '@discordjs/voice';
import type { User } from 'discord.js';
import * as prism from 'prism-media';
import { transcribe } from './deepgram';

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

	const filename = `./recordings/${Date.now()}-${getDisplayName(userId, user)}.ogg`;

	const out = createWriteStream(filename);

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	const onEnd = () => {};

	console.log(`👂 Started recording ${filename}`);

	pipeline(opusStream, oggStream, out, (err) => {
		// eslint-disable-next-line @typescript-eslint/no-use-before-define, @typescript-eslint/no-unsafe-argument
		opusStream.removeListener('end', onEnd);
		if (err) {
			console.warn(`❌ Error recording file ${filename} - ${err.message}`);
		} else {
			console.log(`✅ Recorded ${filename}`);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			transcribe(filename);
		}
	});
}
