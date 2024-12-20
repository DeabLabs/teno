/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
	tailwind: true,
	ignoredRouteFiles: ['**/.*'],
	// When running locally in development mode, we use the built-in remix
	// server. This does not understand the vercel lambda module format,
	// so we default back to the standard build output.
	serverBuildPath: 'api/index.js',
	serverDependenciesToBundle: ['database', 'kv', 'llm'],
	// appDirectory: "app",
	// assetsBuildDirectory: "public/build",
	// publicPath: "/build/",
	future: {
		v2_errorBoundary: true,
		v2_headers: true,
		v2_meta: true,
		v2_normalizeFormMethod: true,
		v2_routeConvention: true,
	},
	serverModuleFormat: 'cjs',
};
