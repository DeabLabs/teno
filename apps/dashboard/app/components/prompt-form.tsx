import * as React from 'react';
import Textarea from 'react-textarea-autosize';
import type { UseChatHelpers } from 'ai/react';

import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';

import { Button } from './ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { IconArrowElbow } from './ui/icons';

export interface PromptProps extends Pick<UseChatHelpers, 'input' | 'setInput'> {
	onSubmit: (value: string) => void;
	isLoading: boolean;
}

export function PromptForm({ onSubmit, input, setInput, isLoading }: PromptProps) {
	const { formRef, onKeyDown } = useEnterSubmit();
	const inputRef = React.useRef<HTMLTextAreaElement>(null);

	React.useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
		}
	}, []);

	return (
		<form
			onSubmit={async (e) => {
				e.preventDefault();
				if (input === '') {
					return;
				}
				setInput('');
				await onSubmit(input);
			}}
			ref={formRef}
		>
			<div className="relative flex w-full grow flex-col overflow-hidden bg-background px-8 sm:rounded-md sm:border sm:px-12">
				{/* <Tooltip>
					<TooltipTrigger asChild>
						<Link
							to="/"
							className={cn(
								buttonVariants({ size: 'sm', variant: 'outline' }),
								'absolute left-0 top-4 h-8 w-8 rounded-full bg-background p-0 sm:left-4',
							)}
						>
							<IconPlus />
							<span className="sr-only">New Chat</span>
						</Link>
					</TooltipTrigger>
					<TooltipContent>New Chat</TooltipContent>
				</Tooltip> */}
				<Textarea
					ref={inputRef}
					tabIndex={0}
					onKeyDown={onKeyDown}
					rows={1}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Send a message."
					spellCheck={false}
					className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus-within:outline-none sm:text-sm"
				/>
				<div className="absolute right-0 top-4 sm:right-4">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button type="submit" size="icon" disabled={isLoading || input === ''}>
								<IconArrowElbow />
								<span className="sr-only">Send message</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Send message</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</form>
	);
}
