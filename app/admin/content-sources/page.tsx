export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { AdminSectionTabs } from '../admin-section-tabs';
import { SourceAdminWorkspace } from './source-admin-workspace';

export default async function ContentSourcesAdmin() {
  const { membership } = await requireAdmin();
  const sb = createSupabaseAdminClient();
  const [{ data: audit }, { data: sources = [] }, { data: resourceTypes = [] }] = await Promise.all([
    sb.rpc('dp_admin_content_source_audit'),
    sb.from('dp_content_sources').select('slug,display_name').eq('is_active', true).order('display_order'),
    sb.from('dp_resource_types').select('slug,display_name').eq('is_active', true).order('display_order'),
  ]);
  const report = (audit || {}) as any;
  return (
    <>
      <Nav admin email={membership.email} userId={membership.id} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-[color:var(--dp-navy)]">Content source attribution</h1>
        <p className="mt-1 text-sm text-slate-600">Audit and correct Question Bank provenance and Resource Library source/type metadata.</p>
        <p className="mt-2"><a href="/api/admin/content-sources?download=1" className="text-sm font-medium text-[color:var(--dp-blue)] hover:underline">Export audit JSON</a></p>
        <AdminSectionTabs activeSection="content-sources" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Multi-source question cores" value={report.multiSourceQuestions} />
          <Metric label="Ready variants without reviewed source" value={report.readyVariantsWithoutReviewedSource} />
          <Metric label="Variant sources under review" value={report.variantSourcesUnderReview} />
          <Metric label="Core/variant source conflicts" value={report.coreVariantSourceConflicts} />
        </div>
        <SourceAdminWorkspace sources={sources as any[]} resourceTypes={resourceTypes as any[]} />
        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <AuditTable title="Question Bank coverage" rows={report.questionSources || []} columns={[['display_name','Source'],['question_cores','Question cores'],['variants','Variants']]} />
          <AuditTable title="Library coverage" rows={report.librarySources || []} columns={[['display_name','Source'],['files','Files'],['folders','Folders']]} />
          <AuditTable title="Resource type coverage" rows={report.resourceTypes || []} columns={[['display_name','Type'],['resources','Resources'],['under_review','Under review']]} />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Assignment methods</h2>
            <dl className="mt-3 space-y-2 text-sm">{Object.entries(report.libraryAssignmentsByMethod || {}).map(([method, count]) => <div key={method} className="flex justify-between gap-3"><dt>{method.replaceAll('_',' ')}</dt><dd className="font-medium">{Number(count).toLocaleString()}</dd></div>)}</dl>
          </div>
        </section>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{Number(value || 0).toLocaleString()}</p></div>;
}

function AuditTable({ title, rows, columns }: { title: string; rows: any[]; columns: Array<[string,string]> }) {
  return <div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><h2 className="p-4 font-semibold">{title}</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{columns.map(([,label]) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.slug || index} className="border-t border-slate-100">{columns.map(([key]) => <td key={key} className="px-3 py-2">{typeof row[key] === 'number' ? row[key].toLocaleString() : String(row[key] ?? '')}</td>)}</tr>)}</tbody></table></div></div>;
}
