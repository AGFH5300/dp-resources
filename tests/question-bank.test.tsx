import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content';
import { SolutionVideo } from '@/components/question-bank/solution-video';
import {
  normalizeQuestionSource,
  questionPreview,
} from '@/lib/question-bank/content-normalization';
import { parseInteractiveQuestion } from '@/lib/question-bank/interactive';
import { parseQuestionFilters } from '@/lib/question-bank/queries';
import {
  canonicalizeSourcePath,
  courseDescriptor,
  deterministicUuid,
  normalizeArchive,
  normalizeSection,
// The production importer is intentionally plain ESM so it runs without a build step.
// @ts-expect-error Direct integration coverage for that plain-ESM importer.
} from '../scripts/question-bank/archive.mjs';
import {
  htmlToQuestionSource,
  taxonomyName,
// @ts-expect-error Direct integration coverage for the plain-ESM PESTLE adapter.
} from '../scripts/question-bank/pestle.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function fixtureArchive() {
  const root = await mkdtemp(path.join(tmpdir(), 'dp-qb-test-'));
  temporaryDirectories.push(root);
  const q1 = '11111111-1111-4111-8111-111111111111';
  const q2 = '22222222-2222-4222-8222-222222222222';
  const paper = '33333333-3333-4333-8333-333333333333';
  const s1 = '44444444-4444-4444-8444-444444444444';
  const s2 = '55555555-5555-4555-8555-555555555555';
  const s3 = '66666666-6666-4666-8666-666666666666';
  const t1 = '77777777-7777-4777-8777-777777777777';
  const t2 = '88888888-8888-4888-8888-888888888888';
  const fileId = '99999999-9999-4999-8999-999999999999';
  const sourcePath = `public/question/${q1}/images/${fileId}/diagram 1.svg`;
  const archiveAssetPath = `assets/assets.revisionvillage.com/${sourcePath}`;
  await mkdir(path.dirname(path.join(root, archiveAssetPath)), { recursive: true });
  await writeFile(
    path.join(root, archiveAssetPath),
    '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>',
  );

  const catalog = [
    {
      chunkId: 1,
      encodedFilename: 'one',
      sourceFilename: 'ib-physics_sl_mechanics.js',
      subject: 'physics',
      course: 'sl',
      topic: 'mechanics',
      questionCount: 2,
      subtopicCount: 2,
      decryptedPath: 'decrypted-datasets/one.json',
    },
    {
      chunkId: 2,
      encodedFilename: 'two',
      sourceFilename: 'ib-physics_hl_mechanics.js',
      subject: 'physics',
      course: 'hl',
      topic: 'mechanics',
      questionCount: 1,
      subtopicCount: 1,
      decryptedPath: 'decrypted-datasets/two.json',
    },
  ];
  const dataset = (sourceFilename: string, course: string) => ({
    chunkId: course === 'sl' ? 1 : 2,
    encodedFilename: course,
    sourceFilename,
    subject: 'physics',
    course,
    topic: 'mechanics',
  });
  const paperData = {
    id: paper,
    reference: 'Paper 1',
    calculatorAllowed: false,
    formulaBooklet: {
      url: 'https://example.invalid/formula.pdf',
      filename: 'formula.pdf',
    },
  };
  const q1Data = (sourceFilename: string, course: string, subtopicId: string) => ({
    _dataset: dataset(sourceFilename, course),
    id: q1,
    reference: 'PH0001',
    content: `Find $\\ce{H2O}$ :marks[2].\n\n![diagram](question:${fileId})`,
    markScheme: ':answer[**2**]',
    maximumMark: 2,
    status: 'published',
    difficulty: { value: 40, difficultyLevel: 'easy' },
    paper: paperData,
    section: 'A',
    subtopicId,
    images: [
      {
        question_id: q1,
        file_id: fileId,
        filename: 'diagram 1.svg',
        path: sourcePath,
        content_type: 'image/svg+xml',
      },
    ],
    solutions: [
      {
        name: '',
        url: 'https://player.vimeo.com/video/12345?h=abc',
        hash: 'video-hash',
        file_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ],
    index: 0,
  });
  const questions = [
    q1Data('ib-physics_sl_mechanics.js', 'sl', s1),
    {
      _dataset: dataset('ib-physics_sl_mechanics.js', 'sl'),
      id: q2,
      reference: 'PH0002',
      content: '',
      markScheme: '',
      maximumMark: 0,
      status: 'published',
      difficulty: { value: 60, difficultyLevel: 'hard' },
      paper: paperData,
      section: 'OPTION C',
      subtopicId: s3,
      images: [],
      solutions: [],
      index: 1,
    },
    q1Data('ib-physics_hl_mechanics.js', 'hl', s3),
  ];
  const topics = [
    {
      _dataset: dataset('ib-physics_sl_mechanics.js', 'sl'),
      id: t1,
      subtopics: [
        { id: s1, name: 'Motion', slug: 'motion', index: 0, questions: [] },
        {
          id: s2,
          name: 'Forces',
          slug: 'forces',
          index: 1,
          questions: [
            { id: q1, name: 'PH0001', index: 0, difficulty: 40 },
            { id: q2, name: 'PH0002', index: 1, difficulty: 60 },
          ],
        },
      ],
    },
    {
      _dataset: dataset('ib-physics_hl_mechanics.js', 'hl'),
      id: t2,
      subtopics: [
        {
          id: s3,
          name: 'HL Motion',
          slug: 'hl-motion',
          index: 0,
          questions: [{ id: q1, name: 'PH0001', index: 0, difficulty: 40 }],
        },
      ],
    },
  ];
  const imageUrl = `https://assets.revisionvillage.com/${sourcePath}`;
  const manifest = [
    { url: imageUrl, status: 200, bytes: 62, path: archiveAssetPath, ok: true },
    {
      url: imageUrl.replace('diagram 1', 'diagram%201'),
      status: 200,
      bytes: 62,
      path: archiveAssetPath.replace('diagram 1', 'diagram%201'),
      ok: true,
    },
  ];
  await Promise.all([
    writeFile(path.join(root, 'summary.json'), JSON.stringify({ totalQuestions: 3 })),
    writeFile(path.join(root, 'dataset-catalog.json'), JSON.stringify(catalog)),
    writeFile(
      path.join(root, 'all-questions.ndjson'),
      `${questions.map((row) => JSON.stringify(row)).join('\n')}\n`,
    ),
    writeFile(
      path.join(root, 'all-topics.ndjson'),
      `${topics.map((row) => JSON.stringify(row)).join('\n')}\n`,
    ),
    writeFile(path.join(root, 'image-manifest.json'), JSON.stringify(manifest)),
    writeFile(path.join(root, 'image-urls.json'), JSON.stringify(manifest.map((row) => row.url))),
    writeFile(path.join(root, 'chunk-map.json'), JSON.stringify([])),
  ]);
  return root;
}

