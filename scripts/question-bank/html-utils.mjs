const NAMED_ENTITIES = new Map([
  ['nbsp', ' '],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

function isAsciiDigit(character) {
  return character >= '0' && character <= '9';
}

function isHexDigit(character) {
  const lower = character.toLowerCase();
  return isAsciiDigit(character) || (lower >= 'a' && lower <= 'f');
}

function decodeEntityBody(body) {
  const lower = body.toLowerCase();
  if (NAMED_ENTITIES.has(lower)) return NAMED_ENTITIES.get(lower);

  let radix = 10;
  let digits = body;
  if (body.startsWith('#x') || body.startsWith('#X')) {
    radix = 16;
    digits = body.slice(2);
    if (!digits || ![...digits].every(isHexDigit)) return null;
  } else if (body.startsWith('#')) {
    digits = body.slice(1);
    if (!digits || ![...digits].every(isAsciiDigit)) return null;
  } else {
    return null;
  }

  const codePoint = Number.parseInt(digits, radix);
  if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff)
    return null;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return null;
  }
}

/** Decode one layer of the small HTML entity set used by captured question data. */
export function decodeHtmlEntitiesOnce(value) {
  const input = String(value || '');
  let output = '';
  let cursor = 0;

  while (cursor < input.length) {
    if (input[cursor] !== '&') {
      output += input[cursor++];
      continue;
    }

    const semicolon = input.indexOf(';', cursor + 1);
    if (semicolon < 0 || semicolon - cursor > 32) {
      output += input[cursor++];
      continue;
    }

    const decoded = decodeEntityBody(input.slice(cursor + 1, semicolon));
    if (decoded === null) {
      output += input[cursor++];
      continue;
    }

    output += decoded;
    cursor = semicolon + 1;
  }

  return output;
}

function findTagEnd(source, start) {
  let quote = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index;
  }
  return -1;
}

function readTag(source, start) {
  const end = findTagEnd(source, start);
  if (end < 0) return null;
  const raw = source.slice(start + 1, end);
  let cursor = 0;
  while (cursor < raw.length && /\s/.test(raw[cursor])) cursor += 1;
  const closing = raw[cursor] === '/';
  if (closing) cursor += 1;
  while (cursor < raw.length && /\s/.test(raw[cursor])) cursor += 1;
  const nameStart = cursor;
  while (cursor < raw.length) {
    const character = raw[cursor].toLowerCase();
    if (
      (character >= 'a' && character <= 'z') ||
      (character >= '0' && character <= '9') ||
      character === ':' ||
      character === '-'
    ) {
      cursor += 1;
      continue;
    }
    break;
  }
  return {
    end,
    closing,
    name: raw.slice(nameStart, cursor).toLowerCase(),
  };
}

export function removeHtmlComments(value) {
  const source = String(value || '');
  let output = '';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<!--', cursor);
    if (start < 0) {
      output += source.slice(cursor);
      break;
    }
    output += source.slice(cursor, start);
    const end = source.indexOf('-->', start + 4);
    if (end < 0) break;
    cursor = end + 3;
  }
  return output;
}

function skipElement(source, openingTag, name) {
  const lower = source.toLowerCase();
  const closingStart = lower.indexOf(`</${name}`, openingTag.end + 1);
  if (closingStart < 0) return source.length;
  const closingTag = readTag(source, closingStart);
  return closingTag ? closingTag.end + 1 : source.length;
}

const BLOCK_TAGS = new Set(['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const IGNORED_ELEMENTS = new Set(['script', 'style', 'iframe', 'object']);

/** Convert captured HTML to text using a small tokenizer instead of regex filtering. */
export function htmlToPlainText(
  value,
  { imagePlaceholder = '', preserveBlockBreaks = false } = {},
) {
  const source = removeHtmlComments(value);
  let output = '';
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] !== '<') {
      output += source[cursor++];
      continue;
    }

    const tag = readTag(source, cursor);
    if (!tag || !tag.name) {
      output += source[cursor++];
      continue;
    }

    if (!tag.closing && IGNORED_ELEMENTS.has(tag.name)) {
      cursor = skipElement(source, tag, tag.name);
      continue;
    }

    if (!tag.closing && tag.name === 'img' && imagePlaceholder) {
      output += ` ${imagePlaceholder} `;
    } else if (tag.name === 'br' || (tag.closing && BLOCK_TAGS.has(tag.name))) {
      output += preserveBlockBreaks ? '\n' : ' ';
    }
    cursor = tag.end + 1;
  }

  const decoded = decodeHtmlEntitiesOnce(output);
  if (!preserveBlockBreaks) return decoded.replace(/\s+/g, ' ').trim();
  return decoded
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
