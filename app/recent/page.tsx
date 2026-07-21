export const dynamic = 'force-dynamic';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { recentResourcesFromActivity } from '@/lib/recent-resources';
import { RecentClient } from './recent-client';
import Link from 'next/link';
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
  const { data: recentQuestions = [] } = await sb
    .from('dp_qb_user_progress')
    .select(
      'question_id,last_variant_id,status,last_viewed_at,question:dp_qb_questions!question_id(reference),variant:dp_qb_question_variants!last_variant_id(id,course:dp_qb_courses!course_id(slug,name,subject:dp_qb_subjects!subject_id(slug)),topic:dp_qb_topics!topic_id(name))',
    )
    .eq('user_id', user.id)
    .not('last_viewed_at', 'is', null)
    .order('last_viewed_at', { ascending: false })
    .limit(8);
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
            {(recentQuestions as any[]).filter((row) => row.variant).length ? (
              (recentQuestions as any[])
                .filter((row) => row.variant)
                .map((row) => (
                  <Link
                    key={row.question_id}
                    href={`/question-bank/${row.variant.course.subject.slug}/${row.variant.course.slug}/questions/${row.last_variant_id}`}
                    className="dp-qb-recent-link"
                  >
                    <strong>{row.question.reference}</strong>
                    <span>{row.variant.topic.name}</span>
                    <small>{row.variant.course.name}</small>
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
