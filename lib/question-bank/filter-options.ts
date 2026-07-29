export type PaperOption = {
  id: string;
  reference: string;
};

function paperKey(reference: string) {
  return String(reference || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

/**
 * Imported question-bank data can contain several database paper rows with the
 * same user-facing reference. Keep the first stable ID for filtering, but only
 * show each visible paper label once.
 */
export function dedupePaperOptions(papers: PaperOption[]) {
  const seen = new Set<string>();
  const options: PaperOption[] = [];

  for (const paper of papers) {
    const reference = String(paper.reference || '').trim().replace(/\s+/g, ' ');
    const key = paperKey(reference);
    if (!reference || seen.has(key)) continue;
    seen.add(key);
    options.push({ ...paper, reference });
  }

  return options;
}
