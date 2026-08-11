export const dynamic = 'force-dynamic';

import Link from 'next/link';
import {
  ArrowRight,
  Bookmark,
  BookOpenCheck,
  ChevronDown,
  Layers3,
  Search,
} from 'lucide-react';

import { Nav } from '@/components/nav';
import { QuestionSourceBadges } from '@/components/content-source-badge';
import { QuestionBankJoinModal } from '@/components/question-bank/question-bank-join-modal';
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

type LandingSubject = {
  id: string;
  slug: string;
  name: string;
  courses: LandingCourse[];
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
              {' '}·{' '}
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

function SubjectCourseLinks({
  subject,
  questionCounts,
}: {
  subject: LandingSubject;
  questionCounts: Map<string, number>;
}) {
  if (subject.slug !== 'mathematics') {
    return (
      <>
        {subject.courses.map((course) => (
          <CourseLink
            key={course.id}
            subjectSlug={subject.slug}
            course={course}
            siblingCourses={subject.courses}
            questionCounts={questionCounts}
          />
        ))}
      </>
    );
  }

  const mathematicsCourses = splitMathematicsCourses(subject.courses);
  const legacyCourses = [
    ...mathematicsCourses.standaloneLegacy,
    ...mathematicsCourses.furtherMathematics,
  ];
  const legacyQuestionCount = legacyCourses.reduce(
    (total, course) => total + (questionCounts.get(course.id) || 0),
    0,
  );

  return (
    <>
      {mathematicsCourses.current.map((course) => (
        <CourseLink
          key={course.id}
          subjectSlug={subject.slug}
          course={course}
          siblingCourses={subject.courses}
          questionCounts={questionCounts}
        />
      ))}

      {legacyCourses.length ? (
        <details className="group overflow-hidden rounded-[0.6rem] border border-slate-200 bg-white">
          <summary className="flex list-none items-center gap-3 px-3 py-3 text-slate-700 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">Legacy Mathematics</strong>
              <small className="mt-0.5 block text-xs text-slate-500">
                {legacyQuestionCount.toLocaleString()} questions · 2009–2019 archive
              </small>
            </span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>

          <div className="space-y-2 border-t border-slate-200 bg-slate-50/70 p-2">
            {mathematicsCourses.standaloneLegacy.map((course) => (
              <CourseLink
                key={course.id}
                subjectSlug={subject.slug}
                course={course}
                siblingCourses={subject.courses}
                questionCounts={questionCounts}
              />
            ))}

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
                          total + (questionCounts.get(course.id) || 0),
                        0,
                      )
                      .toLocaleString()}{' '}
                    questions across SL and HL
                  </small>
                </div>
                <div className="space-y-2">
                  {mathematicsCourses.furtherMathematics.map((course) => (
                    <CourseLink
                      key={course.id}
                      subjectSlug={subject.slug}
                      course={course}
                      siblingCourses={subject.courses}
                      questionCounts={questionCounts}
                      displayName={course.level || course.name}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
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
              Follow one course, build a custom session, or load a configuration
              shared by another student.
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

        <section
          className="mt-6 grid gap-4 md:grid-cols-3"
          aria-label="Practice choices"
        >
          <Link
            href="#courses"
            className="group rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md dark:border-emerald-900/70 dark:from-emerald-950/45 dark:via-slate-900 dark:to-teal-950/30"
          >
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition group-hover:bg-emerald-700">
                <BookOpenCheck className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="text-lg text-[color:var(--dp-navy)] dark:text-slate-50">
                  Practise a course
                </strong>
                <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Choose one IB course and work through its syllabus, topics and
                  existing filters.
                </span>
              </span>
              <ArrowRight className="mt-1 size-5 text-emerald-600 transition group-hover:translate-x-1 group-hover:text-emerald-800 dark:text-emerald-300" />
            </div>
          </Link>

          <Link
            href="/question-bank/build"
            className="group rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md dark:border-indigo-900/70 dark:from-indigo-950/45 dark:via-slate-900 dark:to-violet-950/30"
          >
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
                <Layers3 className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="text-lg text-[color:var(--dp-navy)] dark:text-slate-50">
                  Build a practice set
                </strong>
                <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Combine topics across subjects and choose different courses and
                  question quotas for every selection.
                </span>
              </span>
              <ArrowRight className="mt-1 size-5 text-indigo-600 transition group-hover:translate-x-1 group-hover:text-indigo-800 dark:text-indigo-300" />
            </div>
          </Link>

          <QuestionBankJoinModal />
        </section>

        <div
          id="courses"
          className="mt-6 grid scroll-mt-24 gap-4 lg:grid-cols-[minmax(0,1fr)_310px]"
        >
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
              {(data.subjects as LandingSubject[]).map((subject) => (
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
                    <SubjectCourseLinks
                      subject={subject}
                      questionCounts={questionCounts}
                    />
                  </div>
                </article>
              ))}
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
                          <strong title={row.question.reference}>
                            {row.question.reference}
                          </strong>
                          <QuestionSourceBadges sources={row.sources} />
                          <small title={row.course.name}>{row.course.name}</small>
                        </span>
                        <span
                          title={
                            row.topic.name === 'Uncategorized'
                              ? 'Topic not assigned'
                              : row.topic.name
                          }
                        >
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
