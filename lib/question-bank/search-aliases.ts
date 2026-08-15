export type QuestionSearchAlias = {
  query: string;
  label: string | null;
};

const MATHS_COURSE_ALIASES: Record<string, { slug: string; label: string }> = {
  aahl: {
    slug: 'analysis-and-approaches-hl',
    label: 'Mathematics: Analysis and Approaches HL',
  },
  aasl: {
    slug: 'analysis-and-approaches-sl',
    label: 'Mathematics: Analysis and Approaches SL',
  },
  aihl: {
    slug: 'applications-and-interpretation-hl',
    label: 'Mathematics: Applications and Interpretation HL',
  },
  aisl: {
    slug: 'applications-and-interpretation-sl',
    label: 'Mathematics: Applications and Interpretation SL',
  },
  aahigherlevel: {
    slug: 'analysis-and-approaches-hl',
    label: 'Mathematics: Analysis and Approaches HL',
  },
  aastandardlevel: {
    slug: 'analysis-and-approaches-sl',
    label: 'Mathematics: Analysis and Approaches SL',
  },
  aihigherlevel: {
    slug: 'applications-and-interpretation-hl',
    label: 'Mathematics: Applications and Interpretation HL',
  },
  aistandardlevel: {
    slug: 'applications-and-interpretation-sl',
    label: 'Mathematics: Applications and Interpretation SL',
  },
};

function compactSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function stripMathsPrefix(compact: string) {
  return compact
    .replace(/^ib/, '')
    .replace(/^(?:mathematics|maths|math)/, '');
}

export function resolveQuestionSearchAlias(query: string): QuestionSearchAlias {
  const compact = compactSearch(query);
  const courseCode = stripMathsPrefix(compact);
  const match = MATHS_COURSE_ALIASES[courseCode];

  if (!match) {
    return { query, label: null };
  }

  return {
    query: match.slug,
    label: match.label,
  };
}
