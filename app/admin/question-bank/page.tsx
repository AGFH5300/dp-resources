export const dynamic = 'force-dynamic';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Database,
  ImageIcon,
} from 'lucide-react';

import { Nav } from '@/components/nav';
import { requireAdmin } from '@/lib/auth';
import { nativeBookletCoverage } from '@/lib/question-bank/formula-booklets';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { AdminSectionTabs } from '../admin-section-tabs';

const METRICS = [
  {
    key: 'questions',
    label: 'Unique questions',
    table: 'dp_qb_questions',
    description: 'The actual number of distinct questions in the Question Bank.',
    technical:
      'Stored as question cores. Duplicate appearances of the same question are counted only once here.',
  },
  {
    key: 'variants',
    label: 'Question appearances',
    table: 'dp_qb_question_variants',
    description:
      'How many times those questions appear across courses, papers, topics, or source files.',
    technical:
      'Previously labelled Variants. One unique question may have more than one appearance, so this number can be larger than Unique questions.',
  },
  {
    key: 'placements',
    label: 'Topic links',
    table: 'dp_qb_question_subtopics',
    description:
      'Links that place question appearances under one or more topics or subtopics.',
    technical:
      'Previously labelled Placements. These are categorisation links, not additional questions.',
  },
  {
    key: 'datasets',
    label: 'Imported source files',
    table: 'dp_qb_datasets',
    description:
      'Source data files or topic chunks processed by the Question Bank importer.',
    technical:
      'Previously labelled Datasets. This is an import inventory count, not a question count.',
  },
  {
    key: 'assets',
    label: 'Question images',
    table: 'dp_qb_assets',
    description:
      'Unique diagrams, graphs, photographs, and other images used by questions.',
    technical:
      'Previously labelled Assets. Identical image files are stored once even when reused.',
  },
] as const;

type Metric = (typeof METRICS)[number];
type CountedMetric = Metric & { count: number };

function InfoTip({ label, children }: { label: string; children: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={`About ${label}`}
        className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:bg-slate-100 focus-visible:text-slate-700 focus-visible:outline-none"
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case leading-5 tracking-normal text-slate-700 shadow-xl group-hover:block group-focus-within:block"
      >
        {children}
      </span>
    </span>
  );
}

