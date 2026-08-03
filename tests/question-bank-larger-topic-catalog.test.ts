import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { practiceCourseLabel } from '@/lib/question-bank/practice-course-label';

const migration = readFileSync(
  'supabase/migrations/20260803105736_question_bank_larger_topic_catalog.sql',
  'utf8',
);
const catalog = readFileSync('lib/question-bank/practice-catalog.ts', 'utf8');
const builder = readFileSync(
  'components/question-bank/practice-set-builder-v4.tsx',
  'utf8',
);
const joinPage = readFileSync('app/question-bank/join/[code]/page.tsx', 'utf8');
const icons = readFileSync('components/question-bank/subject-icon.tsx', 'utf8');

describe('Question Bank larger-topic catalogue', () => {
  it('builds one reviewed hierarchy without rewriting imported taxonomy', () => {
    expect(migration).toContain("'larger-topics'");
    expect(migration).toContain("'Larger topics'");
    expect(migration).toContain('legacy_concept_ids uuid[]');
    expect(migration).toContain("concept.slug not like 'larger-topic-%'");
    expect(migration).toContain("concept_group.slug <> 'larger-topics'");
    expect(migration).toContain(
      "raise exception 'Practice catalogue exposes mixed hierarchy generations'",
    );
    expect(migration).toContain(
      "raise exception 'Larger-topic catalogue migration changed protected Question Bank counts'",
    );
    expect(migration).not.toMatch(/update public\.dp_qb_(questions|question_variants|topics|subtopics|assets)\b/i);
    expect(migration).not.toMatch(/delete from public\.dp_qb_(questions|question_variants|topics|subtopics|assets)\b/i);
  });

  it('uses exact audited larger-topic counts for the affected subjects', () => {
    for (const expected of [
      "('biology', 18)",
      "('mathematics', 6)",
      "('physics', 10)",
      "('chemistry', 10)",
      "('business', 6)",
      "('psychology', 9)",
      "('economics', 4)",
      "('ess', 9)",
      "('geography', 14)",
    ]) {
      expect(migration).toContain(expected);
    }
    expect(migration).toContain("return 'Space, Time and Motion'");
    expect(migration).toContain("return 'Number and Algebra'");
    expect(migration).toContain(
      "return 'Structure 1: Models of the Particulate Nature of Matter'",
    );
    expect(migration).toContain(
      "raise exception 'A non-topic source label remains in the larger-topic catalogue'",
    );
  });

  it('restores old drafts and shares through legacy concept redirects', () => {
    expect(catalog).toContain('legacy_concept_ids');
    expect(catalog).toContain('legacyConceptIds: concept.legacy_concept_ids || []');
    expect(builder).toContain('for (const legacyConceptId of concept.legacyConceptIds || [])');
    expect(joinPage).toContain(
      'for (const legacyConceptId of concept.legacyConceptIds || [])',
    );
  });

  it('labels same-named current and legacy courses distinctly', () => {
    expect(
      practiceCourseLabel({
        name: 'Physics SL',
        syllabusLabel: 'First assessment 2025',
      }),
    ).toBe('Physics SL · First assessment 2025');
    expect(
      practiceCourseLabel({
        name: 'Physics SL',
        syllabusLabel: 'Legacy syllabus · Final assessment 2024',
      }),
    ).toBe('Physics SL · Legacy · Final assessment 2024');
    expect(builder).toContain('.map(practiceCourseLabel)');
    expect(joinPage).toContain('.map(practiceCourseLabel)');
  });

  it('assigns a non-fallback icon to every production subject', () => {
    const subjectMappings = [
      'biology: Dna',
      'business: BriefcaseBusiness',
      'chemistry: FlaskConical',
      "'computer-science': Binary",
      "'design-technology': DraftingCompass",
      "'digital-society': Network",
      'economics: ChartNoAxesCombined',
      'ess: Sprout',
      "'french-b': MessageCircle",
      'geography: Map',
      "'global-politics': Scale",
      'history: Landmark',
      'mathematics: Sigma',
      'physics: Atom',
      'psychology: Brain',
      "'spanish-b': MessagesSquare",
      "'sports-exercise-and-health-science': Activity",
    ];
    for (const mapping of subjectMappings) expect(icons).toContain(mapping);
    expect(icons).not.toMatch(/english-b|philosophy|world-religions/);
  });
});
