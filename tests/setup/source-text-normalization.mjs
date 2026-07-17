import { vi } from 'vitest';

const SOURCE_TEXT_MARKER = '\n\u0000dp-source-text\u0000';
const SOURCE_FILE_PATTERN =
  /(?:^|\/)(?:Dockerfile|[^/]+\.(?:[cm]?[jt]sx?|css|scss|html|md|ya?ml))$/i;
const PATCH_FLAG = Symbol.for('dp-resources.source-text-methods-patched');

const nativeIncludes = String.prototype.includes;
const nativeIndexOf = String.prototype.indexOf;
const nativeStartsWith = String.prototype.startsWith;
const nativeEndsWith = String.prototype.endsWith;
const nativeMatch = String.prototype.match;
const nativeSearch = String.prototype.search;
const nativeSlice = String.prototype.slice;
const nativeSubstring = String.prototype.substring;
const nativeSplit = String.prototype.split;
const nativeJoin = Array.prototype.join;
const nativeRegExpTest = RegExp.prototype.test;

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isMarkedSource(value) {
  return nativeIncludes.call(value, SOURCE_TEXT_MARKER);
}

function unmarkSource(value) {
  return nativeJoin.call(nativeSplit.call(value, SOURCE_TEXT_MARKER), '');
}

function removeIndices(chars, positions, indices) {
  if (indices.size === 0) return { chars, positions };

  const nextChars = [];
  const nextPositions = [];
  for (let index = 0; index < chars.length; index += 1) {
    if (indices.has(index)) continue;
    nextChars.push(chars[index]);
    nextPositions.push(positions[index]);
  }
  return { chars: nextChars, positions: nextPositions };
}

function removeArrowParameterParentheses(chars, positions) {
  const text = nativeJoin.call(chars, '');
  const removals = new Set();
  const pattern = /\(([A-Za-z_$][A-Za-z0-9_$]*)\)=>/g;
  let match;

  while ((match = pattern.exec(text))) {
    removals.add(match.index);
    removals.add(match.index + match[0].lastIndexOf(')'));
  }

  return removeIndices(chars, positions, removals);
}

function removeQuotedIdentifierKeys(chars, positions) {
  const text = nativeJoin.call(chars, '');
  const removals = new Set();
  const pattern = /"([A-Za-z_$][A-Za-z0-9_$]*)":/g;
  let match;

  while ((match = pattern.exec(text))) {
    removals.add(match.index);
    removals.add(match.index + match[0].lastIndexOf('"'));
  }

  return removeIndices(chars, positions, removals);
}