function findingTitle(code: string) {
  const known: Record<string, string> = {
    blank_question_occurrence: 'Blank item found in the original source',
    question_quarantined_for_unavailable_images:
      'Question hidden because required images were unavailable',
    fallback_placement_created:
      'Question placed in a fallback topic because its original topic link was missing',
    cross_dataset_canonical_subtopic:
      'Question reused a matching subtopic from another source file',
  };
  if (known[code]) return known[code];
  return code
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function bookletStatusClass(status: string) {
  if (status === 'native') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (status === 'review') {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export default async function QuestionBankAdmin() {
  const { membership } = await requireAdmin();
  const client = createSupabaseAdminClient();
  let available = true;
  let counts: CountedMetric[] = [];
  let batches: any[] = [];
  let findings: any[] = [];
  let failedAssets = 0;
  let blankQuestions = 0;

  try {
    const [
      countResults,
      batchResult,
      findingResult,
      failedResult,
      blankResult,
    ] = await Promise.all([
      Promise.all(
        METRICS.map(async (metric) => {
          const { count, error } = await client
            .from(metric.table)
            .select('*', { count: 'exact', head: true });
          if (error) throw error;
          return { ...metric, count: count || 0 };
        }),
      ),
      client
        .from('dp_qb_import_batches')
        .select(
          'id,archive_identifier,archive_sha256,mode,status,verification_status,started_at,completed_at,actual_counts',
        )
        .order('started_at', { ascending: false })
        .limit(12),
      client
        .from('dp_qb_import_findings')
        .select(
          'id,severity,code,source_dataset,source_reference,details,created_at',
        )
        .order('created_at', { ascending: false })
        .limit(30),
      client
        .from('dp_qb_assets')
        .select('*', { count: 'exact', head: true })
        .neq('verification_status', 'verified'),
      client
        .from('dp_qb_import_findings')
        .select('*', { count: 'exact', head: true })
        .eq('code', 'blank_question_occurrence'),
    ]);

    if (batchResult.error) throw batchResult.error;
    if (findingResult.error) throw findingResult.error;
    if (failedResult.error) throw failedResult.error;
    if (blankResult.error) throw blankResult.error;

    counts = countResults;
    batches = batchResult.data || [];
    findings = findingResult.data || [];
    failedAssets = failedResult.count || 0;
    blankQuestions = blankResult.count || 0;
  } catch {
    available = false;
  }

  const latest = batches[0];
  const uniqueQuestions =
    counts.find((metric) => metric.key === 'questions')?.count || 0;
  const questionAppearances =
    counts.find((metric) => metric.key === 'variants')?.count || 0;
  const topicLinks =
    counts.find((metric) => metric.key === 'placements')?.count || 0;

  return (
    <>
      <Nav admin email={membership.email} userId={membership.id} />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <nav className="text-sm text-slate-600">
          <Link href="/admin" className="hover:underline">
            Admin
          </Link>{' '}
          / Question bank
        </nav>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[color:var(--dp-navy)]">
              Question-bank operations
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Clear Question Bank totals, import health, source issues, and native
              booklet coverage.
            </p>
          </div>
          <Link href="/question-bank" className="dp-qb-back-link">
            Open Question Bank
          </Link>
        </div>

        <AdminSectionTabs activeSection="question-bank" />

        {!available ? (
          <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            The Question Bank database could not be read. No import was attempted.
          </div>
        ) : (
          <>
            <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Actual Question Bank total
                  </p>
                  <p className="mt-1 text-4xl font-bold">
                    {uniqueQuestions.toLocaleString()}
                  </p>
                  <p className="mt-1 font-semibold">unique questions</p>
                </div>
                <div className="max-w-3xl text-sm leading-6 text-blue-900">
                  <p>
                    This is the number to use when asking, “How many questions are
                    in the Question Bank?”
                  </p>
                  <p className="mt-2">
                    The bank also records{' '}
                    <strong>{questionAppearances.toLocaleString()}</strong>{' '}
                    appearances of those questions across different sources and{' '}
                    <strong>{topicLinks.toLocaleString()}</strong> topic links. Those
                    larger totals do not mean there are extra questions.
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {counts.map((item) => (
                <article key={item.key} className="dp-qb-panel min-h-40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {item.label}
                    </span>
                    <InfoTip label={item.label}>{item.technical}</InfoTip>
                  </div>
                  <strong className="mt-2 block text-2xl text-[color:var(--dp-navy)]">
                    {item.count.toLocaleString()}
                  </strong>
                  <p className="mt-3 text-xs leading-5 text-slate-600">
                    {item.description}
                  </p>
                </article>
              ))}
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="dp-qb-side-card items-start">
                <ImageIcon className="mt-0.5 size-5 shrink-0" />
                <span>
                  <span className="flex items-center gap-1.5">
                    <strong>Images needing attention</strong>
                    <InfoTip label="Images needing attention">
                      Question images whose upload or verification has not completed
                      successfully. Zero means every stored image is verified.
                    </InfoTip>
                  </span>
                  <small>{failedAssets.toLocaleString()}</small>
                  <small className="mt-1 block text-slate-500">
                    failed or still pending verification
                  </small>
                </span>
              </div>

              <div className="dp-qb-side-card items-start">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <span>
                  <span className="flex items-center gap-1.5">
                    <strong>Blank source items</strong>
                    <InfoTip label="Blank source items">
                      Empty entries found in the original source archive. They are
                      retained in the audit history but are not presented as normal
                      answerable questions.
                    </InfoTip>
                  </span>
                  <small>{blankQuestions.toLocaleString()}</small>
                  <small className="mt-1 block text-slate-500">
                    retained for traceability, not counted as usable content
                  </small>
                </span>
              </div>

              <div className="dp-qb-side-card items-start">
                {latest?.verification_status === 'passed' ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                ) : (
                  <Database className="mt-0.5 size-5 shrink-0" />
                )}
                <span>
                  <span className="flex items-center gap-1.5">
                    <strong>Latest import check</strong>
                    <InfoTip label="Latest import check">
                      The final consistency check from the most recent Question Bank
                      import. Passed means its expected counts and integrity checks
                      completed successfully.
                    </InfoTip>
                  </span>
                  <small>{latest?.verification_status || 'No batch yet'}</small>
                  <small className="mt-1 block text-slate-500">
                    verification result for the newest import
                  </small>
                </span>
              </div>
            </section>

            <section className="dp-qb-panel mt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-[color:var(--dp-navy)]">
                      Native formula and data booklets
                    </h2>
                    <InfoTip label="Native formula and data booklets">
                      Native means the button opens a protected DP Resources Library
                      file instead of sending the user to an external website.
                    </InfoTip>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    Every booklet button currently shown to users opens an internal DP
                    Resources file. Coverage is not yet complete for every syllabus;
                    the exact status is shown below.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {nativeBookletCoverage.map((booklet) => (
                  <article
                    key={booklet.name}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-[color:var(--dp-navy)]">
                        {booklet.name}
                      </strong>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${bookletStatusClass(booklet.status)}`}
                      >
                        {booklet.statusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {booklet.note}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="dp-qb-panel mt-5 overflow-x-auto">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-[color:var(--dp-navy)]">
                  Import history
                </h2>
                <InfoTip label="Import history">
                  Each row is one Question Bank import run. It is operational history,
                  not a list of questions.
                </InfoTip>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Shows when each source archive was processed and whether the final
                verification passed.
              </p>
              <table className="mt-3 min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Started</th>
                    <th className="p-2">Import scope</th>
                    <th className="p-2">Run status</th>
                    <th className="p-2">Final check</th>
                    <th className="p-2">Archive fingerprint</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-t border-slate-200">
                      <td className="p-2">
                        {new Date(batch.started_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        {batch.mode === 'all'
                          ? 'Questions + images'
                          : String(batch.mode).replaceAll('_', ' ')}
                      </td>
                      <td className="p-2">{batch.status}</td>
                      <td className="p-2">{batch.verification_status}</td>
                      <td className="p-2 font-mono text-xs">
                        {batch.archive_sha256.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!batches.length ? (
                <p className="mt-3 text-sm text-slate-600">No import history.</p>
              ) : null}
            </section>

            <section className="dp-qb-panel mt-5">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-[color:var(--dp-navy)]">
                  Source issues kept for review
                </h2>
                <InfoTip label="Source issues kept for review">
                  Problems found in the original archive that were deliberately logged
                  instead of silently discarded. These entries help explain why a
                  source item may be hidden or categorised differently.
                </InfoTip>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                These are audit notes from the source material, not necessarily live
                website failures.
              </p>
              <div className="mt-3 space-y-2">
                {findings.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-md border border-slate-200 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{findingTitle(item.code)}</strong>
                      <span className="dp-qb-chip">{item.severity}</span>
                    </div>
                    <p className="mt-1 text-slate-600">
                      {[item.source_reference, item.source_dataset]
                        .filter(Boolean)
                        .join(' · ') || 'Archive-wide finding'}
                    </p>
                    <details className="mt-2 text-xs text-slate-500">
                      <summary className="cursor-pointer">Show technical code</summary>
                      <code className="mt-1 block">{item.code}</code>
                    </details>
                  </article>
                ))}
              </div>
              {!findings.length ? (
                <p className="mt-3 text-sm text-slate-600">
                  No retained source issues.
                </p>
              ) : null}
            </section>
          </>
        )}
      </main>
    </>
  );
}
