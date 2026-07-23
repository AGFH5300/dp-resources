type CourseVersion = {
  id?: string;
  name: string;
  level?: string | null;
  syllabus_label?: string | null;
};

function isPreviousVersionLabel(value: string | null | undefined) {
  return /legacy|old|previous/i.test(String(value || ''));
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
