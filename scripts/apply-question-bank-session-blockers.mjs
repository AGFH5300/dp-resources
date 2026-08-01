import { readFileSync, writeFileSync, rmSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Patch target is not unique: ${label}`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

function replaceRegexOnce(source, pattern, after, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1)
    throw new Error(`Expected one regex patch target for ${label}, found ${matches.length}`);
  return source.replace(pattern, after);
}

const codeEntryPath = 'components/question-bank/practice-code-entry.tsx';
let codeEntry = read(codeEntryPath);
codeEntry = replaceOnce(
  codeEntry,
  "import { FormEvent, useState } from 'react';\n",
  "import { FormEvent, useState } from 'react';\n\nimport styles from './practice-code-entry.module.css';\n",
  'practice code styles import',
);
codeEntry = replaceOnce(
  codeEntry,
  'className={`flex min-h-12 flex-1 items-center gap-3 rounded-xl border bg-white px-4 transition focus-within:ring-2 dark:bg-slate-950 ${',
  'className={`${styles.shell} flex min-h-12 flex-1 items-center gap-3 rounded-xl border px-4 transition focus-within:ring-2 ${',
  'practice code shell background',
);
codeEntry = replaceOnce(
  codeEntry,
  'className="min-w-0 flex-1 border-0 bg-transparent py-3 font-mono text-lg font-semibold uppercase tracking-[0.12em] text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"',
  'className={`${styles.input} min-w-0 flex-1 border-0 py-3 font-mono text-lg font-semibold uppercase tracking-[0.12em] outline-none placeholder:text-slate-400`}',
  'practice code input class',
);
write(codeEntryPath, codeEntry);

write(
  'components/question-bank/practice-code-entry.module.css',
  `.shell {\n  --practice-code-background: #ffffff;\n  --practice-code-text: #0f172a;\n  background: var(--practice-code-background);\n}\n\n.input,\n.input:focus,\n.input:active {\n  background: transparent !important;\n  color: var(--practice-code-text);\n}\n\n.input:-webkit-autofill,\n.input:-webkit-autofill:hover,\n.input:-webkit-autofill:focus,\n.input:-webkit-autofill:active {\n  -webkit-box-shadow: 0 0 0 1000px var(--practice-code-background) inset !important;\n  -webkit-text-fill-color: var(--practice-code-text) !important;\n  caret-color: var(--practice-code-text);\n  transition: background-color 9999s ease-out 0s;\n}\n\n:global(html[data-theme='dark']) .shell {\n  --practice-code-background: #020617;\n  --practice-code-text: #f1f5f9;\n}\n`,
);

write(
  'components/question-bank/question-bank-join-modal.tsx',
  `'use client';\n\nimport { ArrowRight, KeyRound, X } from 'lucide-react';\nimport { usePathname, useRouter, useSearchParams } from 'next/navigation';\nimport { useEffect, useState } from 'react';\n\nimport { PracticeCodeEntry } from '@/components/question-bank/practice-code-entry';\n\nexport function QuestionBankJoinModal() {\n  const pathname = usePathname();\n  const router = useRouter();\n  const searchParams = useSearchParams();\n  const [open, setOpen] = useState(searchParams.get('join') === '1');\n\n  useEffect(() => {\n    if (searchParams.get('join') === '1') setOpen(true);\n  }, [searchParams]);\n\n  useEffect(() => {\n    if (!open) return;\n    const previousOverflow = document.body.style.overflow;\n    document.body.style.overflow = 'hidden';\n    const onKeyDown = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') close();\n    };\n    window.addEventListener('keydown', onKeyDown);\n    return () => {\n      document.body.style.overflow = previousOverflow;\n      window.removeEventListener('keydown', onKeyDown);\n    };\n  }, [open]);\n\n  function close() {\n    setOpen(false);\n    if (searchParams.get('join') === '1') router.replace(pathname, { scroll: false });\n  }\n\n  return (\n    <>\n      <button\n        type="button"\n        onClick={() => setOpen(true)}\n        className="group w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"\n      >\n        <span className="flex items-start gap-4">\n          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-200 dark:group-hover:bg-blue-900/55">\n            <KeyRound className="size-5" />\n          </span>\n          <span className="min-w-0 flex-1">\n            <strong className="text-lg text-[color:var(--dp-navy)]">\n              Join with a code\n            </strong>\n            <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">\n              Load a permanent shared configuration, then use exact questions or\n              customize it for your own progress.\n            </span>\n          </span>\n          <ArrowRight className="mt-1 size-5 text-blue-500 transition group-hover:translate-x-1 group-hover:text-blue-800" />\n        </span>\n      </button>\n\n      {open ? (\n        <div\n          className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"\n          role="presentation"\n          onMouseDown={(event) => {\n            if (event.currentTarget === event.target) close();\n          }}\n        >\n          <section\n            role="dialog"\n            aria-modal="true"\n            aria-labelledby="join-practice-title"\n            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6"\n          >\n            <div className="flex items-start gap-3">\n              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">\n                <KeyRound className="size-5" />\n              </div>\n              <div className="min-w-0 flex-1">\n                <h2\n                  id="join-practice-title"\n                  className="text-lg font-semibold text-slate-900 dark:text-slate-50"\n                >\n                  Join with a practice-set code\n                </h2>\n                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">\n                  Enter the code shared with you. You can use the exact questions,\n                  generate a fresh set, or customize the configuration.\n                </p>\n              </div>\n              <button\n                type="button"\n                onClick={close}\n                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"\n                aria-label="Close join dialog"\n              >\n                <X className="size-5" />\n              </button>\n            </div>\n            <PracticeCodeEntry />\n          </section>\n        </div>\n      ) : null}\n    </>\n  );\n}\n`,
);

const landingPath = 'app/question-bank/page.tsx';
let landing = read(landingPath);
landing = replaceOnce(landing, '  KeyRound,\n', '', 'remove landing KeyRound import');
landing = replaceOnce(
  landing,
  "import { Nav } from '@/components/nav';\n",
  "import { Nav } from '@/components/nav';\nimport { QuestionBankJoinModal } from '@/components/question-bank/question-bank-join-modal';\n",
  'landing join modal import',
);
landing = replaceRegexOnce(
  landing,
  /\n          <Link\n            href="\/question-bank\/join"[\s\S]*?\n          <\/Link>\n        <\/section>/,
  '\n          <QuestionBankJoinModal />\n        </section>',
  'landing join card',
);
write(landingPath, landing);

write(
  'app/question-bank/join/page.tsx',
  `export const dynamic = 'force-dynamic';\n\nimport { redirect } from 'next/navigation';\n\nimport { requireMember } from '@/lib/auth';\n\nexport default async function JoinPracticeSetPage() {\n  await requireMember();\n  redirect('/question-bank?join=1');\n}\n`,
);

const normalizationPath = 'lib/question-bank/content-normalization.ts';
let normalization = read(normalizationPath);
normalization = replaceOnce(
  normalization,
  "const MAXIMUM_MARK_LINE =\n  /^\\s*\\\\*\\[\\s*maximum\\s+marks?\\s*:\\s*\\d+\\s*\\\\*\\]\\s*\\\\*\\s*$/i;",
  "const MAXIMUM_MARK_LINE =\n  /^\\s*\\\\*\\[\\s*(?:maximum\\s+marks?|puntaje\\s+m[aá]ximo|puntuaci[oó]n\\s+m[aá]xima|nota\\s+m[aá]xima)\\s*:\\s*\\d+\\s*\\\\*\\]\\s*\\\\*\\s*$/iu;",
  'localized maximum mark line',
);
write(normalizationPath, normalization);

const builderPath = 'components/question-bank/practice-set-builder-v4.tsx';
let builder = read(builderPath);
builder = replaceOnce(
  builder,
  `\n  useEffect(() => {\n    if (!preview) return;\n    setBlocks((current) => {\n      let changed = false;\n      const next = current.map((block) => {\n        const row = preview.blocks.find((item) => item.key === block.key);\n        if (!row || block.requestedCount <= row.candidateCount) return block;\n        changed = true;\n        return { ...block, requestedCount: row.candidateCount };\n      });\n      return changed ? next : current;\n    });\n  }, [preview]);\n`,
  '\n',
  'remove preview count mutation',
);
builder = replaceOnce(
  builder,
  `  function removeSubject(subjectId: string) {\n    setBlocks((current) =>\n      current.filter((block) => block.subjectId !== subjectId),\n    );\n  }\n\n  function toggleCourse`,
  `  function removeSubject(subjectId: string) {\n    setBlocks((current) =>\n      current.filter((block) => block.subjectId !== subjectId),\n    );\n  }\n\n  function useAllCourses(block: BuilderBlock) {\n    const courseIds = block.concept.courses.map((course) => course.id);\n    const upper = block.concept.courses.reduce(\n      (total, course) => total + course.questionCount,\n      0,\n    );\n    updateBlock(block.key, {\n      courseIds,\n      requestedCount: Math.max(1, Math.min(block.requestedCount || 1, upper || 1)),\n    });\n  }\n\n  function useAllCoursesForAllBlocks() {\n    setBlocks((current) =>\n      current.map((block) => {\n        const courseIds = block.concept.courses.map((course) => course.id);\n        const upper = block.concept.courses.reduce(\n          (total, course) => total + course.questionCount,\n          0,\n        );\n        return {\n          ...block,\n          courseIds,\n          requestedCount: Math.max(\n            1,\n            Math.min(block.requestedCount || 1, upper || 1),\n          ),\n        };\n      }),\n    );\n  }\n\n  function toggleCourse`,
  'all course helpers',
);
builder = replaceOnce(
  builder,
  'requestedCount: Math.max(0, Math.min(maximum, Math.floor(requested || 0))),',
  'requestedCount: Math.max(maximum > 0 ? 1 : 0, Math.min(maximum, Math.floor(requested || 0))),',
  'minimum requested count',
);
builder = replaceRegexOnce(
  builder,
  /  async function maximizeAll\(\) \{[\s\S]*?\n  \}\n\n  async function startSession/,
  `  async function maximizeAll() {\n    if (!configuration || isMaximizing) return;\n    setIsMaximizing(true);\n\n    async function requestMaximum(nextConfiguration: PracticeConfiguration) {\n      const response = await fetch('/api/question-bank/practice-builder/maximize', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ configuration: nextConfiguration }),\n      });\n      const payload = await response.json();\n      if (!response.ok)\n        throw new Error(payload.error || 'Unable to calculate the maximum.');\n      return payload.maximum as PracticeMaximumPreview;\n    }\n\n    function configurationFor(nextBlocks: BuilderBlock[]) {\n      const byKey = new Map(nextBlocks.map((block) => [block.key, block]));\n      return {\n        ...configuration,\n        blocks: configuration.blocks.map((configuredBlock) => {\n          if (configuredBlock.selectionType !== 'concept') return configuredBlock;\n          const block = byKey.get(configuredBlock.key);\n          return block\n            ? {\n                ...configuredBlock,\n                courseIds: [...block.courseIds],\n                requestedCount: Math.max(1, block.requestedCount),\n              }\n            : configuredBlock;\n        }),\n      } satisfies PracticeConfiguration;\n    }\n\n    try {\n      let workingBlocks = blocks;\n      let maximum = await requestMaximum(configuration);\n      const zeroCandidateKeys = new Set(\n        maximum.blocks\n          .filter((result) => result.candidateCount < 1)\n          .map((result) => result.key),\n      );\n\n      if (zeroCandidateKeys.size) {\n        workingBlocks = blocks.map((block) =>\n          zeroCandidateKeys.has(block.key)\n            ? {\n                ...block,\n                courseIds: block.concept.courses.map((course) => course.id),\n                requestedCount: Math.max(1, block.requestedCount),\n              }\n            : block,\n        );\n        maximum = await requestMaximum(configurationFor(workingBlocks));\n      }\n\n      const unresolved = maximum.blocks.filter(\n        (result) => result.candidateCount < 1 || result.recommendedCount < 1,\n      );\n      if (unresolved.length)\n        throw new Error(\n          \\`\\${unresolved.length} selected topic\\${unresolved.length === 1 ? '' : 's'} could not supply a question. Try clearing restrictive filters.\\`,\n        );\n\n      const byKey = new Map(maximum.blocks.map((result) => [result.key, result]));\n      setBlocks(\n        workingBlocks.map((block) => {\n          const result = byKey.get(block.key);\n          return result\n            ? { ...block, requestedCount: result.recommendedCount }\n            : block;\n        }),\n      );\n      toast.success(\n        \\`Maximized to \\${maximum.totalUniqueAllocated.toLocaleString()} unique questions across the selected topics.\\${\n          zeroCandidateKeys.size\n            ? ' Topics without matches in their earlier course choice were expanded to all available courses.'\n            : ''\n        }\\`,\n      );\n    } catch (error) {\n      toast.error(\n        error instanceof Error\n          ? error.message\n          : 'Unable to calculate the maximum.',\n      );\n    } finally {\n      setIsMaximizing(false);\n    }\n  }\n\n  async function startSession`,
  'maximize all fallback',
);
builder = replaceOnce(
  builder,
  `              <div className="flex flex-wrap gap-2">\n                <button\n                  type="button"\n                  disabled={!configuration || isMaximizing}`,
  `              <div className="flex flex-wrap gap-2">\n                <button\n                  type="button"\n                  disabled={blocks.every(\n                    (block) =>\n                      block.courseIds.length === block.concept.courses.length,\n                  )}\n                  onClick={useAllCoursesForAllBlocks}\n                  className={\\`${styles.countButton} inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold\\`}\n                >\n                  <CheckSquare2 className="size-4" />\n                  Use all courses\n                </button>\n                <button\n                  type="button"\n                  disabled={!configuration || isMaximizing}`,
  'global all courses button',
);
builder = replaceOnce(
  builder,
  `              const maximum = maximumForBlock(block, blockPreview);\n              return (`,
  `              const maximum = maximumForBlock(block, blockPreview);\n              const allCoursesSelected =\n                block.courseIds.length === block.concept.courses.length;\n              return (`,
  'all courses selected state',
);
builder = replaceOnce(
  builder,
  `                    <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">\n                      Courses for this topic\n                    </legend>\n                    <div className="mt-2 grid gap-2 sm:grid-cols-2">`,
  `                    <div className="flex items-center justify-between gap-3">\n                      <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">\n                        Courses for this topic\n                      </legend>\n                      <button\n                        type="button"\n                        disabled={allCoursesSelected}\n                        onClick={() => useAllCourses(block)}\n                        className={\\`${styles.countButton} rounded-lg border px-3 py-1.5 text-xs font-semibold\\`}\n                      >\n                        {allCoursesSelected ? 'All courses selected' : 'Use all courses'}\n                      </button>\n                    </div>\n                    <div className="mt-2 grid gap-2 sm:grid-cols-2">`,
  'per topic all courses button',
);
write(builderPath, builder);

const readinessPath = 'tests/question-bank-practice-builder-production-readiness.test.ts';
let readiness = read(readinessPath);
readiness = replaceOnce(
  readiness,
  "    const joinModal = read('app/question-bank/join/page.tsx');\n",
  "    const joinModal = read(\n      'components/question-bank/question-bank-join-modal.tsx',\n    );\n    const joinRoute = read('app/question-bank/join/page.tsx');\n",
  'readiness join modal source',
);
readiness = replaceOnce(
  readiness,
  "    expect(joinModal).toContain('aria-modal=\"true\"');\n",
  "    expect(joinModal).toContain('aria-modal=\"true\"');\n    expect(joinRoute).toContain(\"redirect('/question-bank?join=1')\");\n",
  'readiness join redirect assertion',
);
write(readinessPath, readiness);

write(
  'tests/question-bank-session-blockers.test.ts',
  `import { readFileSync } from 'node:fs';\n\nimport { describe, expect, it } from 'vitest';\n\nimport { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';\n\nconst read = (path: string) => readFileSync(path, 'utf8');\n\ndescribe('Question Bank session blocker fixes', () => {\n  it('removes localized maximum-mark preambles already represented by the marks badge', () => {\n    const source = String.raw\\`[Puntaje máximo: 5\\\\]\\n\\n**Vas a escuchar un pódcast.**\\`;\n    expect(normalizeQuestionSource(source)).toBe('**Vas a escuchar un pódcast.**');\n  });\n\n  it('opens Join as an in-page modal and keeps the legacy route as a redirect', () => {\n    const landing = read('app/question-bank/page.tsx');\n    const modal = read(\n      'components/question-bank/question-bank-join-modal.tsx',\n    );\n    const route = read('app/question-bank/join/page.tsx');\n\n    expect(landing).toContain('<QuestionBankJoinModal />');\n    expect(landing).not.toContain('href="/question-bank/join"');\n    expect(modal).toContain('role="dialog"');\n    expect(modal).toContain('aria-modal="true"');\n    expect(modal).toContain('event.currentTarget === event.target');\n    expect(route).toContain("redirect('/question-bank?join=1')");\n  });\n\n  it('prevents browser focus and autofill from repainting the code input', () => {\n    const entry = read('components/question-bank/practice-code-entry.tsx');\n    const styles = read(\n      'components/question-bank/practice-code-entry.module.css',\n    );\n\n    expect(entry).toContain('styles.shell');\n    expect(entry).toContain('styles.input');\n    expect(styles).toContain('.input:-webkit-autofill');\n    expect(styles).toContain('var(--practice-code-background)');\n    expect(styles).toContain('background: transparent !important');\n  });\n\n  it('never silently changes topic amounts from preview responses', () => {\n    const builder = read(\n      'components/question-bank/practice-set-builder-v4.tsx',\n    );\n\n    expect(builder).not.toContain('requestedCount: row.candidateCount');\n    expect(builder).toContain('Use all courses');\n    expect(builder).toContain('useAllCoursesForAllBlocks');\n    expect(builder).toContain('zeroCandidateKeys');\n    expect(builder).toContain('result.recommendedCount < 1');\n  });\n});\n`,
);

const changelogPath = 'lib/changelog.ts';
let changelog = read(changelogPath);
changelog = replaceOnce(
  changelog,
  "    'Cleaned duplicated Biology topic labels, improved availability speed, fixed fullscreen practice, and added clearer shared-code validation.',\n",
  "    'Cleaned duplicated Biology topic labels, improved availability speed, fixed fullscreen practice, and added clearer shared-code validation.',\n    'Fixed practice-set creation blockers by stabilizing question amounts, adding all-course controls, improving Join as an in-page modal, and cleaning imported language score labels.',\n",
  'August 1 changelog entry',
);
write(changelogPath, changelog);

rmSync('scripts/apply-question-bank-session-blockers.mjs');
rmSync('.github/workflows/apply-question-bank-session-blockers.yml');
