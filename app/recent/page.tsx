export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';

import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { recentResourcesFromActivity } from '@/lib/recent-resources';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { RecentClient } from './recent-client';
import { getQuestionSourceMap, getResourceAttributionMap } from '@/lib/content-attribution';
import { QuestionSourceBadges } from '@/components/content-source-badge';

export default async function Recent() {
  const { user, membership } = await requireMember();
  const sb = createSupabaseAdminClient();
  const { data: activity = [], error: activityError } = await sb
    .from('dp_resource_activity_logs')
    .select('file_id,file_name,action,created_at')
    .eq('user_id', user.id)
    .in('action', ['file_opened', 'folder_opened'])
    .not('file_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (activityError)
    console.error('Unable to load recent resource activity.', activityError);
  const ids = [...new Set((activity || []).map((row: any) => row.file_id))];
  const { data: indexed = [], error: indexError } = ids.length
    ? await sb
        .from('dp_resource_index')
        .select('drive_file_id,name,mime_type,is_folder,path')
        .in('drive_file_id', ids)
    : { data: [] as any[], error: null };
  if (indexError)
    console.error('Unable to load recent resource metadata.', indexError);
  const initialRows = recentResourcesFromActivity(
    (activity || []) as any,
    (indexed || []) as any,
  );
  const recentResourceAttribution = await getResourceAttributionMap(initialRows.map((row) => row.id));
  for (const row of initialRows) row.attribution = recentResourceAttribution.get(row.id);

  const { data: progressRows = [], error: progressError } = await sb
    .from('dp_qb_user_progress')
    .select('question_id,last_variant_id,status,last_viewed_at')
    .eq('user_id', user.id)
    .not('last_viewed_at', 'is', null)
    .not('last_variant_id', 'is', null)
    .order('last_viewed_at', { ascending: false })
    .limit(8);
  if (progressError)
    console.error('Unable to load recent Question Bank progress.', progressError);

  const recentVariantIds = (progressRows || [])
    .map((row: any) => row.last_variant_id)
    .filter(Boolean);
  const { data: recentVariants = [], error: variantError } = recentVariantIds.length
    ? await sb
        .from('dp_qb_question_variants')
        .select(
          'id,question:dp_qb_questions!question_id(reference),course:dp_qb_courses!course_id(slug,name,subject:dp_qb_subjects!subject_id(slug)),topic:dp_qb_topics!topic_id(name)',
        )
        .in('id', recentVariantIds)
    : { data: [] as any[], error: null };
  if (variantError)
    console.error('Unable to load recent Question Bank metadata.', variantError);

  const variantById = new Map(
    (recentVariants || []).map((variant: any) => [variant.id, variant]),
  );
  const recentQuestions = (progressRows || [])
    .map((progress: any) => ({
      progress,
      variant: variantById.get(progress.last_variant_id),
    }))
    .filter((row: any) => row.variant);
  const recentQuestionSources = await getQuestionSourceMap(
    recentQuestions.map(({ progress, variant }: any) => ({
      variantId: variant.id,
      questionId: progress.question_id,
    })),
  );

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">
          Recent
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Continue from recently opened resources and questions.
        </p>
        <section className="dp-qb-panel mt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[color:var(--dp-navy)]">
              Recent questions
            </h2>
            <Link href="/question-bank" className="text-sm font-medium text-blue-700">
              Question Bank
            </Link>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {recentQuestions.length ? (
              recentQuestions.map(({ progress, variant }: any) => (
                <Link
                  key={progress.question_id}
                  href={`/question-bank/${variant.course.subject.slug}/${variant.course.slug}?question=${variant.id}`}
                  className="dp-qb-recent-link dp-qb-recent-grid-link"
                >
                  <strong title={variant.question.reference}>
                    {variant.question.reference}
                  </strong>
                  <QuestionSourceBadges sources={recentQuestionSources.get(variant.id) ?? []} />
                  <span title={variant.topic.name}>{variant.topic.name}</span>
                  <small title={variant.course.name}>{variant.course.name}</small>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-600">No recent questions yet.</p>
            )}
          </div>
        </section>
        <h2 className="mt-6 font-semibold text-[color:var(--dp-navy)]">
          Recent library resources
        </h2>
        <RecentClient initialRows={initialRows} />
      </main>
    </>
  );
}
