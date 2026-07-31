export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowRight, Bookmark, ChevronDown, Search } from 'lucide-react';

import { Nav } from '@/components/nav';
import { OldCourseBadge } from '@/components/question-bank/old-course-badge';
import { SubjectIcon } from '@/components/question-bank/subject-icon';
import { requireMember } from '@/lib/auth';
import { getQuestionBankCourseCounts } from '@/lib/question-bank/course-counts';
import { splitMathematicsCourses } from '@/lib/question-bank/mathematics-courses';
import {
  isOldCourse,
  oldCourseFinalAssessmentYear,
} from '@/lib/question-bank/presentation';
import { getQuestionBankLanding } from '@/lib/question-bank/queries';

type LandingCourse = {
  id: string;
  slug: string;
  name: string;
  level?: string | null;
  syllabus_label?: string | null;
};

function CourseLink({
  subjectSlug,
  course,
  siblingCourses,
  questionCounts,
  displayName,
}: {
  subjectSlug: string;
  course: LandingCourse;
  siblingCourses: LandingCourse[];
  questionCounts: Map<string, number>;
  displayName?: string;
}) {
  const oldCourse = isOldCourse(course, siblingCourses);
  const questionCount = questionCounts.get(course.id) || 0;

  return (
    <Link
      href={`/question-bank/${subjectSlug}/${course.slug}`}
      className="dp-qb-course-link"
    >
      <span>
        <strong>{displayName || course.name}</strong>
        <small>
          {questionCount.toLocaleString()} questions
          {oldCourse ? (
            <>
              {' '}
              ·{' '}
              <OldCourseBadge
                finalAssessmentYear={oldCourseFinalAssessmentYear(
                  course,
                  siblingCourses,
                )}
              />
            </>
          ) : null}
        </small>
      </span>
      <ArrowRight className="size-4" />
    </Link>
  );
}

export default async function QuestionBankLanding() {
  const { user, membership } = await requireMember();
  const [data, questionCounts] = await Promise.all([
    getQuestionBankLanding(user.id),
    getQuestionBankCourseCounts(),
  ]);

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <section className="dp-qb-hero">
          <div>
            <h1>Question Bank</h1>
            <p>
              Choose a course, practise by topic, reveal markschemes, and keep
              your progress in one place.
            </p>
          </div>
          <form action="/question-bank/search" className="dp-qb-search-box">
            <Search className="size-5" aria-hidden />
            <input
              name="q"
              minLength={2}
              maxLength={160}
              placeholder="Search references, questions, topics…"
              aria-label="Search the question bank"
            />
            <button type="submit">Search</button>
          </form>
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--dp-navy)]">
                  Subjects and courses
                </h2>
                <p className="text-sm text-slate-600">
                  Choose the subject, level, and course version you need.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.subjects.map((subject: any) => {
                const mathematicsCourses =
                  subject.slug === 'mathematics'
                    ? splitMathematicsCourses(subject.courses)
                    : null;
                const visibleCourses = mathematicsCourses
                  ? mathematicsCourses.current
                  : subject.courses;
                const legacyCourses = mathematicsCourses
                  ? [
                      ...mathematicsCourses.standaloneLegacy,
                      ...mathematicsCourses.furtherMathematics,
                    ]
                  : [];
                const legacyQuestionCount = legacyCourses.reduce(
                  (total, course) =>
                    total + (questionCounts.get(course.id || '') || 0),
                  0,
                );

                return (
                  <article
                    key={subject.id}
                    id={`subject-${subject.slug}`}
                    className="dp-qb-subject-card scroll-mt-24"
                  >
                    <div className="flex items-center gap-3">
                      <SubjectIcon subjectSlug={subject.slug} />
                      <h3>{subject.name}</h3>
                    </div>
                    <div className="mt-4 space-y-2">
                      {visibleCourses.map((course: LandingCourse) => (
                        <CourseLink
                          key={course.id}
                          subjectSlug={subject.slug}
                          course={course}
                          siblingCourses={subject.courses}
                          questionCounts={questionCounts}
                        />
                      ))}

                      {mathematicsCourses && legacyCourses.length ? (
                        <details className="group overflow-hidden rounded-[0.6rem] border border-slate-200 bg-white">
                          <summary className="flex list-none items-center gap-3 px-3 py-3 text-slate-700 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0 flex-1">
                              <strong className="block text-sm">
                                Legacy Mathematics
                              </strong>
                              <small className="mt-0.5 block text-xs text-slate-500">
                                {legacyQuestionCount.toLocaleString()} questions ·
                                2009–2019 archive
                              </small>
                            </span>
                            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                          </summary>

                          <div className="space-y-2 border-t border-slate-200 bg-slate-50/70 p-2">
                            {mathematicsCourses.standaloneLegacy.map(
                              (course: LandingCourse) => (
                                <CourseLink
                                  key={course.id}
                                  subjectSlug={subject.slug}
                                  course={course}
                                  siblingCourses={subject.courses}
                                  questionCounts={questionCounts}
                                />
                              ),
                            )}

                            {mathematicsCourses.furtherMathematics.length ? (
                              <section className="rounded-[0.6rem] border border-slate-200 bg-white p-2.5">
                                <div className="mb-2">
                                  <strong className="block text-sm text-slate-700">
                                    Further Mathematics
                                  </strong>
                                  <small className="mt-0.5 block text-xs text-slate-500">
                                    {mathematicsCourses.furtherMathematics
                                      .reduce(
                                        (total, course) =>
                                          total +
                                          (questionCounts.get(course.id || '') ||
                                            0),
                                        0,
                                      )
                                      .toLocaleString()}{' '}
                                    questions across SL and HL
                                  </small>
                                </div>
                                <div className="space-y-2">
                                  {mathematicsCourses.furtherMathematics.map(
                                    (course: LandingCourse) => (
                                      <CourseLink
                                        key={course.id}
                                        subjectSlug={subject.slug}
                                        course={course}
                                        siblingCourses={subject.courses}
                                        questionCounts={questionCounts}
                                        displayName={course.level || course.name}
                                      />
                                    ),
                                  )}
                                </div>
                              </section>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <Link href="/saved#question-bank" className="dp-qb-side-card">
              <Bookmark className="size-5" />
              <span>
                <strong>Saved questions</strong>
                <small>{data.savedCount.toLocaleString()} saved</small>
              </span>
              <ArrowRight className="ml-auto size-4" />
            </Link>
            <section className="dp-qb-panel">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Continue practising
              </h2>
              <div className="mt-3 space-y-2">
                {data.recent.length ? (
                  data.recent.map((row: any) => (
                    <Link
                      key={row.id}
                      href={`/question-bank/${row.course.subject.slug}/${row.course.slug}?question=${row.id}`}
                      className="dp-qb-recent-link"
                    >
                      <SubjectIcon
                        subjectSlug={row.course.subject.slug}
                        compact
                      />
                      <span className="dp-qb-recent-copy">
                        <span className="dp-qb-recent-heading">
                          <strong>{row.question.reference}</strong>
                          <small>{row.course.name}</small>
                        </span>
                        <span>
                          {row.topic.name === 'Uncategorized'
                            ? 'Topic not assigned'
                            : row.topic.name}
                        </span>
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">
                    Open a question and it will appear here.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
