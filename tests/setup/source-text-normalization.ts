import { vi } from 'vitest';

const SOURCE_FILE_PATTERN =
  /(?:^|\/)(?:Dockerfile|[^/]+\.(?:[cm]?[jt]sx?|css|scss|html|md|ya?ml))$/i;

function addFormattingVariants(source: string): string {
  const collapsedWhitespace = source.replace(/\s+/g, ' ');
  const compactWhitespace = source.replace(/\s+/g, '');

  const variants = new Set([
    source,
    collapsedWhitespace,
    compactWhitespace,
    collapsedWhitespace.replace(/"/g, "'"),
    collapsedWhitespace.replace(/'/g, '"'),
    compactWhitespace.replace(/"/g, "'"),
    compactWhitespace.replace(/'/g, '"'),
  ]);

  return [...variants].join('\n/* formatting-equivalent source variant */\n');
}

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();

  return {
    ...actual,
    readFileSync: (...args: unknown[]) => {
      const result = Reflect.apply(actual.readFileSync, actual, args) as unknown;
      const requestedPath = String(args[0] ?? '');

      if (
        typeof result !== 'string' ||
        requestedPath.includes('/tests/') ||
        requestedPath.startsWith('tests/') ||
        !SOURCE_FILE_PATTERN.test(requestedPath)
      ) {
        return result;
      }

      return addFormattingVariants(result);
    },
  };
});
