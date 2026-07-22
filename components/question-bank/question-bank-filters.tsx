'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

import { AppSelect } from '@/components/ui/app-select';
import type { QuestionFilters } from '@/lib/question-bank/types';

const ANY = '__any__';

type Topic = {
  id: string;
  name: string;
  subtopics?: Array<{ id: string; name: string }>;
};

export function QuestionBankFilters({
  topics,
  papers,
  filters,
  resetHref,
}: {
  topics: Topic[];
  papers: Array<{ id: string; reference: string }>;
  filters: QuestionFilters;
  resetHref: string;
}) {
  const [topicId, setTopicId] = useState(filters.topicId || ANY);
  const [subtopicId, setSubtopicId] = useState(filters.subtopicId || ANY);
  const selectedTopic = topics.find((topic) => topic.id === topicId);

  function changeTopic(value: string) {
    setTopicId(value);
    setSubtopicId(ANY);
  }

  return (
    <form className="dp-qb-filters" method="get">
      <label className="dp-qb-filter-search">
        <span>Search this course</span>
        <span className="dp-qb-filter-input">
          <Search className="size-4" aria-hidden />
          <input
            name="q"
            defaultValue={filters.q}
            maxLength={160}
            placeholder="Reference or words from the question"
          />
        </span>
      </label>
      <label>
        <span>Main topic</span>
        <AppSelect
          name="topic"
          value={topicId}
          onValueChange={changeTopic}
          placeholder="All topics"
          options={[
            { value: ANY, label: 'All topics' },
            ...topics.map((topic) => ({ value: topic.id, label: topic.name })),
          ]}
        />
      </label>
      <label>
        <span>Subtopic</span>
        <AppSelect
          name="subtopic"
          value={subtopicId}
          onValueChange={setSubtopicId}
          disabled={!selectedTopic}
          placeholder={selectedTopic ? 'All subtopics' : 'Choose a topic first'}
          options={[
            { value: ANY, label: 'All subtopics' },
            ...(selectedTopic?.subtopics || []).map((subtopic) => ({
              value: subtopic.id,
              label: subtopic.name,
            })),
          ]}
        />
        {!selectedTopic ? (
          <small className="dp-qb-filter-hint">Choose a main topic first.</small>
        ) : null}
      </label>
      <label>
        <span>Difficulty</span>
        <AppSelect
          name="difficulty"
          defaultValue={filters.difficulty || ANY}
          placeholder="Any difficulty"
          options={[
            { value: ANY, label: 'Any difficulty' },
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
        />
      </label>
      <label>
        <span>Paper</span>
        <AppSelect
          name="paper"
          defaultValue={filters.paperId || ANY}
          placeholder="Any paper"
          options={[
            { value: ANY, label: 'Any paper' },
            ...papers.map((paper) => ({
              value: paper.id,
              label: paper.reference,
            })),
          ]}
        />
      </label>
      <label>
        <span>Section</span>
        <AppSelect
          name="section"
          defaultValue={filters.section || ANY}
          placeholder="Any section"
          options={[
            { value: ANY, label: 'Any section' },
            ...['A', 'B', 'NONE', '50', 'OPTION C'].map((section) => ({
              value: section,
              label: section,
            })),
          ]}
        />
      </label>
      <label>
        <span>Calculator</span>
        <AppSelect
          name="calculator"
          defaultValue={
            filters.calculator === null ? ANY : String(filters.calculator)
          }
          placeholder="Either"
          options={[
            { value: ANY, label: 'Either' },
            { value: 'true', label: 'Allowed' },
            { value: 'false', label: 'Not allowed' },
          ]}
        />
      </label>
      <label>
        <span>Progress</span>
        <AppSelect
          name="status"
          defaultValue={filters.status || ANY}
          placeholder="Any progress"
          options={[
            { value: ANY, label: 'Any progress' },
            { value: 'not_started', label: 'Not started' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
      </label>
      <label>
        <span>Personal</span>
        <AppSelect
          name="saved"
          defaultValue={filters.saved ? 'true' : ANY}
          placeholder="All questions"
          options={[
            { value: ANY, label: 'All questions' },
            { value: 'true', label: 'Saved only' },
          ]}
        />
      </label>
      <label>
        <span>Review</span>
        <AppSelect
          name="revisit"
          defaultValue={filters.revisit ? 'true' : ANY}
          placeholder="Any"
          options={[
            { value: ANY, label: 'Any' },
            { value: 'true', label: 'To revisit' },
          ]}
        />
      </label>
      <div className="dp-qb-filter-actions">
        <button type="submit">Apply filters</button>
        <a href={resetHref}>Reset</a>
      </div>
    </form>
  );
}