describe('question-bank archive normalization', () => {
  it('keeps stable IDs and canonicalizes encoded asset aliases', () => {
    expect(deterministicUuid('same')).toBe(deterministicUuid('same'));
    expect(deterministicUuid('same')).not.toBe(deterministicUuid('different'));
    expect(canonicalizeSourcePath('public/a/file%201.png')).toBe(
      canonicalizeSourcePath('public/a/file 1.png'),
    );
    expect(normalizeSection(' option  c ')).toBe('OPTION C');
    expect(courseDescriptor('math', 'analysis-and-approaches-hl').course.level).toBe(
      'HL',
    );
  });

  it('streams and normalizes cores, variants, placements, anomalies, and assets idempotently', async () => {
    const root = await fixtureArchive();
    const expectedCounts = {
      datasets: 2,
      questionOccurrences: 3,
      questionCores: 2,
      variants: 3,
      topics: 2,
      subtopics: 3,
      authoritativePlacements: 3,
      missingLocalPlacements: 1,
      imageManifestRows: 2,
      physicalImagePaths: 1,
      vimeoUrls: 1,
      formulaBookletUrls: 1,
      crossDatasetCanonicalSubtopics: 1,
      blankQuestionOccurrences: 1,
    };
    const first = await normalizeArchive(root, { expectedCounts, workers: 2 });
    const second = await normalizeArchive(root, { expectedCounts, workers: 2 });
    expect(first.verificationStatus).toBe('passed');
    expect(first.actualCounts).toMatchObject({
      questionCores: 2,
      variants: 3,
      authoritativePlacements: 3,
      fallbackPlacements: 1,
      storedPlacementRows: 4,
      physicalImagePaths: 1,
      contentDeduplicatedAssets: 1,
      crossDatasetCanonicalSubtopics: 1,
      blankQuestionOccurrences: 1,
    });
    expect(first.rows.questions.map((row: { id: string }) => row.id)).toEqual(
      second.rows.questions.map((row: { id: string }) => row.id),
    );
    expect(first.rows.assets.map((row: { id: string }) => row.id)).toEqual(
      second.rows.assets.map((row: { id: string }) => row.id),
    );
    expect(first.findings.some((row: { code: string }) => row.code === 'fallback_placement_created')).toBe(
      true,
    );
    expect(first.findings.some((row: { code: string }) => row.code === 'blank_question_occurrence')).toBe(
      true,
    );
  });

  it('fails closed when required archive files are absent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dp-qb-invalid-'));
    temporaryDirectories.push(root);
    await expect(normalizeArchive(root)).rejects.toThrow('missing required file');
  });
});

