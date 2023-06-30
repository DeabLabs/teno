import { type Message } from 'ai';

import { ChatMessage } from './chat-message';
import { Separator } from './ui/separator';

export interface ChatListProps {
	messages: Message[];
}

export function ChatList({ messages }: ChatListProps) {
	if (!messages.length) {
		return null;
	}

	return (
		<div className="relative mx-auto max-w-2xl px-4">
			<Separator className="my-4 md:my-8" />

			{messages.map((message, index) => (
				<div key={index}>
					<ChatMessage message={message} />
					{index < messages.length - 1 && <Separator className="my-4 md:my-8" />}
				</div>
			))}
		</div>
	);
}
