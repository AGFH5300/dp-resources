import Link from 'next/link';

import type { GroupedTopic } from '@/lib/question-bank/taxonomy-grouping';
import type { QuestionFilters } from '@/lib/question-bank/types';

export function CourseTaxonomySidebar({
  basePath,
  topics,
  filters,
}: {
  basePath: string;
  topics: GroupedTopic[];
  filters: QuestionFilters;
}) {
  return (
    <aside className="dp-qb-course-sidebar">
      <h2>Main topics</h2>
      <Link href={basePath} className={!filters.topicId ? 'is-active' : ''}>
        All questions
      </Link>
      {topics.map((topic) => {
        const isActive = Boolean(
          filters.topicId && topic.ids.includes(filters.topicId),
        );
        return (
          <div key={topic.canonicalKey} className="mt-3">
            <Link
              href={`?topic=${topic.id}`}
              className={isActive ? 'is-active' : ''}
            >
              {topic.name}
            </Link>
            {isActive ? (
              <div className="dp-qb-sidebar-subtopics">
                {topic.subtopics.map((subtopic) => (
                  <Link
                    key={subtopic.canonicalKey}
                    href={`?topic=${topic.id}&subtopic=${subtopic.id}`}
                    className={
                      filters.subtopicId &&
                      subtopic.ids.includes(filters.subtopicId)
                        ? 'is-active'
                        : ''
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
  );
}