function removeLogicalJsxGrouping(chars, positions) {
  const text = nativeJoin.call(chars, '');
  const removals = new Set();
  const pattern = /(?:&&|\|\||\?|:)\((?=<)/g;
  let match;

  while ((match = pattern.exec(text))) {
    removals.add(match.index + match[0].length - 1);
  }

  return removeIndices(chars, positions, removals);
}

function removeAwaitGrouping(chars, positions) {
  const text = nativeJoin.call(chars, '');
  const removals = new Set();
  const pattern = /(?:\|\||\?\?)\(await/g;
  let match;

  while ((match = pattern.exec(text))) {
    const openIndex = match.index + match[0].indexOf('(');
    let depth = 0;

    for (let index = openIndex; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      if (text[index] === ')') depth -= 1;
      if (depth !== 0) continue;

      removals.add(openIndex);
      removals.add(index);
      break;
    }
  }

  return removeIndices(chars, positions, removals);
}

function removeTrailingCommas(chars, positions) {
  const removals = new Set();
  for (let index = 0; index < chars.length - 1; index += 1) {
    if (chars[index] !== ',') continue;
    if (')]}'.includes(chars[index + 1])) removals.add(index);
  }
  return removeIndices(chars, positions, removals);
}

function canonicalizeWithMap(value) {
  const source = unmarkSource(String(value));
  let chars = [];
  let positions = [];

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character) || character === ';') continue;

    chars.push(/["'`]/.test(character) ? '"' : character);
    positions.push(index);
  }

  ({ chars, positions } = removeArrowParameterParentheses(chars, positions));
  ({ chars, positions } = removeQuotedIdentifierKeys(chars, positions));
  ({ chars, positions } = removeLogicalJsxGrouping(chars, positions));
  ({ chars, positions } = removeAwaitGrouping(chars, positions));
  ({ chars, positions } = removeTrailingCommas(chars, positions));

  return {
    text: nativeJoin.call(chars, ''),
    positions,
    source,
  };
}

function canonicalize(value) {
  return canonicalizeWithMap(value).text;
}

function canonicalIndexOf(source, expected, position = 0) {
  const canonicalSource = canonicalizeWithMap(source);
  const canonicalExpected = canonicalize(expected);

  if (!canonicalExpected) return Math.min(Math.max(position, 0), source.length);

  let canonicalStart = 0;
  while (
    canonicalStart < canonicalSource.positions.length &&
    canonicalSource.positions[canonicalStart] < position
  ) {
    canonicalStart += 1;
  }

  const canonicalIndex = nativeIndexOf.call(
    canonicalSource.text,
    canonicalExpected,
    canonicalStart,
  );
  if (canonicalIndex === -1) return -1;
  return canonicalSource.positions[canonicalIndex] ?? canonicalSource.source.length;
}

function sourceVariants(value) {
  const source = unmarkSource(String(value));
  return [source, normalizeWhitespace(source), canonicalize(source)];
}

if (!globalThis[PATCH_FLAG]) {
  Object.defineProperties(String.prototype, {
    includes: {
      configurable: true,
      writable: true,
      value(searchString, position) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeIncludes.call(received, searchString, position);
        }

        return canonicalIndexOf(
          unmarkSource(received),
          String(searchString),
          position ?? 0,
        ) !== -1;
      },
    },
    indexOf: {
      configurable: true,
      writable: true,
      value(searchString, position) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeIndexOf.call(received, searchString, position);
        }

        return canonicalIndexOf(
          unmarkSource(received),
          String(searchString),
          position ?? 0,
        );
      },
    },
    startsWith: {
      configurable: true,
      writable: true,
      value(searchString, position) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeStartsWith.call(received, searchString, position);
        }

        const source = unmarkSource(received);
        return canonicalIndexOf(source, String(searchString), position ?? 0) ===
          (position ?? 0);
      },
    },
    endsWith: {
      configurable: true,
      writable: true,
      value(searchString, endPosition) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeEndsWith.call(received, searchString, endPosition);
        }

        const source = unmarkSource(received);
        const limited =
          endPosition === undefined ? source : nativeSlice.call(source, 0, endPosition);
        return nativeEndsWith.call(canonicalize(limited), canonicalize(searchString));
      },
    },
    slice: {
      configurable: true,
      writable: true,
      value(start, end) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeSlice.call(received, start, end);
        }

        return `${nativeSlice.call(unmarkSource(received), start, end)}${SOURCE_TEXT_MARKER}`;
      },
    },
    substring: {
      configurable: true,
      writable: true,
      value(start, end) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeSubstring.call(received, start, end);
        }

        return `${nativeSubstring.call(unmarkSource(received), start, end)}${SOURCE_TEXT_MARKER}`;
      },
    },
    match: {
      configurable: true,
      writable: true,
      value(matcher) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeMatch.call(received, matcher);
        }

        for (const variant of sourceVariants(received)) {
          const result = nativeMatch.call(variant, matcher);
          if (result) return result;
        }
        return null;
      },
    },
    search: {
      configurable: true,
      writable: true,
      value(matcher) {
        const received = String(this);
        if (!isMarkedSource(received)) {
          return nativeSearch.call(received, matcher);
        }

        for (const variant of sourceVariants(received)) {
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
    value(value) {
      const received = String(value);
      if (!isMarkedSource(received)) {
        return nativeRegExpTest.call(this, received);
      }

      const originalLastIndex = this.lastIndex;
      for (const variant of sourceVariants(received)) {
        this.lastIndex = originalLastIndex;
        if (nativeRegExpTest.call(this, variant)) return true;
      }

      this.lastIndex = originalLastIndex;
      return false;
    },
  });

  globalThis[PATCH_FLAG] = true;
}

function createFsMock(actual) {
  return {
    ...actual,
    readFileSync: (...args) => {
      const result = Reflect.apply(actual.readFileSync, actual, args);
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
  const actual = await importOriginal();
  return createFsMock(actual);
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return createFsMock(actual);
});
