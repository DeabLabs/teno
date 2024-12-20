import type { Message } from 'ai';

import { cn } from '@/lib/utils';

import { IconOpenAI, IconUser } from './ui/icons';

export interface ChatMessageProps {
	message: Message;
}

export function ChatMessage({ message, ...props }: ChatMessageProps) {
	return (
		<div className={cn('group relative mb-4 flex items-start')} {...props}>
			<div
				className={cn(
					'flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow',
					message.role === 'user' ? 'bg-background' : 'bg-primary text-primary-foreground',
				)}
			>
				{message.role === 'user' ? <IconUser /> : <IconOpenAI />}
			</div>
			<div className="ml-4 flex-1 space-y-2 overflow-hidden px-1 whitespace-pre-line">{message.content}</div>
		</div>
	);
}
