import { promises as fsPromises } from 'fs';
import path from 'path';
import { TextLoader } from 'langchain/document_loaders';

const transcriptExtension = '.txt';

/**
 * Creates a transcript filename for a given timestamp and user ID.
 * @param timestamp - The timestamp of the recording that triggered the transcription.
 * @param userId - The discord user id of the recording's author.
 * @returns The filename of the transcript file.
 */
export const makeTranscriptFilename = (timestamp: string, userId: string) =>
	`${timestamp}-${userId}${transcriptExtension}}`;

/**
 * Creates a transcript path for a given timestamp and user ID.
 * This path points to the transcript file for the timestamp/userID in the transcripts directory.
 *
 * @param timestamp - The timestamp of the recording that triggered the transcription.
 * @param userId - The discord user id of the recording's author.
 * @returns The path to the transcript file.
 */
export const makeTranscriptPath = (timestamp: string, userId: string) =>
	path.join(__dirname, '..', 'transcripts', makeTranscriptFilename(timestamp, userId));

/**
 * Creates a transcript TextLoader for a given timestamp and user ID.
 *
 * @param timestamp - The timestamp of the recording that triggered the transcription.
 * @param userId - The discord user id of the recording's author.
 * @returns A TextLoader for the transcription. Call .load() to get the text.
 */
export const transcriptionLoader = (timestamp: string, userId: string) => {
	const transcriptionPath = makeTranscriptPath(timestamp, userId);
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
