const ATTRIBUTION_LINE = /revision\s+village.*created\s+with\s+chemix/i;
const STYLE_ATTRIBUTE = /\{\s*style\s*=\s*(?:"[^"]*"|'[^']*')\s*\}/gi;
const MAXIMUM_MARK_LINE =
  /^\s*\\*\[\s*maximum\s+marks?\s*:\s*\d+\s*\\*\]\s*$/i;
const STANDALONE_MATH_DELIMITER = /^\s*\$\s*$/;
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

function normalizeStandaloneMath(lines: string[]) {
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!STANDALONE_MATH_DELIMITER.test(lines[index])) {
      output.push(lines[index]);
      continue;
    }

    let firstContent = index + 1;
    while (firstContent < lines.length && !lines[firstContent].trim())
      firstContent += 1;

    // Imported display maths sometimes arrives as a line containing only `$`,
    // followed by a LaTeX command and a second `$` line. Convert that pair to a
    // proper display-math block. A lone `$` beside an answer choice is debris and
    // is deliberately discarded instead of being printed to the user.
    if (
      firstContent >= lines.length ||
      !/^\\[A-Za-z]+/.test(lines[firstContent].trim())
    )
      continue;

    let closing = firstContent + 1;
    while (closing < lines.length) {
      const value = lines[closing].trim();
      if (STANDALONE_MATH_DELIMITER.test(lines[closing])) break;
      if (/^:{1,3}[a-z]/i.test(value) || /^[-*]\s+[A-H][.)]/i.test(value)) {
        closing = -1;
        break;
      }
      closing += 1;
    }

    if (closing <= firstContent || closing >= lines.length) continue;

    output.push('$$', ...lines.slice(index + 1, closing), '$$');
    index = closing;
  }

  return output;
}

export function normalizeQuestionSource(value: string) {
  const lines = String(value || '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .filter(
      (line) =>
        !ATTRIBUTION_LINE.test(line) && !MAXIMUM_MARK_LINE.test(line),
    );

  return readableExponents(
    normalizeStandaloneMath(lines)
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
