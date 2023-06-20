// Require the framework and instantiate it
import fastify from 'fastify';
import cors from '@fastify/cors';
// @ts-expect-error bad types from openai-edge
import { Configuration, OpenAIApi } from 'openai-edge';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import fastifyWebResponse from 'fastify-web-response';
import z from 'zod';

const app = fastify({ logger: true });

const config = new Configuration({
	apiKey: process.env.OPENAI_API_KEY ?? '',
});
const openai = new OpenAIApi(config);

// @ts-expect-error bad types from fastify-web-response
app.register(fastifyWebResponse);
app.register(cors);

// Declare a route
app.post('/api/chat', async (request) => {
	// @ts-expect-error parse body as json
	const body = JSON.parse(request.body);
	console.log(body);
	const response = await openai.createChatCompletion({
		model: 'gpt-4',
		stream: true,
		messages: body.messages,
	});
	const stream = OpenAIStream(response);

	return new StreamingTextResponse(stream);
});

// Run the server!
const start = async () => {
	try {
		await app.listen({ port: z.coerce.number().default(8090).parse(process.env.PORT) });
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
};
start();
