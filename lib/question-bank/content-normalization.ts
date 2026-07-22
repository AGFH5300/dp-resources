const ATTRIBUTION_LINE = /revision\s+village.*created\s+with\s+chemix/i;
const STYLE_ATTRIBUTE = /\{\s*style\s*=\s*(?:"[^"]*"|'[^']*')\s*\}/gi;

export function normalizeQuestionSource(value: string) {
  return String(value || '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .filter((line) => !ATTRIBUTION_LINE.test(line))
    .join('\n')
    .replace(STYLE_ATTRIBUTE, '')
    .replace(/^\s*]\s*$/gm, '')
    .replace(/\\hspace\s*(?:\{\s*[^}]*\}|[\d.]+(?:em|ex|px|pt|cm|mm|in)?)/gi, ' ')
    .replace(/\bhspace\s*\{?\s*[\d.]+(?:em|ex|px|pt|cm|mm|in)?\}?/gi, ' ')
    .replace(/(^|[^\\])\\(?=\s)/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function questionPreview(value: string) {
  return normalizeQuestionSource(value)
    .replace(/!\[[^\]]*\]\(question:[^)]+\)/gi, ' Diagram. ')
    .replace(/:{1,3}[a-z]+(?:\[[^\]]*\])?/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\hspace/gi, ' ')
    .replace(/[*_$\\{}\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
