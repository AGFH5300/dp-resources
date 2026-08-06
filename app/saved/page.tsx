export const dynamic = 'force-dynamic';
import { FavoritesProvider } from '@/components/favorites-provider';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';
import { resourceUrl, typeLabel } from '@/lib/resource-utils';
import { ResourceTypeIcon } from '@/components/resource-type-icon';
import { getQuestionSourceMap, getResourceAttributionMap } from '@/lib/content-attribution';
import { QuestionSourceBadges, ResourceAttributionBadges } from '@/components/content-source-badge';
import { SourceMultiFilter } from '@/components/question-bank/source-multi-filter';
import { createClient } from '@/lib/supabase-server';
export default async function Saved({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user, membership } = await requireMember();
  const params = await searchParams;
  const selectedSources = String(params.sources || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-z0-9_]+$/.test(value))
    .slice(0, 10);
  const sb = createSupabaseAdminClient();
  const memberClient = await createClient();
  const { data: favs = [] } = await sb
    .from('dp_resource_favorites')
    .select('drive_file_id,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  const ids = (favs as any[]).map((f) => f.drive_file_id);
  const { data: rows = [] } = ids.length
    ? await sb.from('dp_resource_index').select('*').in('drive_file_id', ids)
    : { data: [] as any[] };
  const { data: savedQuestions = [] } = await sb
    .from('dp_qb_user_saved_questions')
    .select(
      'question_id,last_variant_id,created_at,question:dp_qb_questions!question_id(reference),variant:dp_qb_question_variants!last_variant_id(id,course:dp_qb_courses!course_id(slug,name,subject:dp_qb_subjects!subject_id(slug)),topic:dp_qb_topics!topic_id(name))',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  const [resourceAttribution, questionSources, { data: sourceOptions = [] }] =
    await Promise.all([
      getResourceAttributionMap(ids),
      getQuestionSourceMap(
        (savedQuestions as any[])
          .filter((row) => row.last_variant_id)
          .map((row) => ({ variantId: row.last_variant_id, questionId: row.question_id })),
      ),
      memberClient.rpc('dp_content_source_options'),
    ]);
  const filteredQuestions = (savedQuestions as any[]).filter((row) => {
    if (!selectedSources.length) return true;
    return (questionSources.get(row.last_variant_id) ?? []).some(
      (source) => source.isVariantSource && selectedSources.includes(source.slug),
    );
  });
  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">
          Saved
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Resources and question-bank items you saved for quick access.
        </p>
        <section id="question-bank" className="dp-qb-panel mt-5 scroll-mt-24">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[color:var(--dp-navy)]">
                Saved questions
              </h2>
              <p className="text-sm text-slate-600">
                Continue directly in the course and topic where you saved them.
              </p>
            </div>
            <Link href="/question-bank" className="text-sm font-medium text-blue-700">
              Open Question Bank
            </Link>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="col-span-full">
              <SourceMultiFilter
                compact
                selected={selectedSources}
                options={(sourceOptions as any[])
                  .filter((source) => Number(source.question_variant_count || 0) > 0)
                  .map((source) => ({ slug: source.slug, label: source.short_label }))}
              />
            </div>
            {filteredQuestions.length ? (
              filteredQuestions.map((row) => (
                <Link
                  key={row.question_id}
                  href={`/question-bank/${row.variant.course.subject.slug}/${row.variant.course.slug}/questions/${row.last_variant_id}`}
                  className="dp-qb-course-link"
                >
                  <span>
                    <strong>{row.question.reference}</strong>
                    <QuestionSourceBadges sources={questionSources.get(row.last_variant_id) ?? []} />
                    <small>
                      {row.variant.course.name} · {row.variant.topic.name}
                    </small>
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-600">No saved questions yet.</p>
            )}
          </div>
        </section>
        <h2 className="mt-6 font-semibold text-[color:var(--dp-navy)]">
          Saved library resources
        </h2>
        <FavoritesProvider initialSavedIds={ids}>
          <div className="mt-5 border-y border-slate-200 bg-white">
            {(rows as any[]).length ? (
              (rows as any[]).map((r) => (
                <Link
                  key={r.drive_file_id}
                  href={resourceUrl(r)}
                  className="grid gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0 hover:bg-blue-50/60 md:grid-cols-[minmax(260px,1fr)_1fr_140px]"
                >
                  <span className="flex min-w-0 items-center gap-3 font-medium">
                    <ResourceTypeIcon
                      item={{ isFolder: r.is_folder, mimeType: r.mime_type }}
                    />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="truncate text-slate-500">{r.path}</span>
                  <span className="text-slate-500">
                    {typeLabel(r.mime_type, r.is_folder)}
                    <span className="mt-1 block">
                      <ResourceAttributionBadges attribution={resourceAttribution.get(r.drive_file_id)} />
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                No saved resources yet. Use Save from a resource menu or preview
                toolbar.
              </div>
            )}
          </div>
        </FavoritesProvider>
      </main>
    </>
  );
}
