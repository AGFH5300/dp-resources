export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Database, ImageIcon } from 'lucide-react';

import { Nav } from '@/components/nav';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

const COUNT_TABLES = [
  ['Datasets', 'dp_qb_datasets'],
  ['Question cores', 'dp_qb_questions'],
  ['Variants', 'dp_qb_question_variants'],
  ['Placements', 'dp_qb_question_subtopics'],
  ['Assets', 'dp_qb_assets'],
] as const;

export default async function QuestionBankAdmin() {
  const { membership } = await requireAdmin();
  const client = createSupabaseAdminClient();
  let available = true;
  let counts: Array<{ label: string; count: number }> = [];
  let batches: any[] = [];
  let findings: any[] = [];
  let failedAssets = 0;
  try {
    const [countResults, batchResult, findingResult, failedResult] =
      await Promise.all([
        Promise.all(
          COUNT_TABLES.map(async ([label, table]) => {
            const { count, error } = await client
              .from(table)
              .select('*', { count: 'exact', head: true });
            if (error) throw error;
            return { label, count: count || 0 };
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
          .select('id,severity,code,source_dataset,source_reference,details,created_at')
          .order('created_at', { ascending: false })
          .limit(30),
        client
          .from('dp_qb_assets')
          .select('*', { count: 'exact', head: true })
          .neq('verification_status', 'verified'),
      ]);
    if (batchResult.error) throw batchResult.error;
    if (findingResult.error) throw findingResult.error;
    if (failedResult.error) throw failedResult.error;
    counts = countResults;
    batches = batchResult.data || [];
    findings = findingResult.data || [];
    failedAssets = failedResult.count || 0;
  } catch {
    available = false;
  }
  const latest = batches[0];
  const blankQuestions = findings.filter(
    (finding) => finding.code === 'blank_question_occurrence',
  ).length;
  return (
    <>
      <Nav
        admin
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <nav className="text-sm text-slate-600">
          <Link href="/admin" className="hover:underline">Admin</Link> / Question bank
        </nav>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[color:var(--dp-navy)]">
              Question-bank operations
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Import inventory, asset verification, retained source findings, and batch history.
            </p>
          </div>
          <Link href="/question-bank" className="dp-qb-back-link">
            Open Question Bank
          </Link>
        </div>

        {!available ? (
          <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            The additive question-bank migration has not been applied yet. No import was attempted.
          </div>
        ) : (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {counts.map((item) => (
                <div key={item.label} className="dp-qb-panel">
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {item.label}
                  </span>
                  <strong className="mt-1 block text-2xl text-[color:var(--dp-navy)]">
                    {item.count.toLocaleString()}
                  </strong>
                </div>
              ))}
            </section>
            <section className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="dp-qb-side-card">
                <ImageIcon className="size-5" />
                <span><strong>Failed or pending assets</strong><small>{failedAssets}</small></span>
              </div>
              <div className="dp-qb-side-card">
                <AlertTriangle className="size-5" />
                <span><strong>Blank source occurrences</strong><small>{blankQuestions}</small></span>
              </div>
              <div className="dp-qb-side-card">
                {latest?.verification_status === 'passed' ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <Database className="size-5" />
                )}
                <span>
                  <strong>Last verification</strong>
                  <small>{latest?.verification_status || 'No batch yet'}</small>
                </span>
              </div>
            </section>

            <section className="dp-qb-panel mt-5 overflow-x-auto">
              <h2 className="font-semibold text-[color:var(--dp-navy)]">Import batches</h2>
              <table className="mt-3 min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="p-2">Started</th><th className="p-2">Mode</th><th className="p-2">Status</th><th className="p-2">Verification</th><th className="p-2">Archive</th></tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-t border-slate-200">
                      <td className="p-2">{new Date(batch.started_at).toLocaleString()}</td>
                      <td className="p-2">{batch.mode}</td>
                      <td className="p-2">{batch.status}</td>
                      <td className="p-2">{batch.verification_status}</td>
                      <td className="p-2 font-mono text-xs">{batch.archive_sha256.slice(0, 12)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!batches.length ? <p className="mt-3 text-sm text-slate-600">No import batches.</p> : null}
            </section>

            <section className="dp-qb-panel mt-5">
              <h2 className="font-semibold text-[color:var(--dp-navy)]">Recent retained findings</h2>
              <div className="mt-3 space-y-2">
                {findings.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <strong>{item.code}</strong>
                      <span className="dp-qb-chip">{item.severity}</span>
                    </div>
                    <p className="mt-1 text-slate-600">
                      {[item.source_reference, item.source_dataset].filter(Boolean).join(' · ') || 'Archive-wide finding'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
