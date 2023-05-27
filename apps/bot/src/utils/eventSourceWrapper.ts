import EventSource from 'eventsource';

export class EventSourceWrapper {
	private eventSource: EventSource | null = null;
	private attempts = 0;
	private maxAttempts = 5;

	constructor(
		private url: string,
		private headers: { [key: string]: string },
		private onMessage: (message: string) => void,
		private onError: (error: Event) => void,
	) {}

	connect() {
		if (this.eventSource) {
			this.eventSource.close();
		}

		this.eventSource = new EventSource(this.url, { headers: this.headers });

		this.eventSource.onmessage = (event) => {
			this.onMessage(event.data);
		};

		this.eventSource.onerror = (error) => {
			if (this.eventSource?.readyState === EventSource.CLOSED) {
				console.log('Connection was closed');
			} else {
				console.error('EventSource failed:', error);
				this.onError(error);
				if (error.status === 503) {
					// Try to reconnect
					this.reconnect();
				}
			}
		};
	}

	disconnect() {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
	}

	private reconnect() {
		if (this.attempts < this.maxAttempts) {
			console.log(`Reconnection attempt ${this.attempts + 1}`);
			this.attempts++;
			setTimeout(() => this.connect(), 10000); // Retry every 10 seconds
		} else {
			console.log('Max reconnection attempts reached. Stopping retries and closing.');
			this.disconnect();
		}
	}

	getEventSource() {
		return this.eventSource;
	}
}
