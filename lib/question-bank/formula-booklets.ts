const RESOURCE_IDS = {
  biology2025: '1am8ATcSW_HtxyD9LtwTj0nE8DdM-vpES',
  business: '1VdwxdTi5-6JmCE3z8iLS9ma4VKLwv7y2',
  chemistry2025: '1C7tYritD2g7zVHXt1376HFuQstwaaZJZ',
  physics: '1WxDMiuD6WpwVvamNPelQDn9Ufffwz8SM',
  mathematicsAA: '1A0F8SCPR8whap1OIdkodE5ZHndySbHFJ',
  mathematicsAI: '1sjYffCiItZVxkzL7eqCjQjjavmAUNWja',
} as const;

function resourceUrl(resourceId: string) {
  return `/resource/${resourceId}`;
}

export function nativeFormulaBookletUrl(
  subjectSlug: string | null | undefined,
  courseSlug: string | null | undefined,
) {
  if (!subjectSlug || !courseSlug) return null;

  if (subjectSlug === 'biology' && courseSlug.endsWith('-2025')) {
    return resourceUrl(RESOURCE_IDS.biology2025);
  }
  if (subjectSlug === 'business') {
    return resourceUrl(RESOURCE_IDS.business);
  }
  if (subjectSlug === 'chemistry' && courseSlug.endsWith('-2025')) {
    return resourceUrl(RESOURCE_IDS.chemistry2025);
  }
  if (subjectSlug === 'physics') {
    return resourceUrl(RESOURCE_IDS.physics);
  }
  if (subjectSlug !== 'mathematics') return null;
  if (courseSlug.startsWith('analysis-and-approaches-')) {
    return resourceUrl(RESOURCE_IDS.mathematicsAA);
  }
  if (courseSlug.startsWith('applications-and-interpretation-')) {
    return resourceUrl(RESOURCE_IDS.mathematicsAI);
  }
  return null;
}
