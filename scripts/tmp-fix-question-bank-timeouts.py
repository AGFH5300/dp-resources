from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}')
    p.write_text(text.replace(old, new, 1))


controller = Path('components/tutorial/tutorial-controller.tsx')
text = controller.read_text()
old_prefetch_const = """const LIBRARY_ROUTE = '/library';
const PREFETCH_ROUTES = [
  '/library',
  '/question-bank',
  '/question-bank/build',
  '/settings',
] as const;
"""
new_prefetch_const = """const LIBRARY_ROUTE = '/library';
"""
if old_prefetch_const not in text:
    raise SystemExit('Tutorial prefetch route constant not found')
text = text.replace(old_prefetch_const, new_prefetch_const, 1)
old_prefetch_effect = """  useEffect(() => {
    if (!userId) return;
    for (const route of PREFETCH_ROUTES) router.prefetch(route);
  }, [router, userId]);

"""
if old_prefetch_effect not in text:
    raise SystemExit('Tutorial eager prefetch effect not found')
text = text.replace(old_prefetch_effect, '', 1)
controller.write_text(text)

landing = Path('app/question-bank/page.tsx')
text = landing.read_text()
old = """  const [data, questionCounts, { data: sourceRows = [] }] = await Promise.all([
    getQuestionBankLanding(user.id),
    getQuestionBankCourseCounts(),
    client.rpc('dp_content_source_options'),
  ]);
  const questionSources = (sourceRows as any[])
"""
new = """  const [data, questionCounts, sourceOptionsResult] = await Promise.all([
    getQuestionBankLanding(user.id),
    getQuestionBankCourseCounts(),
    client.rpc('dp_content_source_options'),
  ]);
  const sourceRows = Array.isArray(sourceOptionsResult.data)
    ? sourceOptionsResult.data
    : [];
  const questionSources = sourceRows
"""
if old not in text:
    raise SystemExit('Question Bank landing source-options block not found')
text = text.replace(old, new, 1)
# Avoid speculative rendering of the heavy builder route just because its cards are visible.
text = text.replace(
    'href="/question-bank/build"\n            className=',
    'href="/question-bank/build"\n            prefetch={false}\n            className=',
)
landing.write_text(text)

builder = Path('app/question-bank/build/page.tsx')
text = builder.read_text()
old = """  const [catalog, shared, { data: sourceRows = [] }] = await Promise.all([
    getPracticeBuilderCatalog(),
    query.code ? getPracticeShare(query.code) : Promise.resolve(null),
    client.rpc('dp_content_source_options'),
  ]);
  if (query.code && !shared) notFound();
"""
new = """  const [catalog, shared, sourceOptionsResult] = await Promise.all([
    getPracticeBuilderCatalog(),
    query.code ? getPracticeShare(query.code) : Promise.resolve(null),
    client.rpc('dp_content_source_options'),
  ]);
  const sourceRows = Array.isArray(sourceOptionsResult.data)
    ? sourceOptionsResult.data
    : [];
  if (query.code && !shared) notFound();
"""
if old not in text:
    raise SystemExit('Practice Builder source-options block not found')
text = text.replace(old, new, 1)
text = text.replace('sourceOptions={(sourceRows as any[])\n', 'sourceOptions={sourceRows\n', 1)
builder.write_text(text)

counts = Path('lib/question-bank/course-counts.ts')
text = counts.read_text()
old = """  if (error) {
    throw new Error(`Question Bank course counts: ${error.message}`);
  }
"""
new = """  // Counts decorate the landing page; they must never make the whole
  // Question Bank unavailable when Postgres is briefly under load.
  if (error) {
    return new Map<string, number>();
  }
"""
if old not in text:
    raise SystemExit('Course-count error block not found')
counts.write_text(text.replace(old, new, 1))

