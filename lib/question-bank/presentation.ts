type CourseVersion = {
  id?: string;
  name: string;
  level?: string | null;
  syllabus_label?: string | null;
};

function isPreviousVersionLabel(value: string | null | undefined) {
  return /legacy|old|previous/i.test(String(value || ''));
}

function assessmentYear(
  value: string | null | undefined,
  kind: 'first' | 'final',
) {
  const pattern =
    kind === 'first'
      ? /first\s+assessment\s+(\d{4})/i
      : /(?:final|last)\s+assessment\s+(\d{4})/i;
  const match = String(value || '').match(pattern);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function isSameCourseVersionFamily(
  course: CourseVersion,
  candidate: CourseVersion,
) {
  return (
    candidate.id !== course.id &&
    candidate.name === course.name &&
    candidate.level === course.level
  );
}

export function isOldCourse(
  course: CourseVersion,
  siblingCourses: CourseVersion[],
) {
  if (!isPreviousVersionLabel(course.syllabus_label)) return false;
  return siblingCourses.some(
    (candidate) =>
      isSameCourseVersionFamily(course, candidate) &&
      !isPreviousVersionLabel(candidate.syllabus_label),
  );
}

export function oldCourseFinalAssessmentYear(
  course: CourseVersion,
  siblingCourses: CourseVersion[],
) {
  if (!isOldCourse(course, siblingCourses)) return null;

  const explicitYear = assessmentYear(course.syllabus_label, 'final');
  if (explicitYear) return explicitYear;

  const replacementYears = siblingCourses
    .filter(
      (candidate) =>
        isSameCourseVersionFamily(course, candidate) &&
        !isPreviousVersionLabel(candidate.syllabus_label),
    )
    .map((candidate) => assessmentYear(candidate.syllabus_label, 'first'))
    .filter((year): year is number => year !== null);

  if (!replacementYears.length) return null;
  return Math.min(...replacementYears) - 1;
}

export function taxonomyLabel(
  topicName: string,
  subtopicNames: string[] = [],
) {
  const labels = [topicName, ...subtopicNames]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(labels)].join(' · ');
}

export function marksLabel(maximumMark: number) {
  if (!(maximumMark > 0)) return 'Marks not listed';
  return `${maximumMark} mark${maximumMark === 1 ? '' : 's'}`;
}
