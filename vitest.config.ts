import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
      '@/components/question-bank/question-content': path.resolve(
        __dirname,
        'components/question-bank/question-content-routed.tsx',
      ),
      '@': path.resolve(__dirname),
    },
  },
  test: {
    setupFiles: ['tests/setup/source-text-normalization.mjs'],
  },
});