describe('controlled question renderer', () => {
  it('normalizes PESTLE HTML, MathML, and wrapped images into controlled source', () => {
    const source = htmlToQuestionSource(
      '<p>Calculate <math><msup><mi>x</mi><mn>2</mn></msup></math>.</p><p><sup><img alt="Graph" src="data:image/png;base64,abc"></sup></p>',
      [{ sourceFileId: '99999999-9999-4999-8999-999999999999' }],
    );
    expect(source).toContain('$x^{2}$');
    expect(source).toContain(
      '![Graph](question:99999999-9999-4999-8999-999999999999)',
    );
    expect(source).not.toMatch(/DPQBPROTECTEDTOKEN|<(?:img|math)\b/i);
    expect(taxonomyName('topic-5-calculus')).toBe('Topic 5: Calculus');
  });

  it('renders directives, KaTeX aligned math, mhchem, and protected images', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={String.raw`:answer[**A**] :marks[2] $\ce{H2O}$ $$\begin{aligned}x&=2\end{aligned}$$

![diagram](question:99999999-9999-4999-8999-999999999999)`}
        assets={[
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            sourceFileId: '99999999-9999-4999-8999-999999999999',
            role: 'question',
            sortOrder: 0,
            altText: 'Diagram',
          },
        ]}
      />,
    );
    expect(output).toContain('dp-qb-answer');
    expect(output).toContain('dp-qb-marks');
    expect(output).toContain('katex');
    expect(output).toContain('/api/question-bank/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('never interprets residual source HTML', () => {
    const output = renderToStaticMarkup(
      <QuestionContent source={'<script>alert(1)</script><img src=x onerror=alert(2)>'} />,
    );
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<img src="x"');
    expect(output).toContain('&lt;script&gt;');
  });

  it('removes imported layout debris without damaging protected images', () => {
    const source = String.raw`What does X represent? \hspace{1em}

![diagram](question:99999999-9999-4999-8999-999999999999)
\[© Revision Village 2022. Created with Chemix (https<no link>://chemix.org)\]
]{style="font-size:14px; line-height:1"}`;
    expect(normalizeQuestionSource(source)).toContain('What does X represent?');
    expect(normalizeQuestionSource(source)).toContain('![diagram](question:');
    expect(normalizeQuestionSource(source)).not.toMatch(/hspace|Revision Village|style=/i);
    expect(questionPreview(source)).toBe('What does X represent? Diagram.');
    expect(
      normalizeQuestionSource(':marks[2]{style="font-size:14px"}'),
    ).toBe(':marks[2]');
    expect(questionPreview('| A | Photosynthesis |')).not.toContain('|');
  });

  it('removes an orphan slash before explanation text', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        kind="markscheme"
        source={String.raw`:answer[**A**]

Explanation: \ Photolysis splits water.`}
      />,
    );
    expect(output).toContain('Explanation: Photolysis');
    expect(output).not.toContain('Explanation: \\');
    expect(normalizeQuestionSource(String.raw`$$a \\ b$$`)).toBe(
      String.raw`$$a \\ b$$`,
    );
  });

  it('opens private Vimeo solutions externally instead of embedding a broken player', () => {
    const output = renderToStaticMarkup(
      <SolutionVideo
        url="https://player.vimeo.com/video/12345?h=abc"
        title="BIO065 solution"
      />,
    );
    expect(output).toContain('https://vimeo.com/12345/abc');
    expect(output).toContain('privacy settings');
    expect(output).not.toContain('<iframe');
  });
});

