import { createEventStreamTransformer, trimStartOfStreamHelper } from 'ai';
import { ReadableStream as PolyfillReadableStream } from 'web-streams-polyfill';
import { createReadableStreamWrapper } from '@mattiasbuelens/web-streams-adapter';

// @ts-expect-error bad types
const toPolyfillReadable = createReadableStreamWrapper(PolyfillReadableStream);
const toNativeReadable = createReadableStreamWrapper(ReadableStream);

export class StreamingTextResponse extends Response {
	constructor(res: ReadableStream, init?: ResponseInit) {
		super(res as any, {
			...init,
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				...init?.headers,
			},
		});
	}
}

function parseOpenAIStream(): (data: string) => string | void {
	const trimStartOfStream = trimStartOfStreamHelper();
	return (data) => {
		// TODO: Needs a type
		const json = JSON.parse(data);

		// this can be used for either chat or completion models
		const text = trimStartOfStream(json.choices[0]?.delta?.content ?? json.choices[0]?.text ?? '');

		return text;
	};
}

export function OpenAIStream(response: Response): ReadableStream<any> {
	if (!response.ok || !response.body) {
		throw new Error(`Failed to convert the response to stream. Received status code: ${response.status}.`);
	}

	const responseBodyStream = toPolyfillReadable(response.body);

	// @ts-expect-error bad types
	return toNativeReadable(responseBodyStream.pipeThrough(createEventStreamTransformer(parseOpenAIStream())));
}
