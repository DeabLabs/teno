import { defineConfig } from 'tsup';

export default defineConfig({
	clean: true,
	dts: true,
	entry: ['src/bot.ts'],
	format: ['esm'],
	target: 'node18',
});
