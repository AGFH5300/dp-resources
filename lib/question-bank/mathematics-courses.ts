import { isOldCourse } from './presentation';

export type MathematicsCourse = {
  id: string;
  name: string;
  slug: string;
  level?: string | null;
  syllabus_label?: string | null;
};

const LEGACY_COURSE_ORDER = new Map([
  ['mathematical-studies-sl', 0],
  ['mathematics-sl', 1],
  ['mathematics-hl', 2],
  ['further-mathematics-sl', 3],
  ['further-mathematics-hl', 4],
]);

function legacyCourseOrder(course: MathematicsCourse) {
  return LEGACY_COURSE_ORDER.get(course.slug) ?? 99;
}

export function splitMathematicsCourses(courses: MathematicsCourse[]) {
  const current = courses.filter((course) => !isOldCourse(course, courses));
  const legacy = courses
    .filter((course) => isOldCourse(course, courses))
    .sort(
      (left, right) =>
        legacyCourseOrder(left) - legacyCourseOrder(right) ||
        left.name.localeCompare(right.name),
    );

  return {
    current,
    standaloneLegacy: legacy.filter(
      (course) => !course.slug.startsWith('further-mathematics-'),
    ),
    furtherMathematics: legacy.filter((course) =>
      course.slug.startsWith('further-mathematics-'),
    ),
  };
}
