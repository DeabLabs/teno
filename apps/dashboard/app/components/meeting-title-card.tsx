import type { UseChatHelpers } from 'ai/react';
import { DownloadIcon } from 'lucide-react';
import { Form } from '@remix-run/react';

import { TooltipTrigger } from './ui/tooltip';
import { Tooltip } from './ui/tooltip';
import { IconArrowRight } from './ui/icons';
import { Button } from './ui/Button';
import { TooltipContent } from './ui/tooltip';

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

export function MeetingTitleCard({
	setInput,
	meeting,
}: Pick<UseChatHelpers, 'setInput'> & { meeting: { name: string; id: number } }) {
	const handleClick = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
		e.preventDefault();
		const formData = new FormData();
		formData.append('action', 'download');

		fetch(`/dashboard/meeting/${meeting.id}/download`, {
			method: 'post',
			body: formData,
		})
			.then(async (res) => {
				if (!res.ok) throw new Error('Could not download transcript');

				const b = await res.blob();
				const f = res.headers.get('Content-Disposition')?.split('filename=')?.[1];

				if (!b || !f) throw new Error('Could not download transcript');

				return { blob: b, filename: f };
			})
			.then(({ blob, filename }) => {
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				a.download = filename;
				a.click();
			})
			.catch((err) => {
				console.error(err);
			});
	};
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
				<div className="mt-4 flex justify-end">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button size={'icon'} name="action" value="download" type="button" onClick={handleClick}>
								<DownloadIcon size={'1rem'} />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Download Transcript</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</div>
	);
}
