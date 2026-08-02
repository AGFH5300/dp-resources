export const dynamic = 'force-dynamic';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock3,
  KeyRound,
  Settings2,
} from 'lucide-react';

import { Nav } from '@/components/nav';
import { PracticeCodeEntry } from '@/components/question-bank/practice-code-entry';
import { PracticeShareExactButton } from '@/components/question-bank/practice-share-exact-button';
import { requireMember } from '@/lib/auth';
import { getPracticeBuilderCatalog } from '@/lib/question-bank/practice-catalog';
import { getPracticeShare } from '@/lib/question-bank/practice-share';

function buildCatalogIndexes(catalog: any) {
  const concepts = new Map<string, any>();
  const courses = new Map<string, any>();
  for (const subject of catalog.subjects || []) {
    for (const group of subject.groups || []) {
      for (const concept of group.concepts || []) {
        concepts.set(concept.id, { subject, group, concept });
        for (const sourceConceptId of concept.sourceConceptIds || [])
          concepts.set(sourceConceptId, { subject, group, concept });
        for (const course of concept.courses || []) courses.set(course.id, course);
      }
    }
  }
  return { concepts, courses };
}

export default async function SharedPracticeSetPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { membership } = await requireMember();
  const { code } = await params;
  const share = await getPracticeShare(code);

  if (!share) {
    return (
      <>
        <Nav
          admin={membership.role === 'admin'}
          email={membership.email}
          userId={membership.id}
        />
        <main className="mx-auto max-w-2xl px-4 py-8 pb-24 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900 dark:bg-slate-900 sm:p-8">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-200">
              <CircleAlert className="size-6" />
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              Invalid practice-set code
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
              That code does not match a shared practice configuration. Check the
              characters and try again.
            </p>
            <PracticeCodeEntry autoFocus={false} />
            <Link
              href="/question-bank"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              <ArrowLeft className="size-4" /> Return to Question Bank
            </Link>
          </section>
        </main>
      </>
    );
  }

  const catalog = await getPracticeBuilderCatalog();
  const { concepts, courses } = buildCatalogIndexes(catalog);
  const blocks = share.configuration.blocks
    .filter((block) => block.selectionType === 'concept')
    .map((block) => {
      if (block.selectionType !== 'concept') return null;
      const match = concepts.get(block.conceptId);
      if (!match) return null;
      return {
        key: block.key,
        subjectName: match.subject.name,
        groupName: match.group.name,
        conceptName: match.concept.name,
        requestedCount: block.requestedCount,
        courseNames: block.courseIds
          .map((courseId) => courses.get(courseId)?.name)
          .filter(Boolean),
      };
    })
    .filter(Boolean) as Array<{
    key: string;
    subjectName: string;
    groupName: string;
    conceptName: string;
    requestedCount: number;
    courseNames: string[];
  }>;
  const requestedTotal = share.configuration.blocks.reduce(
    (total, block) => total + block.requestedCount,
    0,
  );
  const subjectCount = new Set(blocks.map((block) => block.subjectName)).size;
  const baseBuilder = `/question-bank/build?code=${encodeURIComponent(share.code)}`;

  const presets = [
    {
      key: 'not_started',
      label: 'Not attempted',
      description: 'Generate from questions you have not started.',
      icon: Circle,
    },
    {
      key: 'in_progress',
      label: 'In progress',
      description: 'Focus on questions you previously started.',
      icon: Clock3,
    },
    {
      key: 'completed',
      label: 'Completed',
      description: 'Revisit questions already marked completed.',
      icon: CheckCircle2,
    },
    {
      key: 'saved',
      label: 'Saved only',
      description: 'Use your own saved questions within this setup.',
      icon: Bookmark,
    },
    {
      key: 'all',
      label: 'All eligible',
      description: 'Ignore progress and use the complete eligible pool.',
      icon: KeyRound,
    },
  ];

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Link
          href="/question-bank/join"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
        >
          <ArrowLeft className="size-4" /> Enter another code
        </Link>

        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-sm font-semibold tracking-[0.12em] text-blue-700 dark:text-blue-300">
                {share.code}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                {share.name}
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Created by <strong>{share.creatorLabel}</strong>
                {share.creatorDisplayName ? (
                  <span className="text-slate-500 dark:text-slate-400">
                    {' '}(@{share.creatorUsername})
                  </span>
                ) : null}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Questions</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {requestedTotal.toLocaleString()}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Subjects</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {subjectCount}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Topics</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {blocks.length}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {blocks.map((block) => (
              <article
                key={block.key}
                className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {block.subjectName} · {block.groupName}
                </p>
                <h2 className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {block.conceptName}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {block.requestedCount.toLocaleString()} questions ·{' '}
                  {block.courseNames.join(', ') || 'Selected courses'}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
            How would you like to use it?
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Every option creates your own independent session. The creator's answers,
            progress and saved state are never copied.
          </p>

          {share.hasExactQueue ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/35">
              <h3 className="font-semibold text-blue-950 dark:text-blue-100">
                Use the creator's exact queue
              </h3>
              <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">
                Copy the same question cores and order, while keeping all progress and
                answers separate under your account.
              </p>
              <div className="mt-3">
                <PracticeShareExactButton
                  code={share.code}
                  questionCount={share.exactQuestionCount}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {presets.map((preset) => {
              const Icon = preset.icon;
              return (
                <Link
                  key={preset.key}
                  href={`${baseBuilder}&preset=${preset.key}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-600"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="text-slate-900 dark:text-slate-100">
                        {preset.label}
                      </strong>
                      <span className="mt-1 block text-sm leading-5 text-slate-600 dark:text-slate-300">
                        {preset.description}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-700" />
                  </div>
                </Link>
              );
            })}

            <Link
              href={baseBuilder}
              className="group rounded-2xl border border-blue-300 bg-blue-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-md dark:border-blue-800 dark:bg-blue-950/35 dark:hover:border-blue-500"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
                  <Settings2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="text-blue-950 dark:text-blue-100">
                    Fully customize
                  </strong>
                  <span className="mt-1 block text-sm leading-5 text-blue-800 dark:text-blue-200">
                    Change any topic, course, quantity, difficulty, progress, saved,
                    calculator or ordering setting.
                  </span>
                </span>
                <ArrowRight className="mt-1 size-4 text-blue-600 transition group-hover:translate-x-1" />
              </div>
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
