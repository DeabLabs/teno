export const thinkingTextVariations = [
	'Hmmm, give me a second to think about that...',
	'Hold on, let me ponder on that for a moment...',
	'Wait a sec, I need to contemplate that...',
	'Allow me a moment to mull over that...',
	'One moment, just thinking about that...',
	'Hold up, let me process that for a bit...',
	"Just a second, I'm reflecting on that...",
	'Bear with me, I need to consider that...',
	"Wait a moment, I'm weighing that in my mind...",
	'Let me think that through for a moment...',
] as const;

export const getRandomThinkingText = () =>
	thinkingTextVariations[Math.floor(Math.random() * thinkingTextVariations.length)] ?? thinkingTextVariations[0];
