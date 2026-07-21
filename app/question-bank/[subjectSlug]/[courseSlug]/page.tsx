export const dynamic = 'force-dynamic';

import Link from 'next/link';
import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  Search,
} from 'lucide-react';

import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import {
  getCourseQuestionBank,
  parseQuestionFilters,
} from '@/lib/question-bank/queries';

function preview(value: string) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\(question:[^)]+\)/g, '[image]')
    .replace(/:{1,3}[a-z]+(?:\[[^\]]*\])?/gi, ' ')
    .replace(/[*_$\\{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete('page');
  else next.set('page', String(page));
  return `?${next.toString()}`;
}

export default async function CourseQuestionBank({
  params,
  searchParams,
}: {
  params: Promise<{ subjectSlug: string; courseSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await requireMember();
  const route = await params;
  const rawParams = await searchParams;
  const filters = parseQuestionFilters(rawParams);
  const data = await getCourseQuestionBank(
    route.subjectSlug,
    route.courseSlug,
    filters,
  );
  const query = new URLSearchParams(
    Object.entries(rawParams).filter(([, value]) => value) as [string, string][],
  );
  const listPath = `/question-bank/${route.subjectSlug}/${route.courseSlug}${query.size ? `?${query.toString()}` : ''}`;
  const total = Number(data.questions[0]?.total_count || 0);
  const pages = Math.max(1, Math.ceil(total / 24));
  const subtopics = (data.topics as any[]).flatMap((topic) =>
    (topic.subtopics || []).map((subtopic: any) => ({
      ...subtopic,
      topicName: topic.name,
    })),
  );
  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <nav className="text-sm text-slate-600" aria-label="Breadcrumb">
          <Link href="/question-bank" className="hover:text-blue-700 hover:underline">
            Question Bank
          </Link>{' '}
          <span aria-hidden>/</span> {data.subject.name} <span aria-hidden>/</span>{' '}
          <span className="text-slate-900">{data.course.name}</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--dp-navy)]">
              {data.course.name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {data.course.syllabus_label} ·{' '}
              {data.sourceQuestionCount.toLocaleString()} source occurrences ·{' '}
              {data.topics.length} topics
            </p>
          </div>
          <Link
            href="/question-bank/search"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
          >
            <Search className="size-4" /> Search all courses
          </Link>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="dp-qb-course-sidebar">
            <h2>Topics</h2>
            <Link
              href={`/question-bank/${route.subjectSlug}/${route.courseSlug}`}
              className={!filters.topicId ? 'is-active' : ''}
            >
              All questions
            </Link>
            {(data.topics as any[]).map((topic) => (
              <div key={topic.id} className="mt-3">
                <Link
                  href={`?topic=${topic.id}`}
                  className={filters.topicId === topic.id ? 'is-active' : ''}
                >
                  {topic.name}
                </Link>
                <div className="ml-3 border-l border-slate-200 pl-2">
                  {(topic.subtopics || []).map((subtopic: any) => (
                    <Link
                      key={subtopic.id}
                      href={`?topic=${topic.id}&subtopic=${subtopic.id}`}
                      className={
                        filters.subtopicId === subtopic.id ? 'is-active' : ''
                      }
                    >
                      {subtopic.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <section className="min-w-0">
            <form className="dp-qb-filters" method="get">
              <label className="dp-qb-filter-search">
                <span>Search this course</span>
                <input
                  name="q"
                  defaultValue={filters.q}
                  maxLength={160}
                  placeholder="Reference or question text"
                />
              </label>
              <label>
                <span>Topic</span>
                <select name="topic" defaultValue={filters.topicId || ''}>
                  <option value="">All topics</option>
                  {(data.topics as any[]).map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Subtopic</span>
                <select name="subtopic" defaultValue={filters.subtopicId || ''}>
                  <option value="">All subtopics</option>
                  {subtopics.map((subtopic: any) => (
                    <option key={subtopic.id} value={subtopic.id}>
                      {subtopic.topicName} — {subtopic.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Difficulty</span>
                <select name="difficulty" defaultValue={filters.difficulty || ''}>
                  <option value="">Any difficulty</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                <span>Paper</span>
                <select name="paper" defaultValue={filters.paperId || ''}>
                  <option value="">Any paper</option>
                  {(data.papers as any[]).map((paper) => (
                    <option key={paper.id} value={paper.id}>
                      {paper.reference}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Section</span>
                <select name="section" defaultValue={filters.section || ''}>
                  <option value="">Any section</option>
                  {['A', 'B', 'NONE', '50', 'OPTION C'].map((section) => (
                    <option key={section}>{section}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Calculator</span>
                <select
                  name="calculator"
                  defaultValue={
                    filters.calculator === null ? '' : String(filters.calculator)
                  }
                >
                  <option value="">Either</option>
                  <option value="true">Allowed</option>
                  <option value="false">Not allowed</option>
                </select>
              </label>
              <label>
                <span>Progress</span>
                <select name="status" defaultValue={filters.status || ''}>
                  <option value="">Any progress</option>
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label>
                <span>Personal</span>
                <select
                  name="saved"
                  defaultValue={filters.saved === true ? 'true' : ''}
                >
                  <option value="">All questions</option>
                  <option value="true">Saved only</option>
                </select>
              </label>
              <label>
                <span>Review</span>
                <select
                  name="revisit"
                  defaultValue={filters.revisit === true ? 'true' : ''}
                >
                  <option value="">Any</option>
                  <option value="true">To revisit</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button type="submit">Apply filters</button>
                <Link href={`/question-bank/${route.subjectSlug}/${route.courseSlug}`}>
                  Reset
                </Link>
              </div>
            </form>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {total.toLocaleString()} matching question{total === 1 ? '' : 's'}
              </p>
              <p className="text-sm text-slate-500">
                Page {Math.min(filters.page, pages)} of {pages}
              </p>
            </div>
            <div className="mt-3 space-y-3">
              {data.questions.map((question) => (
                <Link
                  key={question.variant_id}
                  href={`/question-bank/${route.subjectSlug}/${route.courseSlug}/questions/${question.variant_id}?from=${encodeURIComponent(listPath)}`}
                  className="dp-qb-question-row"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{question.reference}</strong>
                    <span className="dp-qb-chip capitalize">
                      {question.difficulty_label || 'Unrated'}
                    </span>
                    {question.paper_reference ? (
                      <span className="dp-qb-chip">{question.paper_reference}</span>
                    ) : null}
                    <span className="dp-qb-chip">
                      {question.maximum_mark} mark
                      {question.maximum_mark === 1 ? '' : 's'}
                    </span>
                    {question.progress_status === 'completed' ? (
                      <CheckCircle2 className="ml-auto size-4 text-emerald-600" />
                    ) : null}
                    {question.to_revisit ? (
                      <Flag className="size-4 text-amber-600" />
                    ) : null}
                    {question.is_saved ? (
                      <Bookmark className="size-4 text-blue-700" fill="currentColor" />
                    ) : null}
                  </div>
                  <p>{preview(question.content_preview) || 'No question text in the source.'}</p>
                  <small>
                    {question.topic_name}
                    {question.subtopic_names.length
                      ? ` · ${question.subtopic_names.join(', ')}`
                      : ''}
                    {question.section ? ` · Section ${question.section}` : ''}
                  </small>
                </Link>
              ))}
              {!data.questions.length ? (
                <div className="dp-qb-empty">
                  No questions match these filters. Try resetting one or more
                  filters.
                </div>
              ) : null}
            </div>

            {pages > 1 ? (
              <nav className="dp-qb-pagination" aria-label="Question pages">
                {filters.page > 1 ? (
                  <Link href={pageHref(query, filters.page - 1)}>
                    <ChevronLeft className="size-4" /> Previous
                  </Link>
                ) : (
                  <span />
                )}
                {filters.page < pages ? (
                  <Link href={pageHref(query, filters.page + 1)}>
                    Next <ChevronRight className="size-4" />
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}
