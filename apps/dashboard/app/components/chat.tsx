import { useChat, type Message } from 'ai/react';

import { cn } from '@/lib/utils';

import { ChatScrollAnchor } from './chat-scroll-anchor';
import { EmptyScreen } from './empty-screen';
import { ChatList } from './chat-list';
import { ChatPanel } from './chat-panel';

export interface ChatProps extends React.ComponentProps<'div'> {
	initialMessages?: Message[];
	id?: string;
	meeting: {
		name: string;
		transcript: {
			redisKey: string;
		};
	};
}

export function Chat({ id, initialMessages, className, meeting }: ChatProps) {
	const { messages, append, reload, stop, isLoading, input, setInput } = useChat({
		api: '/api/chat',
		headers: {
			'Content-Type': 'application/json',
		},
		initialMessages,
		id,
		body: {
			id,
			transcriptId: meeting.transcript.redisKey,
		},
	});
	return (
		<>
			<div className={cn('pb-[200px] pt-4 md:pt-10', className)}>
				{messages.length ? (
					<>
						<ChatList messages={messages} />
						<ChatScrollAnchor trackVisibility={isLoading} />
					</>
				) : (
					<EmptyScreen setInput={setInput} meeting={meeting} />
				)}
			</div>
			<ChatPanel
				id={id}
				isLoading={isLoading}
				stop={stop}
				append={append}
				reload={reload}
				messages={messages}
				input={input}
				setInput={setInput}
			/>
		</>
	);
}
