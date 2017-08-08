module.exports = {
	extends: "studiokit",
	env: {
		commonjs: true
	},
	rules: {
		'prettier/prettier': [
			'error',
			{
				singleQuote: true,
				useTabs: true,
				semi: true,
				printWidth: 100
			}
		]
	}
}
