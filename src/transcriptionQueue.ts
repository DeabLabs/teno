type TranscriptionTask = () => Promise<void>;

export class TranscriptionQueue {
	private readonly queue: TranscriptionTask[] = [];
	private isProcessing = false;

	public async add(task: TranscriptionTask): Promise<void> {
		this.queue.push(task);
		if (!this.isProcessing) {
			await this.processQueue();
		}
	}

	private async processQueue(): Promise<void> {
		this.isProcessing = true;
		while (this.queue.length > 0) {
			const task = this.queue.shift();
			if (task) {
				await task();
			}
		}
		this.isProcessing = false;
	}
}
