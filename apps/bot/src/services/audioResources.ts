import path from 'path';
import * as url from 'url';
import { createReadStream } from 'fs';

import { createAudioResource } from '@discordjs/voice';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export const startTalkingBoops = () =>
	createAudioResource(createReadStream(path.resolve(__dirname, '../assets/teno-start-boops.ogg')));

export const endTalkingBoops = () =>
	createAudioResource(createReadStream(path.resolve(__dirname, '../assets/teno-end-boops.ogg')));
