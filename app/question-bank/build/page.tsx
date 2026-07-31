export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowLeft, Layers3 } from 'lucide-react';

import { Nav } from '@/components/nav';
import { PracticeSetBuilderV2 } from '@/components/question-bank/practice-set-builder-v2';
import { requireMember } from '@/lib/auth';
import { getPracticeBuilderCatalog } from '@/lib/question-bank/practice-catalog';

import styles from './page.module.css';

export default async function BuildPracticeSetPage() {
  const { membership } = await requireMember();
  const catalog = await getPracticeBuilderCatalog();

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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
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
                Combine topics across subjects, choose different courses for every
                selection, remove duplicate question cores automatically, and generate
                one fixed practice queue you can resume.
              </p>
            </div>
            <div
              className={`${styles.heroNote} rounded-2xl border px-4 py-3 text-sm text-slate-600 shadow-sm`}
            >
              <strong className="block text-[color:var(--dp-navy)]">
                One topic or many
              </strong>
              A single topic is simply the smallest custom practice set.
            </div>
          </div>
        </section>

        {catalog.subjects.length ? (
          <PracticeSetBuilderV2 catalog={catalog as any} />
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
