import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
      '@/components/question-bank/question-content': path.resolve(
        __dirname,
        'components/question-bank/question-content-production.tsx',
      ),
      '@/lib/question-bank/interactive': path.resolve(
        __dirname,
        'lib/question-bank/interactive-validated.ts',
      ),
      '@': path.resolve(__dirname),
    },
  },
  test: {
    setupFiles: ['tests/setup/source-text-normalization.mjs'],
  },
});
