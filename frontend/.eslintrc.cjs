module.exports = {
	root: true,
	env: { browser: true, es2020: true },
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:react-hooks/recommended',
	],
	ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'vite.config.ts'],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
		ecmaFeatures: { jsx: true },
	},
	plugins: ['@typescript-eslint', 'react-refresh'],
	rules: {
		'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
		// Deliberate in this codebase: `catch { }` swallowing a 404 is meaningful.
		'@typescript-eslint/no-empty-function': 'off',
		// The house style indents with a tab and continues with spaces. Enforcing this
		// rule would mean reformatting every file for no functional gain.
		'no-mixed-spaces-and-tabs': 'off',
	},
	overrides: [
		{
			// Context modules intentionally export a provider component alongside its hook.
			// Splitting them to satisfy fast-refresh would be churn for no benefit.
			files: ['src/contexts/**/*.tsx'],
			rules: { 'react-refresh/only-export-components': 'off' },
		},
	],
}
