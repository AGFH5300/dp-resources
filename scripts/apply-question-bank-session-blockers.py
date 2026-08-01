from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(content, encoding="utf-8")


def replace_once(source: str, before: str, after: str, label: str) -> str:
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one patch target for {label}, found {count}")
    return source.replace(before, after, 1)


def replace_regex_once(source: str, pattern: str, after: str, label: str) -> str:
    result, count = re.subn(pattern, after, source, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError(f"Expected one regex patch target for {label}, found {count}")
    return result


code_entry_path = "components/question-bank/practice-code-entry.tsx"
code_entry = read(code_entry_path)
code_entry = replace_once(
    code_entry,
    "import { FormEvent, useState } from 'react';\n",
    "import { FormEvent, useState } from 'react';\n\nimport styles from './practice-code-entry.module.css';\n",
    "practice code styles import",
)
code_entry = replace_once(
    code_entry,
    "className={`flex min-h-12 flex-1 items-center gap-3 rounded-xl border bg-white px-4 transition focus-within:ring-2 dark:bg-slate-950 ${",
    "className={`${styles.shell} flex min-h-12 flex-1 items-center gap-3 rounded-xl border px-4 transition focus-within:ring-2 ${",
    "practice code shell background",
)
code_entry = replace_once(
    code_entry,
    'className="min-w-0 flex-1 border-0 bg-transparent py-3 font-mono text-lg font-semibold uppercase tracking-[0.12em] text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"',
    'className={`${styles.input} min-w-0 flex-1 border-0 py-3 font-mono text-lg font-semibold uppercase tracking-[0.12em] outline-none placeholder:text-slate-400`}',
    "practice code input class",
)
write(code_entry_path, code_entry)

write(
    "components/question-bank/practice-code-entry.module.css",
    """.shell {
  --practice-code-background: #ffffff;
  --practice-code-text: #0f172a;
  background: var(--practice-code-background);
}

.input,
.input:focus,
.input:active {
  background: transparent !important;
  color: var(--practice-code-text);
}

.input:-webkit-autofill,
.input:-webkit-autofill:hover,
.input:-webkit-autofill:focus,
.input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 1000px var(--practice-code-background) inset !important;
  -webkit-text-fill-color: var(--practice-code-text) !important;
  caret-color: var(--practice-code-text);
  transition: background-color 9999s ease-out 0s;
}

:global(html[data-theme='dark']) .shell {
  --practice-code-background: #020617;
  --practice-code-text: #f1f5f9;
}
""",
)

write(
    "components/question-bank/question-bank-join-modal.tsx",
    """'use client';

import { ArrowRight, KeyRound, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PracticeCodeEntry } from '@/components/question-bank/practice-code-entry';

export function QuestionBankJoinModal() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(searchParams.get('join') === '1');

  useEffect(() => {
    if (searchParams.get('join') === '1') setOpen(true);
  }, [searchParams]);

  const close = useCallback(() => {
    setOpen(false);
    if (searchParams.get('join') !== '1') return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('join');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      >
        <span className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-200 dark:group-hover:bg-blue-900/55">
            <KeyRound className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="text-lg text-[color:var(--dp-navy)]">
              Join with a code
            </strong>
            <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
              Load a permanent shared configuration, then use exact questions or
              customize it for your own progress.
            </span>
          </span>
          <ArrowRight className="mt-1 size-5 text-blue-500 transition group-hover:translate-x-1 group-hover:text-blue-800" />
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-practice-title"
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
                <KeyRound className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="join-practice-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-50"
                >
                  Join with a practice-set code
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Enter the code shared with you. You can use the exact questions,
                  generate a fresh set, or customize the configuration.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Close join dialog"
              >
                <X className="size-5" />
              </button>
            </div>
            <PracticeCodeEntry />
          </section>
        </div>
      ) : null}
    </>
  );
}
""",
)

landing_path = "app/question-bank/page.tsx"
landing = read(landing_path)
landing = replace_once(landing, "  KeyRound,\n", "", "remove landing KeyRound import")
landing = replace_once(
    landing,
    "import { Nav } from '@/components/nav';\n",
    "import { Nav } from '@/components/nav';\nimport { QuestionBankJoinModal } from '@/components/question-bank/question-bank-join-modal';\n",
    "landing join modal import",
)
landing = replace_regex_once(
    landing,
    r'\n          <Link\n            href="/question-bank/join"[\s\S]*?\n          </Link>\n        </section>',
    "\n          <QuestionBankJoinModal />\n        </section>",
    "landing join card",
)
write(landing_path, landing)

write(
    "app/question-bank/join/page.tsx",
    """export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

import { requireMember } from '@/lib/auth';

export default async function JoinPracticeSetPage() {
  await requireMember();
  redirect('/question-bank?join=1');
}
""",
)

normalization_path = "lib/question-bank/content-normalization.ts"
normalization = read(normalization_path)
normalization = replace_once(
    normalization,
    """const MAXIMUM_MARK_LINE =
  /^\\s*\\\\*\\[\\s*maximum\\s+marks?\\s*:\\s*\\d+\\s*\\\\*\\]\\s*\\\\*\\s*$/i;""",
    """const MAXIMUM_MARK_LINE =
  /^\\s*\\\\*\\[\\s*(?:maximum\\s+marks?|puntaje\\s+m[aá]ximo|puntuaci[oó]n\\s+m[aá]xima|nota\\s+m[aá]xima)\\s*:\\s*\\d+\\s*\\\\*\\]\\s*\\\\*\\s*$/iu;""",
    "localized maximum mark line",
)
write(normalization_path, normalization)

builder_path = "components/question-bank/practice-set-builder-v4.tsx"
builder = read(builder_path)
builder = replace_once(
    builder,
    """
  useEffect(() => {
    if (!preview) return;
    setBlocks((current) => {
      let changed = false;
      const next = current.map((block) => {
        const row = preview.blocks.find((item) => item.key === block.key);
        if (!row || block.requestedCount <= row.candidateCount) return block;
        changed = true;
        return { ...block, requestedCount: row.candidateCount };
      });
      return changed ? next : current;
    });
  }, [preview]);
""",
    "\n",
    "remove preview count mutation",
)
builder = replace_once(
    builder,
    """  function removeSubject(subjectId: string) {
    setBlocks((current) =>
      current.filter((block) => block.subjectId !== subjectId),
    );
  }

  function toggleCourse""",
    """  function removeSubject(subjectId: string) {
    setBlocks((current) =>
      current.filter((block) => block.subjectId !== subjectId),
    );
  }

  function useAllCourses(block: BuilderBlock) {
    const courseIds = block.concept.courses.map((course) => course.id);
    const upper = block.concept.courses.reduce(
      (total, course) => total + course.questionCount,
      0,
    );
    updateBlock(block.key, {
      courseIds,
      requestedCount: Math.max(1, Math.min(block.requestedCount || 1, upper || 1)),
    });
  }

  function useAllCoursesForAllBlocks() {
    setBlocks((current) =>
      current.map((block) => {
        const courseIds = block.concept.courses.map((course) => course.id);
        const upper = block.concept.courses.reduce(
          (total, course) => total + course.questionCount,
          0,
        );
        return {
          ...block,
          courseIds,
          requestedCount: Math.max(
            1,
            Math.min(block.requestedCount || 1, upper || 1),
          ),
        };
      }),
    );
  }

  function toggleCourse""",
    "all course helpers",
)
builder = replace_once(
    builder,
    """      requestedCount: nextCourseIds.length
        ? Math.max(1, Math.min(block.requestedCount, upper || block.requestedCount))
        : 0,""",
    """      requestedCount: nextCourseIds.length
        ? Math.max(1, Math.min(block.requestedCount, upper || block.requestedCount))
        : Math.max(1, block.requestedCount),""",
    "keep count positive when courses are cleared",
)
builder = replace_once(
    builder,
    "requestedCount: Math.max(0, Math.min(maximum, Math.floor(requested || 0))),",
    "requestedCount: Math.max(maximum > 0 ? 1 : 0, Math.min(maximum, Math.floor(requested || 0))),",
    "minimum requested count",
)
builder = replace_regex_once(
    builder,
    r"  async function maximizeAll\(\) \{[\s\S]*?\n  \}\n\n  async function startSession",
    """  async function maximizeAll() {
    if (isMaximizing || !blocks.length) return;
    setIsMaximizing(true);

    const filters: PracticeFilters = {
      difficulties:
        difficulties as PracticeConfiguration['filters']['difficulties'],
      statuses: statuses as PracticeConfiguration['filters']['statuses'],
      saved,
      calculator,
    };

    function configurationFor(nextBlocks: BuilderBlock[]): PracticeConfiguration {
      return {
        schemaVersion: 1,
        orderingMode,
        filters,
        blocks: nextBlocks.map((block) => ({
          key: block.key,
          selectionType: 'concept' as const,
          conceptId: block.concept.id,
          courseIds: [...block.courseIds],
          requestedCount: Math.max(1, block.requestedCount),
          filters: { ...filters },
        })),
      };
    }

    async function requestMaximum(nextConfiguration: PracticeConfiguration) {
      const response = await fetch('/api/question-bank/practice-builder/maximize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration: nextConfiguration }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Unable to calculate the maximum.');
      return payload.maximum as PracticeMaximumPreview;
    }

    try {
      let workingBlocks = blocks.map((block) =>
        block.courseIds.length
          ? { ...block, requestedCount: Math.max(1, block.requestedCount) }
          : {
              ...block,
              courseIds: block.concept.courses.map((course) => course.id),
              requestedCount: Math.max(1, block.requestedCount),
            },
      );
      let maximum = await requestMaximum(configurationFor(workingBlocks));
      const zeroAllocationKeys = new Set(
        maximum.blocks
          .filter(
            (result) =>
              result.candidateCount < 1 || result.recommendedCount < 1,
          )
          .map((result) => result.key),
      );

      if (zeroAllocationKeys.size) {
        workingBlocks = workingBlocks.map((block) =>
          zeroAllocationKeys.has(block.key)
            ? {
                ...block,
                courseIds: block.concept.courses.map((course) => course.id),
                requestedCount: Math.max(1, block.requestedCount),
              }
            : block,
        );
        maximum = await requestMaximum(configurationFor(workingBlocks));
      }

      const unresolved = maximum.blocks.filter(
        (result) => result.candidateCount < 1 || result.recommendedCount < 1,
      );
      if (unresolved.length)
        throw new Error(
          unresolved.length +
            ' selected topic' +
            (unresolved.length === 1 ? '' : 's') +
            ' could not supply a unique question. Try clearing restrictive filters.',
        );

      const byKey = new Map(maximum.blocks.map((result) => [result.key, result]));
      setBlocks(
        workingBlocks.map((block) => {
          const result = byKey.get(block.key);
          return result
            ? { ...block, requestedCount: result.recommendedCount }
            : block;
        }),
      );
      toast.success(
        'Maximized to ' +
          maximum.totalUniqueAllocated.toLocaleString() +
          ' unique questions across the selected topics.' +
          (zeroAllocationKeys.size
            ? ' Topics with zero allocation were expanded to all available courses.'
            : ''),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to calculate the maximum.',
      );
    } finally {
      setIsMaximizing(false);
    }
  }

  async function startSession""",
    "maximize all fallback",
)
builder = replace_once(
    builder,
    """              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!configuration || isMaximizing}""",
    """              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={blocks.every(
                    (block) =>
                      block.courseIds.length === block.concept.courses.length,
                  )}
                  onClick={useAllCoursesForAllBlocks}
                  className={`${styles.countButton} inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold`}
                >
                  <CheckSquare2 className="size-4" />
                  Use all courses
                </button>
                <button
                  type="button"
                  disabled={isMaximizing}""",
    "global all courses button",
)
builder = replace_once(
    builder,
    """              const maximum = maximumForBlock(block, blockPreview);
              return (""",
    """              const maximum = maximumForBlock(block, blockPreview);
              const allCoursesSelected =
                block.courseIds.length === block.concept.courses.length;
              return (""",
    "all courses selected state",
)
builder = replace_once(
    builder,
    """                    <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Courses for this topic
                    </legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">""",
    """                    <div className="flex items-center justify-between gap-3">
                      <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Courses for this topic
                      </legend>
                      <button
                        type="button"
                        disabled={allCoursesSelected}
                        onClick={() => useAllCourses(block)}
                        className={`${styles.countButton} rounded-lg border px-3 py-1.5 text-xs font-semibold`}
                      >
                        {allCoursesSelected ? 'All courses selected' : 'Use all courses'}
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">""",
    "per topic all courses button",
)
write(builder_path, builder)

readiness_path = "tests/question-bank-practice-builder-production-readiness.test.ts"
readiness = read(readiness_path)
readiness = replace_once(
    readiness,
    "    const joinModal = read('app/question-bank/join/page.tsx');\n",
    """    const joinModal = read(
      'components/question-bank/question-bank-join-modal.tsx',
    );
    const joinRoute = read('app/question-bank/join/page.tsx');
""",
    "readiness join modal source",
)
readiness = replace_once(
    readiness,
    "    expect(joinModal).toContain('aria-modal=\"true\"');\n",
    """    expect(joinModal).toContain('aria-modal="true"');
    expect(joinRoute).toContain("redirect('/question-bank?join=1')");
""",
    "readiness join redirect assertion",
)
write(readiness_path, readiness)

write(
    "tests/question-bank-session-blockers.test.ts",
    """import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Question Bank session blocker fixes', () => {
  it('removes localized maximum-mark preambles already represented by the marks badge', () => {
    const source = '[Puntaje máximo: 5\\\\]\\n\\n**Vas a escuchar un pódcast.**';
    expect(normalizeQuestionSource(source)).toBe('**Vas a escuchar un pódcast.**');
  });

  it('opens Join as an in-page modal and keeps the legacy route as a redirect', () => {
    const landing = read('app/question-bank/page.tsx');
    const modal = read(
      'components/question-bank/question-bank-join-modal.tsx',
    );
    const route = read('app/question-bank/join/page.tsx');

    expect(landing).toContain('<QuestionBankJoinModal />');
    expect(landing).not.toContain('href="/question-bank/join"');
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('event.currentTarget === event.target');
    expect(route).toContain("redirect('/question-bank?join=1')");
  });

  it('prevents browser focus and autofill from repainting the code input', () => {
    const entry = read('components/question-bank/practice-code-entry.tsx');
    const styles = read(
      'components/question-bank/practice-code-entry.module.css',
    );

    expect(entry).toContain('styles.shell');
    expect(entry).toContain('styles.input');
    expect(styles).toContain('.input:-webkit-autofill');
    expect(styles).toContain('var(--practice-code-background)');
    expect(styles).toContain('background: transparent !important');
  });

  it('keeps preview read-only and guarantees Max all never writes zero', () => {
    const builder = read(
      'components/question-bank/practice-set-builder-v4.tsx',
    );

    expect(builder).not.toContain('requestedCount: row.candidateCount');
    expect(builder).toContain('Use all courses');
    expect(builder).toContain('useAllCoursesForAllBlocks');
    expect(builder).toContain('zeroAllocationKeys');
    expect(builder).toContain('result.recommendedCount < 1');
    expect(builder).toContain('if (isMaximizing || !blocks.length) return;');
  });
});
""",
)

changelog_path = "lib/changelog.ts"
changelog = read(changelog_path)
changelog = replace_once(
    changelog,
    "    'Cleaned duplicated Biology topic labels, improved availability speed, fixed fullscreen practice, and added clearer shared-code validation.',\n",
    """    'Cleaned duplicated Biology topic labels, improved availability speed, fixed fullscreen practice, and added clearer shared-code validation.',
    'Fixed practice-set creation blockers by stabilizing question amounts, adding all-course controls, improving Join as an in-page modal, and cleaning imported language score labels.',
""",
    "August 1 changelog entry",
)
write(changelog_path, changelog)

for temporary in (
    "scripts/apply-question-bank-session-blockers.mjs",
    "scripts/apply-question-bank-session-blockers.py",
    ".github/workflows/apply-question-bank-session-blockers.yml",
):
    path = Path(temporary)
    if path.exists():
        path.unlink()
