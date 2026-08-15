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

function splitMathsPrefix(compact: string) {
  const withoutIb = compact.replace(/^ib/, '');
  const prefix = withoutIb.match(/^(mathematics|maths|math)/)?.[0] || null;
  return {
    hasMathsPrefix: Boolean(prefix),
    courseCode: prefix ? withoutIb.slice(prefix.length) : withoutIb,
  };
}

export function resolveQuestionSearchAlias(query: string): QuestionSearchAlias {
  const compact = compactSearch(query);
  const { hasMathsPrefix, courseCode } = splitMathsPrefix(compact);
  const match = MATHS_COURSE_ALIASES[courseCode];

  if (match) {
    return {
      query: match.slug,
      label: match.label,
    };
  }

  if (hasMathsPrefix && courseCode === 'aa') {
    return {
      query: 'analysis-and-approaches',
      label: 'Mathematics: Analysis and Approaches (HL and SL)',
    };
  }

  if (hasMathsPrefix && courseCode === 'ai') {
    return {
      query: 'applications-and-interpretation',
      label: 'Mathematics: Applications and Interpretation (HL and SL)',
    };
  }

  return { query, label: null };
}
