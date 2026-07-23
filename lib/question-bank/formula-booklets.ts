const RESOURCE_IDS = {
  physics: '1WxDMiuD6WpwVvamNPelQDn9Ufffwz8SM',
  business: '1VdwxdTi5-6JmCE3z8iLS9ma4VKLwv7y2',
  mathematicsAA: '1A0F8SCPR8whap1OIdkodE5ZHndySbHFJ',
  mathematicsAI: '1sjYffCiItZVxkzL7eqCjQjjavmAUNWja',
} as const;

export function nativeFormulaBookletUrl(
  subjectSlug: string | null | undefined,
  courseSlug: string | null | undefined,
) {
  if (subjectSlug === 'physics') {
    return `/resource/${RESOURCE_IDS.physics}`;
  }
  if (subjectSlug === 'business') {
    return `/resource/${RESOURCE_IDS.business}`;
  }
  if (subjectSlug !== 'mathematics' || !courseSlug) return null;
  if (courseSlug.startsWith('analysis-and-approaches-')) {
    return `/resource/${RESOURCE_IDS.mathematicsAA}`;
  }
  if (courseSlug.startsWith('applications-and-interpretation-')) {
    return `/resource/${RESOURCE_IDS.mathematicsAI}`;
  }
  return null;
}
