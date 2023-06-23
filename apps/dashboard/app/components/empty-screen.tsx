import type { UseChatHelpers } from 'ai/react';

import { IconArrowRight } from './ui/icons';
import { Button } from './ui/Button';

const exampleMessages = [
	{
		heading: 'Summarize this meeting',
		message: `Summarize this meeting for me`,
	},
	{
		heading: 'Give me the action items from this meeting',
		message: 'Give me the action items from this meeting',
	},
];

export function EmptyScreen({ setInput, meeting }: Pick<UseChatHelpers, 'setInput'> & { meeting: { name: string } }) {
	return (
		<div className="mx-auto max-w-2xl px-4">
			<div className="rounded-lg border bg-background p-8">
				<h1 className="mb-2 text-lg font-semibold">{meeting.name}</h1>
				<p className="mb-2 leading-normal text-muted-foreground">
					This is a private space for you to dig into this meeting with Teno.
				</p>
				<p className="leading-normal text-muted-foreground">
					You can start talking with Teno or try the following conversation starters:
				</p>
				<div className="mt-4 flex flex-col items-start space-y-2">
					{exampleMessages.map((message, index) => (
						<Button
							key={index}
							variant="link"
							className="h-auto p-0 text-base"
							onClick={() => setInput(message.message)}
						>
							<IconArrowRight className="mr-2 text-muted-foreground" />
							{message.heading}
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}
