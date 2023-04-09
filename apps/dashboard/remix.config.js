/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
	ignoredRouteFiles: ['**/.*'],
	// appDirectory: "app",
	// assetsBuildDirectory: "public/build",
	// serverBuildPath: "build/index.js",
	// publicPath: "/build/",
	serverDependenciesToBundle: ['database', 'kv'],
	future: {
		v2_errorBoundary: true,
		v2_meta: true,
		v2_normalizeFormMethod: true,
		v2_routeConvention: true,
		unstable_tailwind: true,
	},
};
