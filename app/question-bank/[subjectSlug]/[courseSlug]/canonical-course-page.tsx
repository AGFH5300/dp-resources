import Link from 'next/link';
import { Search } from 'lucide-react';

import { Nav } from '@/components/nav';
import { CanonicalCoursePractice } from '@/components/question-bank/canonical-course-practice';
import { CourseTaxonomySidebar } from '@/components/question-bank/course-taxonomy-sidebar';
import { OldCourseBadge } from '@/components/question-bank/old-course-badge';
import { visibleQuestionPages } from '@/components/question-bank/question-results-pagination';
import { requireMember } from '@/lib/auth';
import { dedupePaperOptions } from '@/lib/question-bank/filter-options';
import {
  isOldCourse,
  oldCourseFinalAssessmentYear,
} from '@/lib/question-bank/presentation';
import {
  getCourseQuestionBank,
  parseQuestionFilters,
} from '@/lib/question-bank/queries';
import {
  groupCourseTopics,
  type TaxonomyTopic,
} from '@/lib/question-bank/taxonomy-grouping';

import styles from './course-question-bank.module.css';

const QUESTION_PAGE_SIZE = 24;

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

export default async function CanonicalCourseQuestionBank({
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
  const groupedTopics = groupCourseTopics(data.topics as TaxonomyTopic[]);
  const papers = dedupePaperOptions(
    data.papers as Array<{ id: string; reference: string }>,
  );
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
      <main
        className={`${styles.coursePage} mx-auto max-w-[1500px] px-4 py-6 pb-24 sm:px-6 lg:px-8`}
      >
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
              {groupedTopics.length} topics
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
          <CourseTaxonomySidebar
            basePath={basePath}
            topics={groupedTopics}
            filters={filters}
          />
          <CanonicalCoursePractice
            topics={groupedTopics}
            papers={papers}
            filters={filters}
            filterOptions={data.filterOptions}
            basePath={basePath}
            total={total}
            pages={pages}
            previousHref={previousHref}
            nextHref={nextHref}
            pageLinks={pageLinks}
            questions={data.questions}
            initialVariantId={selectedQuestion(rawParams.question)}
          />
        </div>
      </main>
    </>
  );
}
