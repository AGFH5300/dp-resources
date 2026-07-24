const RESOURCE_IDS = {
  biology2025: '1am8ATcSW_HtxyD9LtwTj0nE8DdM-vpES',
  business: '1VdwxdTi5-6JmCE3z8iLS9ma4VKLwv7y2',
  chemistry2025: '1C7tYritD2g7zVHXt1376HFuQstwaaZJZ',
  physics: '1WxDMiuD6WpwVvamNPelQDn9Ufffwz8SM',
  mathematicsAA: '1A0F8SCPR8whap1OIdkodE5ZHndySbHFJ',
  mathematicsAI: '1sjYffCiItZVxkzL7eqCjQjjavmAUNWja',
} as const;

export const nativeBookletCoverage = [
  {
    name: 'Mathematics: Analysis and Approaches',
    status: 'native',
    statusLabel: 'Native',
    note: 'SL and HL open the formula booklet stored inside the DP Resources Library.',
  },
  {
    name: 'Mathematics: Applications and Interpretation',
    status: 'native',
    statusLabel: 'Native',
    note: 'SL and HL open the formula booklet stored inside the DP Resources Library.',
  },
  {
    name: 'Business Management',
    status: 'native',
    statusLabel: 'Native',
    note: 'The formulae sheet opens as a DP Resources Library file.',
  },
  {
    name: 'Chemistry · first assessment 2025',
    status: 'native',
    statusLabel: 'Native',
    note: 'The current Chemistry data booklet opens as a DP Resources Library file.',
  },
  {
    name: 'Physics · first assessment 2025',
    status: 'review',
    statusLabel: 'Native · cleaner copy needed',
    note: 'The link is internal, but the stored copy is annotated rather than a clean examination copy.',
  },
  {
    name: 'Chemistry · final assessment 2024',
    status: 'missing',
    statusLabel: 'Not linked yet',
    note: 'A correct legacy Chemistry data booklet still needs to be stored and connected.',
  },
  {
    name: 'Physics · final assessment 2024',
    status: 'missing',
    statusLabel: 'Not linked yet',
    note: 'The legacy course no longer opens the 2025 booklet; it needs its own correct native booklet.',
  },
  {
    name: 'Biology · first assessment 2025',
    status: 'not-applicable',
    statusLabel: 'Not linked',
    note: 'The available Drive booklet is marked first assessment 2028, so it is deliberately not attached to the 2025 course.',
  },
] as const;

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