# Update the tutorial regression test: real route changes remain router.replace-driven,
# but the controller must not eagerly prefetch all heavyweight server routes on mount.
tutorial_test = Path('tests/tutorial-onboarding.test.ts')
text = tutorial_test.read_text()
old = """  it('keeps navigation-heading steps on the library shell and warms real route changes', () => {
    expect(controller).toContain(\"const LIBRARY_ROUTE = '/library'\");
    expect(controller).toContain(\"'/question-bank/build'\");
    expect(controller).toContain(\"'/settings'\");
    expect(controller).toContain('for (const route of PREFETCH_ROUTES) router.prefetch(route)');
    expect(controller).toContain('router.replace(step.route)');
    expect(controller).toContain(\"id: 'recent'\");
    expect(controller).toContain(\"id: 'saved'\");
    expect(controller).not.toContain('Loader2');
    expect(controller).not.toContain('role=\"status\"');
  });
"""
new = """  it('keeps navigation-heading steps on the library shell without eager heavy-route prefetches', () => {
    expect(controller).toContain(\"const LIBRARY_ROUTE = '/library'\");
    expect(controller).toContain(\"route: '/question-bank/build'\");
    expect(controller).toContain(\"route: '/settings'\");
    expect(controller).not.toContain('PREFETCH_ROUTES');
    expect(controller).not.toContain('router.prefetch(');
    expect(controller).toContain('router.replace(step.route)');
    expect(controller).toContain(\"id: 'recent'\");
    expect(controller).toContain(\"id: 'saved'\");
    expect(controller).not.toContain('Loader2');
    expect(controller).not.toContain('role=\"status\"');
  });
"""
if old not in text:
    raise SystemExit('Tutorial route-prefetch test block not found')
tutorial_test.write_text(text.replace(old, new, 1))

resilience_test = Path('tests/question-bank-timeout-resilience.test.ts')
resilience_test.write_text("""import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const landing = read('app/question-bank/page.tsx');
const builder = read('app/question-bank/build/page.tsx');
const counts = read('lib/question-bank/course-counts.ts');

describe('Question Bank timeout resilience', () => {
  it('never calls array methods on a null source-options RPC payload', () => {
    expect(landing).toContain('Array.isArray(sourceOptionsResult.data)');
    expect(builder).toContain('Array.isArray(sourceOptionsResult.data)');
    expect(landing).not.toContain('(sourceRows as any[]).filter');
    expect(builder).not.toContain('(sourceRows as any[])');
  });

  it('treats optional course counts as fail-soft UI metadata', () => {
    expect(counts).toContain('return new Map<string, number>();');
    expect(counts).not.toContain('throw new Error(`Question Bank course counts:');
  });

  it('does not speculate the heavyweight Practice Builder route from landing cards', () => {
    const builderLinks = landing.match(/href=\"\\/question-bank\\/build\"/g) || [];
    const disabledPrefetches = landing.match(/prefetch=\{false\}/g) || [];
    expect(builderLinks.length).toBeGreaterThanOrEqual(2);
    expect(disabledPrefetches.length).toBeGreaterThanOrEqual(2);
  });
});
""")

migration = Path('supabase/migrations/20260915183000_question_bank_source_count_timeout_hardening.sql')
migration.write_text("""-- Keep content-source option counts below the hosted Postgres statement timeout.
-- The previous implementation ran two correlated COUNT(DISTINCT ...) subqueries
-- once per active source. Exact reviewed-row indexes plus one grouped pass per
-- attribution table avoid repeatedly rescanning the same data.

create index if not exists dp_qb_variant_sources_reviewed_source_variant_idx
  on public.dp_qb_variant_sources (source_id, variant_id)
  where review_status = 'reviewed';

create index if not exists dp_resource_source_assignments_reviewed_source_file_idx
  on public.dp_resource_source_assignments (source_id, drive_file_id)
  where review_status = 'reviewed';

create or replace function public.dp_content_source_options()
returns table (
  slug text, display_name text, short_label text, attribution_label text,
  display_order integer, question_variant_count bigint, resource_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Member access is required' using errcode = '42501';
  end if;

  return query
  with question_counts as (
    select provenance.source_id,
           count(distinct provenance.variant_id)::bigint as question_variant_count
    from public.dp_qb_variant_sources provenance
    where provenance.review_status = 'reviewed'
    group by provenance.source_id
  ), resource_counts as (
    select reviewed.source_id, count(*)::bigint as resource_count
    from (
      select distinct assignment.source_id, assignment.drive_file_id
      from public.dp_resource_source_assignments assignment
      where assignment.review_status = 'reviewed'
    ) reviewed
    join public.dp_resource_index index_row
      on index_row.drive_file_id = reviewed.drive_file_id
    group by reviewed.source_id
  )
  select source.slug, source.display_name, source.short_label,
         source.attribution_label, source.display_order,
         coalesce(question_counts.question_variant_count, 0)::bigint,
         coalesce(resource_counts.resource_count, 0)::bigint
  from public.dp_content_sources source
  left join question_counts on question_counts.source_id = source.id
  left join resource_counts on resource_counts.source_id = source.id
  where source.is_active
  order by source.display_order, source.display_name;
end;
$$;

revoke execute on function public.dp_content_source_options() from public, anon;
grant execute on function public.dp_content_source_options() to authenticated, service_role;
""")
