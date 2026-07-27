#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after, label) {
  const source = await readFile(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  }
  await writeFile(path, source.replace(before, after));
}

await replaceOnce(
  'lib/drive-utils.ts',
  `export function safeDownloadName(name: string, extension?: string) {
  const cleaned = name.replace(/[\\\\/\\r\\n"]/g, '').trim() || 'download';
  return extension && !cleaned.toLowerCase().endsWith(\`.\${extension}\`)
    ? \`\${cleaned}.\${extension}\`
    : cleaned;
}`,
  `export function safeDownloadName(name: string, extension?: string) {
  const cleaned = name.replace(/[\\\\/\\r\\n"]/g, '').trim() || 'download';
  const ascii = cleaned
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[\\u2010-\\u2015\\u2212]/g, '-')
    .replace(/[\\u2018\\u2019]/g, "'")
    .replace(/[^\\x20-\\x7e]/g, '_')
    .replace(/\\s+/g, ' ')
    .trim() || 'download';
  return extension && !ascii.toLowerCase().endsWith(\`.\${extension}\`)
    ? \`\${ascii}.\${extension}\`
    : ascii;
}`,
  'ASCII-safe download filename',
);

await replaceOnce(
  'app/admin/question-bank/page.tsx',
  `            <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950">`,
  `            <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950 dark:border-blue-400/40 dark:bg-blue-950/45 dark:text-blue-50">`,
  'Question Bank total panel dark styling',
);
await replaceOnce(
  'app/admin/question-bank/page.tsx',
  `                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">`,
  `                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-200">`,
  'Question Bank total eyebrow dark styling',
);
await replaceOnce(
  'app/admin/question-bank/page.tsx',
  `                <div className="max-w-3xl text-sm leading-6 text-blue-900">`,
  `                <div className="max-w-3xl text-sm leading-6 text-blue-900 dark:text-blue-100">`,
  'Question Bank total explanation dark styling',
);

await replaceOnce(
  'components/question-bank/question-state-controls.tsx',
  `
  useEffect(() => {
    void fetch('/api/question-bank/state', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId, variantId, viewed: true }),
    });
  }, [questionId, variantId]);
`,
  `
`,
  'remove duplicate client-side viewed recorder',
);

await replaceOnce(
  'app/api/question-bank/questions/[variantId]/route.ts',
  `import { getQuestionDetail } from '@/lib/question-bank/queries';
import type { QuestionAsset } from '@/lib/question-bank/types';`,
  `import { getQuestionDetail } from '@/lib/question-bank/queries';
import type { QuestionAsset } from '@/lib/question-bank/types';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';`,
  'question details admin client import',
);

await replaceOnce(
  'app/api/question-bank/questions/[variantId]/route.ts',
  `function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
`,
  `function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

async function recordQuestionView(
  userId: string,
  questionId: string,
  variantId: string,
) {
  const client = createSupabaseAdminClient();
  const { data: existing, error: readError } = await client
    .from('dp_qb_user_progress')
    .select('status,to_revisit,first_viewed_at,completed_at')
    .eq('user_id', userId)
    .eq('question_id', questionId)
    .maybeSingle();
  if (readError) throw readError;

  const now = new Date().toISOString();
  const status =
    !existing || existing.status === 'not_started'
      ? 'in_progress'
      : existing.status;
  const { error } = await client.from('dp_qb_user_progress').upsert(
    {
      user_id: userId,
      question_id: questionId,
      last_variant_id: variantId,
      status,
      to_revisit: existing?.to_revisit ?? false,
      first_viewed_at: existing?.first_viewed_at || now,
      last_viewed_at: now,
      completed_at: existing?.completed_at || null,
      updated_at: now,
    },
    { onConflict: 'user_id,question_id' },
  );
  if (error) throw error;
  return { status, lastViewedAt: now };
}
`,
  'server-side recent-question recorder',
);

await replaceOnce(
  'app/api/question-bank/questions/[variantId]/route.ts',
  `  const data = await getQuestionDetail(variantId, user.id);
  const variant = data.variant as any;
  const question = variant.question as any;`,
  `  const data = await getQuestionDetail(variantId, user.id);
  const variant = data.variant as any;
  const question = variant.question as any;
  const viewedProgress = await recordQuestionView(
    user.id,
    question.id,
    variant.id,
  ).catch((error) => {
    console.error('Unable to record recent Question Bank view.', {
      variantId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });`,
  'record question view from authenticated detail request',
);

await replaceOnce(
  'app/api/question-bank/questions/[variantId]/route.ts',
  `    progress: data.progress,
    saved: data.saved,`,
  `    progress: viewedProgress
      ? {
          ...data.progress,
          status: viewedProgress.status,
          last_viewed_at: viewedProgress.lastViewedAt,
        }
      : data.progress,
    saved: data.saved,`,
  'return freshly recorded progress',
);

await writeFile(
  'app/recent/page.tsx',
  `export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';

import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { recentResourcesFromActivity } from '@/lib/recent-resources';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { RecentClient } from './recent-client';

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
                  href={\`/question-bank/\${variant.course.subject.slug}/\${variant.course.slug}?question=\${variant.id}\`}
                  className="dp-qb-recent-link"
                >
                  <strong>{variant.question.reference}</strong>
                  <span>{variant.topic.name}</span>
                  <small>{variant.course.name}</small>
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
`,
);

await writeFile(
  'tests/admin-pdf-recent-regressions.test.ts',
  `import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { safeDownloadName } from '../lib/drive-utils';

const adminQuestionBank = readFileSync('app/admin/question-bank/page.tsx', 'utf8');
const questionRoute = readFileSync(
  'app/api/question-bank/questions/[variantId]/route.ts',
  'utf8',
);
const stateControls = readFileSync(
  'components/question-bank/question-state-controls.tsx',
  'utf8',
);
const recentPage = readFileSync('app/recent/page.tsx', 'utf8');

describe('Question Bank admin dark mode', () => {
  it('uses readable light text on the dark total panel', () => {
    expect(adminQuestionBank).toContain('dark:bg-blue-950/45 dark:text-blue-50');
    expect(adminQuestionBank).toContain('dark:text-blue-200');
    expect(adminQuestionBank).toContain('dark:text-blue-100');
  });
});

describe('Unicode resource filenames in HTTP headers', () => {
  it('converts Unicode punctuation to an ASCII-safe filename', () => {
    const filename = safeDownloadName(
      'Etiology Of Abnormal Psychology — Explanations For Disorders.pdf',
    );
    expect(filename).toBe(
      'Etiology Of Abnormal Psychology - Explanations For Disorders.pdf',
    );
    expect(() =>
      new Headers({
        'content-disposition': \`inline; filename="\${filename}"\`,
      }),
    ).not.toThrow();
  });
});

describe('Recent Question Bank views', () => {
  it('records the view in the authenticated question-details request', () => {
    expect(questionRoute).toContain('async function recordQuestionView');
    expect(questionRoute).toContain(".from('dp_qb_user_progress').upsert(");
    expect(questionRoute).toContain('last_viewed_at: now');
    expect(questionRoute).toContain('viewedProgress.status');
    expect(stateControls).not.toContain('viewed: true');
  });

  it('loads progress and variant metadata separately and uses the canonical workspace URL', () => {
    expect(recentPage).toContain(".from('dp_qb_user_progress')");
    expect(recentPage).toContain(".from('dp_qb_question_variants')");
    expect(recentPage).toContain('variantById');
    expect(recentPage).toContain('?question=${variant.id}');
    expect(recentPage).toContain('export const revalidate = 0');
  });
});
`,
);
