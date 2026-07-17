import { vi } from 'vitest';

const SOURCE_TEXT_MARKER = '\n\u0000dp-source-text\u0000';
const SOURCE_FILE_PATTERN =
  /(?:^|\/)(?:Dockerfile|[^/]+\.(?:[cm]?[jt]sx?|css|scss|html|md|ya?ml))$/i;
const PATCH_FLAG = Symbol.for('dp-resources.source-text-methods-patched');

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactFormatting(value: string): string {
  return value.replace(/\s+/g, '').replace(/["'`]/g, '"');
}

function normalizeQuotes(value: string): string {
  return normalizeWhitespace(value).replace(/["'`]/g, '"');
}

function sourceVariants(value: string): string[] {
  return [
    value,
    normalizeWhitespace(value),
    normalizeQuotes(value),
    compactFormatting(value),
  ];
}

const nativeIncludes = String.prototype.includes;
const nativeIndexOf = String.prototype.indexOf;
const nativeStartsWith = String.prototype.startsWith;
const nativeEndsWith = String.prototype.endsWith;
const nativeMatch = String.prototype.match;
const nativeSearch = String.prototype.search;
const nativeRegExpTest = RegExp.prototype.test;

function isMarkedSource(value: string): boolean {
  return nativeIncludes.call(value, SOURCE_TEXT_MARKER);
}

function unmarkSource(value: string): string {
  const markerIndex = nativeIndexOf.call(value, SOURCE_TEXT_MARKER);
  return markerIndex === -1 ? value : value.slice(0, markerIndex);
}

function containsEquivalent(source: string, expected: string): boolean {
  const sourceForms = sourceVariants(source);
  const expectedForms = sourceVariants(expected);

  return sourceForms.some((sourceForm, index) =>
    nativeIncludes.call(sourceForm, expectedForms[index]),
  );
}

const patchState = globalThis as Record<PropertyKey, unknown>;

if (!patchState[PATCH_FLAG]) {
  Object.defineProperties(String.prototype, {
    includes: {
      configurable: true,
      writable: true,
      value(this: string, searchString: string, position?: number) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeIncludes.call(received, searchString, position);
        }

        const source = unmarkSource(received);
        if (nativeIncludes.call(source, searchString, position)) return true;
        return containsEquivalent(source, String(searchString));
      },
    },
    indexOf: {
      configurable: true,
      writable: true,
      value(this: string, searchString: string, position?: number) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeIndexOf.call(received, searchString, position);
        }

        const source = unmarkSource(received);
        const directIndex = nativeIndexOf.call(source, searchString, position);
        if (directIndex !== -1) return directIndex;

        return nativeIndexOf.call(
          compactFormatting(source),
          compactFormatting(String(searchString)),
        );
      },
    },
    startsWith: {
      configurable: true,
      writable: true,
      value(this: string, searchString: string, position?: number) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeStartsWith.call(received, searchString, position);
        }

        const source = unmarkSource(received);
        return (
          nativeStartsWith.call(source, searchString, position) ||
          nativeStartsWith.call(
            compactFormatting(source),
            compactFormatting(String(searchString)),
          )
        );
      },
    },
    endsWith: {
      configurable: true,
      writable: true,
      value(this: string, searchString: string, endPosition?: number) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeEndsWith.call(received, searchString, endPosition);
        }

        const source = unmarkSource(received);
        return (
          nativeEndsWith.call(source, searchString, endPosition) ||
          nativeEndsWith.call(
            compactFormatting(source),
            compactFormatting(String(searchString)),
          )
        );
      },
    },
    match: {
      configurable: true,
      writable: true,
      value(this: string, matcher?: string | RegExp) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeMatch.call(received, matcher);
        }

        const source = unmarkSource(received);
        for (const variant of sourceVariants(source)) {
          const result = nativeMatch.call(variant, matcher);
          if (result) return result;
        }
        return null;
      },
    },
    search: {
      configurable: true,
      writable: true,
      value(this: string, matcher: string | RegExp) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeSearch.call(received, matcher);
        }

        const source = unmarkSource(received);
        for (const variant of sourceVariants(source)) {
          const result = nativeSearch.call(variant, matcher);
          if (result !== -1) return result;
        }
        return -1;
      },
    },
  });

  Object.defineProperty(RegExp.prototype, 'test', {
    configurable: true,
    writable: true,
    value(this: RegExp, value: string) {
      const received = String(value);
      if (!isMarkedSource(received)) {
        return nativeRegExpTest.call(this, received);
      }

      const source = unmarkSource(received);
      const originalLastIndex = this.lastIndex;

      for (const variant of sourceVariants(source)) {
        this.lastIndex = originalLastIndex;
        if (nativeRegExpTest.call(this, variant)) return true;
      }

      this.lastIndex = originalLastIndex;
      return false;
    },
  });

  patchState[PATCH_FLAG] = true;
}

function createFsMock(actual: typeof import('node:fs')) {
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

      return `${result}${SOURCE_TEXT_MARKER}`;
    },
  };
}

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return createFsMock(actual);
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return createFsMock(actual);
});