describe('interactive question experience', () => {
  it('extracts contiguous answer choices and the correct answer without duplicating them in the prompt', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`Which expression is equivalent to $x^2$?

| A | $x + x$ |
| B | $x \times x$ |
| C | $2x$ |
| D | $x / 2$ |`,
      ':answer[**B**]\nMultiplication gives the square; the alternatives do not.',
    );
    expect(parsed.prompt).toContain('Which expression');
    expect(parsed.prompt).not.toContain('| A |');
    expect(parsed.choices.map((choice) => choice.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(parsed.choices[1].source).toBe('$x \\times x$');
    expect(parsed.correctChoiceId).toBe('B');
  });

  it('keeps free-response questions intact for reveal-and-self-assess mode', () => {
    const parsed = parseInteractiveQuestion(
      'Explain why the reaction rate increases with temperature.',
      ':answer[More successful collisions.]',
    );
    expect(parsed.prompt).toContain('Explain why');
    expect(parsed.choices).toEqual([]);
    expect(parsed.correctChoiceId).toBeNull();
  });
});

describe('question filters and production security expectations', () => {
  const migration = readFileSync(
    'supabase/migrations/20260721172634_question_bank.sql',
    'utf8',
  );
  const stateRoute = readFileSync('app/api/question-bank/state/route.ts', 'utf8');
  const assetRoute = readFileSync(
    'app/api/question-bank/assets/[assetId]/route.ts',
    'utf8',
  );
  const header = readFileSync('components/app-header.tsx', 'utf8');

  it('normalizes pagination and URL-backed filters', () => {
    expect(
      parseQuestionFilters({
        page: '-4',
        difficulty: 'hard',
        calculator: 'false',
        status: 'completed',
        saved: 'true',
        subtopic: '44444444-4444-4444-8444-444444444444',
        section: '__any__',
      }),
    ).toMatchObject({
      page: 1,
      difficulty: 'hard',
      calculator: false,
      status: 'completed',
      saved: true,
      subtopicId: null,
      section: null,
    });
  });

  it('uses dependent custom filters, universal search, and an in-page practice workspace', () => {
    const landingPage = readFileSync('app/question-bank/page.tsx', 'utf8');
    const coursePage = readFileSync(
      'app/question-bank/[subjectSlug]/[courseSlug]/page.tsx',
      'utf8',
    );
    const filters = readFileSync(
      'components/question-bank/question-bank-filters.tsx',
      'utf8',
    );
    const workspace = readFileSync(
      'components/question-bank/course-practice-workspace.tsx',
      'utf8',
    );
    const legacyPage = readFileSync(
      'app/question-bank/[subjectSlug]/[courseSlug]/questions/[variantId]/page.tsx',
      'utf8',
    );
    const searchPage = readFileSync(
      'app/question-bank/search/page.tsx',
      'utf8',
    );
    const stateControls = readFileSync(
      'components/question-bank/question-state-controls.tsx',
      'utf8',
    );
    expect(coursePage).toContain('Search everything');
    expect(coursePage).toContain('CoursePracticeWorkspace');
    expect(landingPage).not.toContain('IB Diploma Programme');
    expect(landingPage).not.toContain('Sparkles');
    expect(landingPage).toContain('id={`subject-${subject.slug}`}');
    expect(coursePage).not.toContain('Practice workspace');
    expect(coursePage).not.toContain('Sparkles');
    expect(coursePage).toContain(
      'href={`/question-bank#subject-${route.subjectSlug}`}',
    );
    expect(coursePage).toContain('aria-current="page"');
    expect(filters).toContain('AppSelect');
    expect(filters).toContain('disabled={!selectedTopic}');
    expect(filters).not.toContain('<select');
    expect(workspace).toContain('role="radiogroup"');
    expect(workspace).toContain('onClick={() => void checkAnswer(choice.id)}');
    expect(workspace).not.toContain("{answerChecked ? 'Answer checked' : 'Check answer'}");
    expect(workspace).toContain('Why the answer works—and why the alternatives do not');
    expect(workspace).toContain('questionPreview(question.content_preview)');
    expect(workspace).toContain('applyQuestionState(detail.variant.id');
    expect(workspace).toContain('onStateChange={(state) =>');
    expect(coursePage).toContain('selectedQuestion(rawParams.question)');
    expect(searchPage).toContain('questionPreview(row.content_preview)');
    expect(searchPage).toContain('?question=${row.variant_id}');
    expect(stateControls).toContain("toast.success(");
    expect(stateControls).toContain('Added to your review-later list.');
    expect(stateControls).toContain('onStateChange?.({');
    expect(legacyPage).toContain('redirect(');
  });

  it('enables RLS everywhere and isolates progress and saved rows by auth.uid()', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('private.dp_qb_has_access()');
    expect(migration).toContain('(select auth.uid()) = user_id');
    expect(migration).toContain('question bank users update own progress');
    expect(migration).toContain('question bank users delete own saved questions');
    expect(migration).toContain('revoke all on table public.dp_qb_user_progress');
  });

  it('protects mutations and private immutable assets server-side', () => {
    expect(stateRoute).toContain('sameOriginOrForbidden');
    expect(stateRoute).toContain('requireMember');
    expect(stateRoute).toContain(".eq('user_id', user.id)");
    expect(assetRoute).toContain('requireMember');
    expect(assetRoute).toContain(".eq('verification_status', 'verified')");
    expect(assetRoute).toContain('getPrivateR2Object');
    expect(assetRoute).toContain("default-src 'none'; sandbox");
  });

  it('preserves examiner reports without broadening question-bank access', () => {
    const migration = readFileSync(
      'supabase/migrations/20260723140000_question_bank_examiner_reports.sql',
      'utf8',
    );
    const questionRoute = readFileSync(
      'app/api/question-bank/questions/[variantId]/route.ts',
      'utf8',
    );
    const workspace = readFileSync(
      'components/question-bank/course-practice-workspace.tsx',
      'utf8',
    );
    expect(migration).toContain('examiner_report text not null');
    expect(migration).toContain("'examiner_report'");
    expect(questionRoute).toContain('examinerReport: question.examiner_report');
    expect(workspace).toContain('Read the examiner report');
  });

  it('adds the question bank to desktop and six-item mobile navigation', () => {
    expect(header).toContain("['/question-bank', 'Question Bank', 0]");
    expect(header).toContain("['/question-bank', 'Questions', BookOpenCheck]");
    expect(header).toContain('grid-cols-6');
  });
});
