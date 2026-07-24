import nextPlugin from '@next/eslint-plugin-next';

const nextRecommendedWarnings = Object.fromEntries(
  Object.keys(nextPlugin.configs.recommended.rules).map((ruleName) => [
    ruleName,
    'warn',
  ]),
);

export default [
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: nextRecommendedWarnings,
  },
];
