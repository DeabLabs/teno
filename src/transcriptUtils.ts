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
