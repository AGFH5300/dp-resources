const REPORT_MEDIA =
  /(?:!\[[^\]]*\]\([^)]*\)|\((?:examiner_report|content_reference):[0-9a-f-]{36}\)|<(?:img|audio|video|table)\b)/i;

const EMPTY_REPORT_PHRASES =
  /\b(?:n\s*\/\s*a|not\s+(?:available|applicable)|no\s+examiner\s+report(?:\s+available)?)\b/giu;

const PART_LABEL_PREFIXES =
  /(^|\n)\s*(?:(?:[*_]{1,2}\s*)?(?:\((?:[a-z]|\d{1,3}|[ivxlcdm]{1,5})\)|(?:[a-z]|\d{1,3}|[ivxlcdm]{1,5})[.)])(?:\s*[*_]{1,2})?\s*)+/giu;

/**
 * Imported archives occasionally contain a non-empty examiner-report field
 * made only of N/A placeholders and part labels. Treat those as absent while
 * retaining reports made from prose, numbers, maths, tables, or media.
 */
export function hasSubstantiveExaminerReport(
  source: string | null | undefined,
) {
  const value = String(source || '').trim();
  if (!value) return false;
  if (REPORT_MEDIA.test(value)) return true;

  const withoutPlaceholders = value
    .replace(PART_LABEL_PREFIXES, '$1')
    .replace(/\\?\[\s*n\s*\/\s*a\s*\\?\]/giu, ' ')
    .replace(EMPTY_REPORT_PHRASES, ' ')
    .replace(/<[^>]*>/g, ' ');

  if (
    /(?:\\\[|\\\(|\$\$|\$[^$]+\$)/.test(withoutPlaceholders) &&
    /[\p{L}\p{N}]/u.test(withoutPlaceholders)
  )
    return true;

  const words = withoutPlaceholders.match(/[\p{L}\p{N}]+/gu) || [];
  return words.some((word) => /\d/u.test(word) || word.length > 1);
}
