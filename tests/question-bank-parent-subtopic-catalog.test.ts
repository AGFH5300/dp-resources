import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260803135634_question_bank_parent_subtopic_catalog.sql',
  'utf8',
);
const catalog = readFileSync('lib/question-bank/practice-catalog.ts', 'utf8');
const presentation = readFileSync(
  'lib/question-bank/practice-catalog-presentation.ts',
  'utf8',
);
const builder = readFileSync(
  'components/question-bank/practice-set-builder-v4.tsx',
  'utf8',
);
const joinPage = readFileSync('app/question-bank/join/[code]/page.tsx', 'utf8');

describe('Question Bank parent/subtopic picker hierarchy', () => {
  it('creates one real larger-topic heading with selectable children beneath it', () => {
    expect(migration).toContain("'practice-subtopics-'");
    expect(migration).toContain("'Selectable subtopics within '");
    expect(migration).toContain(
      "raise exception 'Every larger topic must have exactly one selectable subtopic group'",
    );
    expect(migration).toContain(
      "raise exception 'Selectable subtopics do not cover every larger-topic question'",
    );
    expect(migration).toContain("where concept_group.slug = 'larger-topics'");
    expect(migration).toContain("set status = 'archived'");
  });

  it('decomposes reviewed comma-chain labels instead of displaying them', () => {
    expect(migration).toContain(
      "'Mechanics, Atomic, nuclear and Particle Physics', 'Space, Time and Motion', 'Mechanics'",
    );
    expect(migration).toContain(
      "'Mechanics, Atomic, nuclear and Particle Physics', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics'",
    );
    expect(migration).toContain(
      "'Numbers And Algebra, Logic, Sets And Probability', 'Number and Algebra', 'General questions'",
    );
    expect(migration).toContain(
      "raise exception 'A comma-chain source label remains selectable'",
    );
  });

  it('keeps archived larger-topic selectors as hidden draft/share redirects', () => {
    expect(migration).toContain("or concept_group.slug = 'larger-topics'");
    expect(migration).toContain(
      "and (status = 'approved' or slug = 'larger-topics')",
    );
    expect(catalog).toContain(".or('status.eq.approved,slug.eq.larger-topics')");
    expect(catalog).toContain('redirectConcepts:');
    expect(catalog).toContain("group.slug !== 'larger-topics'");
    expect(builder).toContain(
      'for (const redirect of subject.redirectConcepts || [])',
    );
    expect(joinPage).toContain(
      'for (const redirect of subject.redirectConcepts || [])',
    );
  });

  it('scopes equivalent child names to their own larger-topic heading', () => {
    expect(presentation).toContain('`${row.group.id}:${candidate}`');
    expect(presentation).toContain('`${row.group.id}:${labelKey}`');
  });

  it('labels the picker and selected rows as subtopics without a generic header', () => {
    expect(builder).toContain('Choose subjects and subtopics');
    expect(builder).toContain('{group.name}');
    expect(builder).toContain("{groupSelected ? 'Clear' : 'Select all'}");
    expect(builder).toContain('subtopics selected');
    expect(builder).not.toContain('Combined source topic');
  });

  it('shows a larger topic directly when it has only one selectable subtopic', () => {
    expect(builder).toContain('fullGroup.concepts.length === 1');
    expect(builder).toContain('practiceSelectionLabel(');
    expect(builder).toContain('singletonPracticeConceptIds(catalog.subjects)');
    expect(builder).toContain('!isOnlySubtopic');
    expect(builder).toContain('<PickerConceptButton');
  });

  it('does not rewrite imported questions, variants, taxonomy, or assets', () => {
    expect(migration).toContain(
      "raise exception 'Parent/subtopic catalogue changed protected Question Bank counts'",
    );
    expect(migration).not.toMatch(
      /update public\.dp_qb_(questions|question_variants|topics|subtopics|assets)\b/i,
    );
    expect(migration).not.toMatch(
      /delete from public\.dp_qb_(questions|question_variants|topics|subtopics|assets)\b/i,
    );
  });
});
