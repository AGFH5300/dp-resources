'use client';

import { useState } from 'react';

type Option = { slug: string; display_name: string };

export function SourceAdminWorkspace({ sources, resourceTypes }: { sources: Option[]; resourceTypes: Option[] }) {
  const [driveFileId, setDriveFileId] = useState('');
  const [sourceSlug, setSourceSlug] = useState(sources[0]?.slug || 'unknown');
  const [resourceTypeSlug, setResourceTypeSlug] = useState(resourceTypes[0]?.slug || 'needs_review');
  const [recursive, setRecursive] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [variantId, setVariantId] = useState('');
  const [inspector, setInspector] = useState<any>(null);
  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/content-sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, driveFileId, sourceSlug, recursive, ...extra }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update attribution.');
      if (body.preview) setPreview(body.preview);
      setMessage(action.startsWith('preview') ? 'Preview refreshed.' : 'Attribution metadata updated.');
      return body;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update attribution.');
      return null;
    } finally { setBusy(false); }
  }
  async function inspectQuestionBank() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/content-sources?variantId=${encodeURIComponent(variantId)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to inspect attribution.');
      setInspector(body.inspector); setMessage('Question Bank attribution loaded.');
    } catch (error) {
      setInspector(null); setMessage(error instanceof Error ? error.message : 'Unable to inspect attribution.');
    } finally { setBusy(false); }
  }
  async function reviewQuestionBankSource(row: any, targetKind: 'question_source' | 'variant_source', reviewStatus: 'reviewed' | 'under_review' | 'rejected') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/content-sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review_qb_source', targetKind, sourceRowId: row.rowId, sourceSlug: row.sourceSlug, reviewStatus }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update Question Bank attribution.');
      setMessage('Question Bank attribution reviewed and audit-logged.');
      await inspectQuestionBank();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update Question Bank attribution.');
      setBusy(false);
    }
  }
  return (
    <>
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-[color:var(--dp-navy)]">Library attribution workspace</h2>
      <p className="mt-1 text-sm text-slate-600">Review and update Library source and resource-type metadata.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">Drive file or folder ID
          <input value={driveFileId} onChange={(event) => { setDriveFileId(event.target.value); setPreview(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">Source
          <select value={sourceSlug} onChange={(event) => { setSourceSlug(event.target.value); setPreview(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            {sources.map((source) => <option key={source.slug} value={source.slug}>{source.display_name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={recursive} onChange={(event) => { setRecursive(event.target.checked); setPreview(null); }} />Apply to current and future descendants of this folder</label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy || !driveFileId} onClick={() => void call('preview_source')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50">Preview exact impact</button>
        <button disabled={busy || !driveFileId || !preview} onClick={() => void call('apply_source')} className="rounded-md bg-[color:var(--dp-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Apply reviewed source</button>
        <button disabled={busy || !driveFileId} onClick={() => void call('remove_source_override')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50">Remove override</button>
      </div>
      {preview ? <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm" role="status">Affected: {Number(preview.items || 0).toLocaleString()} items ({Number(preview.files || 0).toLocaleString()} files, {Number(preview.folders || 0).toLocaleString()} folders) · Conflicts: {Number(preview.conflicts || 0).toLocaleString()}</p> : null}
      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold">Set one file’s resource type</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={resourceTypeSlug} onChange={(event) => setResourceTypeSlug(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {resourceTypes.map((resourceType) => <option key={resourceType.slug} value={resourceType.slug}>{resourceType.display_name}</option>)}
          </select>
          <button disabled={busy || !driveFileId} onClick={() => void call('set_resource_type', { resourceTypeSlug })} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50">Assign reviewed type</button>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-600" aria-live="polite">{message}</p> : null}
    </section>
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-[color:var(--dp-navy)]">Question Bank source inspector</h2>
      <p className="mt-1 text-sm text-slate-600">Inspect and review one Question Bank variant.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input aria-label="Question Bank variant ID" value={variantId} onChange={(event) => setVariantId(event.target.value)} placeholder="Variant UUID" className="min-w-72 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button disabled={busy || !variantId} onClick={() => void inspectQuestionBank()} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50">Inspect</button>
      </div>
      {inspector ? <div className="mt-4 space-y-4 text-sm">
        <p><span className="font-medium">Reference:</span> {inspector.reference || '—'} <span className="ml-3 text-slate-500">Core {inspector.questionId}</span></p>
        <QbSourceRows title="Variant sources" rows={inspector.variantSources || []} targetKind="variant_source" sources={sources} busy={busy} onReview={reviewQuestionBankSource} />
        <QbSourceRows title="Question-core sources / deduplication matches" rows={inspector.questionSources || []} targetKind="question_source" sources={sources} busy={busy} onReview={reviewQuestionBankSource} />
      </div> : null}
    </section>
    </>
  );
}

function QbSourceRows({ title, rows, targetKind, sources, busy, onReview }: {
  title: string; rows: any[]; targetKind: 'question_source' | 'variant_source'; sources: Option[]; busy: boolean;
  onReview: (row: any, targetKind: 'question_source' | 'variant_source', reviewStatus: 'reviewed' | 'under_review' | 'rejected') => Promise<void>;
}) {
  return <div className="overflow-x-auto rounded-md border border-slate-200">
    <h3 className="bg-slate-50 px-3 py-2 font-semibold">{title}</h3>
    {rows.length === 0 ? <p className="p-3 text-slate-500">No source rows.</p> : <table className="w-full min-w-[760px] text-left text-xs">
      <thead><tr className="border-t border-slate-200 text-slate-500"><th className="p-2">Canonical source</th><th className="p-2">Technical provider</th><th className="p-2">Source question ID</th><th className="p-2">Course/topic/reference</th><th className="p-2">Import batch</th><th className="p-2">Review</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.rowId} className="border-t border-slate-100 align-top">
        <td className="p-2"><select value={row.sourceSlug} disabled={busy} onChange={(event) => { row.sourceSlug = event.target.value; }} className="rounded border border-slate-300 px-2 py-1">{sources.map((source) => <option key={source.slug} value={source.slug}>{source.display_name}</option>)}</select></td>
        <td className="p-2">{row.provider}</td><td className="p-2">{row.sourceQuestionId}</td>
        <td className="p-2">{row.sourceCourse || row.sourceTopic || row.sourceReference || '—'}</td><td className="p-2">{row.importBatchId || '—'}</td>
        <td className="p-2"><div className="flex gap-1"><button disabled={busy} onClick={() => void onReview(row, targetKind, 'reviewed')} className="rounded border px-2 py-1">Review</button><button disabled={busy} onClick={() => void onReview(row, targetKind, 'under_review')} className="rounded border px-2 py-1">Under review</button><button disabled={busy} onClick={() => void onReview(row, targetKind, 'rejected')} className="rounded border px-2 py-1">Reject</button></div></td>
      </tr>)}</tbody>
    </table>}
  </div>;
}
