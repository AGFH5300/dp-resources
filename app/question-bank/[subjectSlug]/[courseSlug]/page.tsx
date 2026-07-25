export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Search } from 'lucide-react';

import { Nav } from '@/components/nav';
import { CoursePracticeWorkspace } from '@/components/question-bank/course-practice-workspace';
import { OldCourseBadge } from '@/components/question-bank/old-course-badge';
import { QuestionBankFilters } from '@/components/question-bank/question-bank-filters';
import {
  QuestionResultsPagination,
  visibleQuestionPages,
} from '@/components/question-bank/question-results-pagination';
import { requireMember } from '@/lib/auth';
import {
  isOldCourse,
  oldCourseFinalAssessmentYear,
} from '@/lib/question-bank/presentation';
import {
  getCourseQuestionBank,
  parseQuestionFilters,
} from '@/lib/question-bank/queries';

const QUESTION_PAGE_SIZE = 24;

type TopicRecord = {
  id: string;
  name: string;
  subtopics?: Array<{ id: string; name: string }>;
  [key: string]: unknown;
};

type TopicGroup = {
  key: string;
  displayName: string;
  primary: TopicRecord;
  topics: TopicRecord[];
};

function cleanTopicLabel(value: unknown) {
  const name = String(value || '').trim();
  const cleaned = name
    .replace(/^[A-Z](?:[.)\]:-])?\s+(?=[A-Za-z])/, '')
    .trim();
  return cleaned || name;
}

function groupTopicsForSidebar(topics: TopicRecord[]) {
  const groups = new Map<string, TopicGroup>();
  for (const topic of topics) {
    const displayName = cleanTopicLabel(topic.name);
    const key = displayName.toLocaleLowerCase();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        displayName,
        primary: topic,
        topics: [topic],
      });
      continue;
    }
    existing.topics.push(topic);
    const existingSubtopics = existing.primary.subtopics?.length || 0;
    const candidateSubtopics = topic.subtopics?.length || 0;
    if (candidateSubtopics > existingSubtopics) existing.primary = topic;
  }
  return Array.from(groups.values());
}

function groupedSubtopics(group: TopicGroup, selectedTopicId: string | null) {
  const selected = group.topics.find((topic) => topic.id === selectedTopicId);
  const orderedTopics = selected
    ? [selected, ...group.topics.filter((topic) => topic.id !== selected.id)]
    : group.topics;
  const seen = new Set<string>();
  const rows: Array<{
    topicId: string;
    subtopic: { id: string; name: string };
  }> = [];
  for (const topic of orderedTopics) {
    for (const subtopic of topic.subtopics || []) {
      const key = String(subtopic.name || subtopic.id).trim().toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ topicId: topic.id, subtopic });
    }
  }
  return rows;
}

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.delete('question');
  if (page <= 1) next.delete('page');
  else next.set('page', String(page));
  const query = next.toString();
  return query ? `?${query}` : '?';
}

function selectedQuestion(value: string | undefined) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
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
    Object.entries(rawParams).filter(
      ([key, value]) => value && key !== 'question',
    ) as [string, string][],
  );
  const basePath = `/question-bank/${route.subjectSlug}/${route.courseSlug}`;
  const total = Number(data.questions[0]?.total_count || 0);
  const pages = Math.max(1, Math.ceil(total / QUESTION_PAGE_SIZE));
  const topics = data.topics as TopicRecord[];
  const sidebarTopicGroups = groupTopicsForSidebar(topics);
  const initialVariantId = selectedQuestion(rawParams.question);
  const oldCourse = isOldCourse(data.course, data.siblingCourses);
  const finalAssessmentYear = oldCourse
    ? oldCourseFinalAssessmentYear(data.course, data.siblingCourses)
    : null;
  const previousHref =
    filters.page > 1 ? pageHref(query, filters.page - 1) : null;
  const nextHref =
    filters.page < pages ? pageHref(query, filters.page + 1) : null;
  const pageLinks = visibleQuestionPages(filters.page, pages).map((page) => ({
    page,
    href: pageHref(query, page),
  }));

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-[1500px] px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <nav className="dp-qb-breadcrumb" aria-label="Breadcrumb">
          <Link href="/question-bank">Question Bank</Link>
          <span aria-hidden>/</span>
          <Link href={`/question-bank#subject-${route.subjectSlug}`}>
            {data.subject.name}
          </Link>
          <span aria-hidden>/</span>
          <span aria-current="page">{data.course.name}</span>
        </nav>

        <section className="dp-qb-course-hero">
          <div>
            <h1>{data.course.name}</h1>
            <p>
              {oldCourse ? (
                <>
                  <OldCourseBadge
                    interactive
                    finalAssessmentYear={finalAssessmentYear}
                  />{' '}
                  ·{' '}
                </>
              ) : null}
              {data.sourceQuestionCount.toLocaleString()} source occurrences ·{' '}
              {sidebarTopicGroups.length} topics
            </p>
          </div>
          <form action="/question-bank/search" className="dp-qb-universal-search">
            <Search className="size-5" aria-hidden />
            <label>
              <span>Not sure which topic it belongs to?</span>
              <input
                name="q"
                minLength={2}
                maxLength={160}
                placeholder="Search every subject, course, topic and question"
                aria-label="Search the entire question bank"
              />
            </label>
            <button type="submit">Search everything</button>
          </form>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="dp-qb-course-sidebar">
            <h2>Main topics</h2>
            <Link href={basePath} className={!filters.topicId ? 'is-active' : ''}>
              All questions
            </Link>
            {sidebarTopicGroups.map((group) => {
              const activeTopic = group.topics.find(
                (topic) => topic.id === filters.topicId,
              );
              const isActive = Boolean(activeTopic);
              const subtopics = isActive
                ? groupedSubtopics(group, filters.topicId)
                : [];
              return (
                <div key={group.key} className="mt-3">
                  <Link
                    href={`?topic=${activeTopic?.id || group.primary.id}`}
                    className={isActive ? 'is-active' : ''}
                  >
                    {group.displayName}
                  </Link>
                  {isActive ? (
                    <div className="dp-qb-sidebar-subtopics">
                      {subtopics.map(({ topicId, subtopic }) => (
                        <Link
                          key={`${topicId}-${subtopic.id}`}
                          href={`?topic=${topicId}&subtopic=${subtopic.id}`}
                          className={
                            filters.subtopicId === subtopic.id ? 'is-active' : ''
                          }
                        >
                          {subtopic.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </aside>

          <section className="min-w-0">
            <QuestionBankFilters
              topics={topics}
              papers={data.papers as any[]}
              filters={filters}
              filterOptions={data.filterOptions}
              resetHref={basePath}
            />

            <div className="dp-qb-practice-intro">
              <div>
                <h2>Choose a question and practise here</h2>
                <p>
                  Select an answer for instant feedback, then learn from the full explanation
                  without opening another page.
                </p>
              </div>
              <span>{total.toLocaleString()} available</span>
            </div>

            <QuestionResultsPagination
              total={total}
              currentPage={filters.page}
              pages={pages}
              pageSize={QUESTION_PAGE_SIZE}
              previousHref={previousHref}
              nextHref={nextHref}
              pageLinks={pageLinks}
            >
              <CoursePracticeWorkspace
                questions={data.questions}
                total={total}
                currentPage={filters.page}
                pages={pages}
                previousHref={previousHref}
                nextHref={nextHref}
                initialVariantId={initialVariantId}
                coursePath={basePath}
              />
            </QuestionResultsPagination>
          </section>
        </div>
      </main>
    </>
  );
}
