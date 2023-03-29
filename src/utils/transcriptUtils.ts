import { promises as fsPromises } from 'fs';
import { TextLoader } from 'langchain/document_loaders';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Creates a transcript key for a given message, guild, and text channel.
 * @param guildId - The discord guild id of the voice channel to be recorded.
 * @param textChannelId - The discord text channel id of the channel to send the transcript to.
 * @param meetingMessageId - The discord message id of the message that started the meeting.
 * @returns The filename of the transcript file.
 */
export const makeTranscriptKey = (guildId: string, textChannelId: string, meetingMessageId: string) =>
	`${guildId}-${textChannelId}-${meetingMessageId}`;

/**
 * Creates a transcript path for a given timestamp and channel ID.
 * This path points to the transcript file for the timestamp/channelID in the transcripts directory.
 *
 * @param filename - The filename of the transcript file.
 * @returns The path to the transcript file.
 */
export const makeTranscriptPath = (filename: string) => path.join(__dirname, '..', 'transcripts', filename);

/**
 * Creates a transcript TextLoader for a given timestamp and user ID.
 *
 * @param timestamp - The timestamp of the recording that triggered the transcription.
 * @param userId - The discord user id of the recording's author.
 * @returns A TextLoader for the transcription. Call .load() to get the text.
 */
export const transcriptionLoader = async (filename: string) => {
	const transcriptionPath = makeTranscriptPath(filename);
	const loader = new TextLoader(transcriptionPath);

	return loader;
};

/**
 * Writes a transcription to a file.
 * The file is created if it does not exist.
 *
 * @param filePath - The path to the file to write to.
 * @param text - The text to write to the file.
 */
export const transcriptionWriter = async (filePath: string, text: string) => {
	try {
		await fsPromises.appendFile(filePath, `${text}\n`, 'utf-8');
		console.log(`Transcription appended to file: ${filePath}`);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Error appending transcription to file: ${error.message}`);
		}
	}
};

/**
 * From seconds, return '00:00:00' or '00:00' depending on the size
 *
 * @param seconds number of seconds to convert
 * @returns string formatted in common song length duration format
 */
export const formatTime = (seconds: number) => {
	if (isNaN(seconds)) {
		return '0:00';
	}

	if (seconds < 3600) {
		return new Date(seconds * 1000).toISOString().substr(14, 5);
	}

	return new Date(seconds * 1000).toISOString().substr(11, 8);
};
