type CourseVersion = {
  id?: string;
  name: string;
  level?: string | null;
  syllabus_label?: string | null;
};

function isPreviousVersionLabel(value: string | null | undefined) {
  return /legacy|old|previous|last assessment|final assessment/i.test(
    String(value || ''),
  );
}

function assessmentYear(
  value: string | null | undefined,
  label: 'first' | 'last' | 'final',
) {
  const match = String(value || '').match(
    new RegExp(`${label}\\s+assessment\\s+(\\d{4})`, 'i'),
  );
  return match ? Number(match[1]) : null;
}

export function isOldCourse(
  course: CourseVersion,
  siblingCourses: CourseVersion[],
) {
  if (!isPreviousVersionLabel(course.syllabus_label)) return false;
  return siblingCourses.some(
    (candidate) =>
      candidate.id !== course.id &&
      candidate.name === course.name &&
      candidate.level === course.level &&
      !isPreviousVersionLabel(candidate.syllabus_label),
  );
}

export function oldCourseFinalAssessmentYear(
  course: CourseVersion,
  siblingCourses: CourseVersion[],
) {
  const explicitYear =
    assessmentYear(course.syllabus_label, 'last') ||
    assessmentYear(course.syllabus_label, 'final');
  if (explicitYear) return explicitYear;

  const currentVersion = siblingCourses.find(
    (candidate) =>
      candidate.id !== course.id &&
      candidate.name === course.name &&
      candidate.level === course.level &&
      !isPreviousVersionLabel(candidate.syllabus_label),
  );
  const firstAssessmentYear = assessmentYear(
    currentVersion?.syllabus_label,
    'first',
  );
  return firstAssessmentYear ? firstAssessmentYear - 1 : null;
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
