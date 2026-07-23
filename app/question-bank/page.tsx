export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowRight, Bookmark, Search } from 'lucide-react';

import { Nav } from '@/components/nav';
import { OldCourseBadge } from '@/components/question-bank/old-course-badge';
import { SubjectIcon } from '@/components/question-bank/subject-icon';
import { requireMember } from '@/lib/auth';
import {
  isOldCourse,
  oldCourseFinalAssessmentYear,
} from '@/lib/question-bank/presentation';
import { getQuestionBankLanding } from '@/lib/question-bank/queries';

export default async function QuestionBankLanding() {
  const { user, membership } = await requireMember();
  const data = await getQuestionBankLanding(user.id);
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
              {data.subjects.map((subject: any) => (
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
                    {subject.courses.map((course: any) => (
                      <Link
                        key={course.id}
                        href={`/question-bank/${subject.slug}/${course.slug}`}
                        className="dp-qb-course-link"
                      >
                        <span>
                          <strong>{course.name}</strong>
                          <small>
                            {course.questions.toLocaleString()} questions
                            {isOldCourse(course, subject.courses) ? (
                              <>
                                {' '}
                                ·{' '}
                                <OldCourseBadge
                                  finalAssessmentYear={oldCourseFinalAssessmentYear(
                                    course,
                                    subject.courses,
                                  )}
                                />
                              </>
                            ) : null}
                          </small>
                        </span>
                        <ArrowRight className="size-4" />
                      </Link>
                    ))}
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
