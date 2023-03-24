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
		console.log('Processing queue', this.queue.length);
		this.isProcessing = true;
		while (this.queue.length > 0) {
			const task = this.queue.shift();
			console.log('Items left', this.queue.length);
			if (task) {
				await task();
			}
		}
		this.isProcessing = false;
	}
}
