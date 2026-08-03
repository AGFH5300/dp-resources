export type PracticeCourseLabelInput = {
  name: string;
  syllabusLabel?: string | null;
};

function conciseSyllabusLabel(value: string) {
  return value
    .replace(/^Legacy syllabus\s*·?\s*/i, 'Legacy · ')
    .replace(/^Legacy\s*·\s*$/i, 'Legacy')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keep current and legacy courses distinguishable anywhere names are listed. */
export function practiceCourseLabel(course: PracticeCourseLabelInput) {
  const syllabus = conciseSyllabusLabel(String(course.syllabusLabel || ''));
  return syllabus ? `${course.name} · ${syllabus}` : course.name;
}
