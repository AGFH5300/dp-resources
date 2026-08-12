export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowLeft, Layers3 } from 'lucide-react';
import { notFound } from 'next/navigation';

import { Nav } from '@/components/nav';
import { PracticeSetBuilderV4 } from '@/components/question-bank/practice-set-builder-v4';
import { requireMember } from '@/lib/auth';
import { getPracticeBuilderCatalog } from '@/lib/question-bank/practice-catalog';
import {
  applyPracticeSharePreset,
  getPracticeShare,
} from '@/lib/question-bank/practice-share';

import styles from './page.module.css';
import { createClient } from '@/lib/supabase-server';

export default async function BuildPracticeSetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await requireMember();
  const query = await searchParams;
  const client = await createClient();
  const [catalog, shared, { data: sourceRows = [] }] = await Promise.all([
    getPracticeBuilderCatalog(),
    query.code ? getPracticeShare(query.code) : Promise.resolve(null),
    client.rpc('dp_content_source_options'),
  ]);
  if (query.code && !shared) notFound();

  const initialConfiguration = shared
    ? applyPracticeSharePreset(shared.configuration, query.preset)
    : null;

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-[1600px] px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Link
          href="/question-bank"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
        >
          <ArrowLeft className="size-4" /> Question Bank
        </Link>
        <section
          className={`${styles.hero} mt-3 rounded-3xl border p-6 shadow-sm sm:p-8`}
        >
          <div>
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-blue-700">
                <Layers3 className="size-5" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                  Practice Builder
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--dp-navy)] sm:text-4xl">
                Build exactly the revision session you need
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Combine topics across subjects, choose a course for each selection,
                remove duplicate questions automatically, and generate one focused
                practice session.
              </p>
            </div>
          </div>
        </section>

        {catalog.subjects.length ? (
          <PracticeSetBuilderV4
            catalog={catalog as any}
            userId={membership.id}
            sourceOptions={(sourceRows as any[])
              .filter((source) => Number(source.question_variant_count || 0) > 0)
              .map((source) => ({
                slug: source.slug,
                label: source.short_label,
                count: Number(source.question_variant_count || 0),
              }))}
            initialConfiguration={initialConfiguration}
            sharedSource={
              shared
                ? {
                    code: shared.code,
                    name: shared.name,
                    creatorLabel: shared.creatorLabel,
                  }
                : null
            }
          />
        ) : (
          <section className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <h2 className="font-semibold text-slate-800">
              The practice catalogue is not available yet.
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Course practice remains available from the Question Bank home.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
