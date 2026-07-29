// @ts-check
const tseslint = require('typescript-eslint');
const nextConfig = require('eslint-config-next');

module.exports = [
  {
    ignores: [
      '.next/**/*',
      'node_modules/**/*',
      '.history/**/*',
      'public/sw.js',
      'scratch/**/*',
      'scratch_diagnose.js',
      'source_material/**/*',
    ],
  },
  ...nextConfig,
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];
