const ATTRIBUTION_LINE = /revision\s+village.*created\s+with\s+chemix/i;
const STYLE_ATTRIBUTE = /\{\s*style\s*=\s*(?:"[^"]*"|'[^']*')\s*\}/gi;
const MAXIMUM_MARK_LINE = /^\s*\[\s*maximum\s+marks?\s*:\s*\d+\s*\\*\]\s*$/i;
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '−': '⁻',
  '–': '⁻',
};

function readableExponents(value: string) {
  return value.replace(/\^\(([−–-]?\d+)\)/g, (_match, exponent: string) =>
    [...exponent].map((character) => SUPERSCRIPT[character] || character).join(''),
  );
}

export function normalizeQuestionSource(value: string) {
  return readableExponents(
    String(value || '')
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .split('\n')
      .filter(
        (line) =>
          !ATTRIBUTION_LINE.test(line) && !MAXIMUM_MARK_LINE.test(line),
      )
      .join('\n')
      .replace(STYLE_ATTRIBUTE, '')
      .replace(/^\s*]\s*$/gm, '')
      .replace(
        /\\hspace\s*(?:\{\s*[^}]*\}|[\d.]+(?:em|ex|px|pt|cm|mm|in)?)/gi,
        ' ',
      )
      .replace(
        /\bhspace\s*\{?\s*[\d.]+(?:em|ex|px|pt|cm|mm|in)?\}?/gi,
        ' ',
      )
      .replace(/\\+\[([^\]\n]+?)\\+\]/g, '[$1]')
      .replace(/\\+=/g, '=')
      .replace(/[«»≪≫]/g, '')
      .replace(/(^|[^\\])\\(?=\s)/g, '$1')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

export function questionPreview(value: string) {
  return normalizeQuestionSource(value)
    .replace(/!\[[^\]]*\]\(question:[^)]+\)/gi, ' Diagram. ')
    .replace(/:{1,3}[a-z]+(?:\[[^\]]*\])?/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|?\s*:?-{2,}:?\s*(?=\||$)/g, ' ')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\\hspace/gi, ' ')
    .replace(/[*_$\\{}\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
