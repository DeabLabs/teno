/**
 * Creates a transcript key for a given message, guild, and text channel.
 * @param guildId - The discord guild id of the voice channel to be recorded.
 * @param timestamp - The timestamp of the meeting start.
 * @param meetingMessageId - The discord message id of the message that started the meeting.
 * @returns The filename of the transcript file.
 */
export const makeTranscriptKey = ({
	guildId,
	meetingMessageId,
	timestamp,
}: {
	guildId: string;
	timestamp: string;
	meetingMessageId: string;
}) => `${timestamp}-${guildId}-${meetingMessageId}`;

/**
 * From seconds, return '00:00:00' or '00:00' depending on the size
 *
 * @param seconds number of seconds to convert
 * @returns string formatted in common song length duration format
 */
export const formatTime = (seconds: number) => {
	if (isNaN(seconds) || seconds <= 0) {
		return '00:00';
	}

	if (seconds < 3600) {
		return new Date(seconds * 1000).toISOString().substr(14, 5);
	}

	return new Date(seconds * 1000).toISOString().substr(11, 8);
};
