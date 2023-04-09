/** @type {import('eslint').Linter.Config} */
module.exports = {
	extends: [
		'@remix-run/eslint-config',
		'@remix-run/eslint-config/node',
		'plugin:@dword-design/eslint-plugin-import-alias/recommended',
	],
	rules: {
		'import/order': [
			'error',
			{
				groups: ['builtin', 'external', 'internal', 'index'],
				'newlines-between': 'always',
			},
		],
		'@dword-design/import-alias/prefer-alias': [
			'error',
			{
				alias: {
					'@': './app',
				},
			},
		],
		'@typescript-eslint/consistent-type-imports': [
			'error',
			{
				prefer: 'type-imports',
				fixStyle: 'separate-type-imports',
			},
		],
	},
};
