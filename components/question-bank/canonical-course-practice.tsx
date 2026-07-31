import { CoursePracticeWorkspace } from '@/components/question-bank/course-practice-workspace';
import { QuestionBankFilters } from '@/components/question-bank/question-bank-filters';
import { QuestionPracticeFullscreenControl } from '@/components/question-bank/question-practice-fullscreen-control';
import { QuestionResultsPagination } from '@/components/question-bank/question-results-pagination';
import type { GroupedTopic } from '@/lib/question-bank/taxonomy-grouping';
import type {
  QuestionFilters,
  QuestionListRow,
} from '@/lib/question-bank/types';

export function CanonicalCoursePractice({
  topics,
  papers,
  filters,
  filterOptions,
  basePath,
  total,
  pages,
  previousHref,
  nextHref,
  pageLinks,
  questions,
  initialVariantId,
}: {
  topics: GroupedTopic[];
  papers: Array<{ id: string; reference: string }>;
  filters: QuestionFilters;
  filterOptions: {
    difficulties: string[];
    sections: string[];
    calculatorValues: boolean[];
  };
  basePath: string;
  total: number;
  pages: number;
  previousHref: string | null;
  nextHref: string | null;
  pageLinks: Array<{ page: number; href: string }>;
  questions: QuestionListRow[];
  initialVariantId: string | null;
}) {
  const selectedTopic = topics.find(
    (topic) => filters.topicId && topic.ids.includes(filters.topicId),
  );
  const selectedSubtopic = selectedTopic?.subtopics.find(
    (subtopic) =>
      filters.subtopicId && subtopic.ids.includes(filters.subtopicId),
  );
  const filterTopics = topics.map((topic) => ({
    id: topic.id,
    slug: topic.canonicalKey,
    name: topic.name,
    subtopics: topic.subtopics.map((subtopic) => ({
      id: subtopic.id,
      name: subtopic.name,
    })),
  }));
  const filterState = {
    ...filters,
    topicId: selectedTopic?.id || filters.topicId,
    subtopicId: selectedSubtopic?.id || filters.subtopicId,
  };

  return (
    <section className="min-w-0">
      <QuestionBankFilters
        topics={filterTopics}
        papers={papers}
        filters={filterState}
        filterOptions={filterOptions}
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
        pageSize={24}
        previousHref={previousHref}
        nextHref={nextHref}
        pageLinks={pageLinks}
      >
        <CoursePracticeWorkspace
          questions={questions}
          total={total}
          currentPage={filters.page}
          pages={pages}
          previousHref={previousHref}
          nextHref={nextHref}
          initialVariantId={initialVariantId}
          coursePath={basePath}
        />
      </QuestionResultsPagination>
      <QuestionPracticeFullscreenControl />
    </section>
  );
}
