export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Search } from 'lucide-react';

import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { searchQuestionBank } from '@/lib/question-bank/queries';

export default async function QuestionBankSearch({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await requireMember();
  const params = await searchParams;
  const query = String(params.q || '').trim();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const results = query.length >= 2 ? await searchQuestionBank(query, page) : [];
  const total = Number((results as any[])[0]?.total_count || 0);
  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Link href="/question-bank" className="text-sm text-blue-700 hover:underline">
          ← Question Bank
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--dp-navy)]">
          Search questions
        </h1>
        <form className="dp-qb-search-box mt-4" action="/question-bank/search">
          <Search className="size-5" />
          <input
            name="q"
            defaultValue={query}
            minLength={2}
            maxLength={160}
            placeholder="Reference, question, subject, course, topic, or paper"
            aria-label="Search questions"
          />
          <button type="submit">Search</button>
        </form>
        <p className="mt-3 text-sm text-slate-600">
          {query.length < 2
            ? 'Enter at least two characters.'
            : `${total.toLocaleString()} result${total === 1 ? '' : 's'} for “${query}”`}
        </p>
        <div className="mt-4 space-y-3">
          {(results as any[]).map((row) => (
            <Link
              key={row.variant_id}
              href={`/question-bank/${row.subject_slug}/${row.course_slug}?question=${row.variant_id}`}
              className="dp-qb-question-row"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong>{row.reference}</strong>
                <span className="dp-qb-chip">{row.difficulty_label || 'Unrated'}</span>
                <span className="dp-qb-chip">{row.maximum_mark} marks</span>
              </div>
              <p>{row.content_preview || 'No question text in the source.'}</p>
              <small>
                {row.subject_name} · {row.course_name} · {row.topic_name}
                {row.paper_reference ? ` · ${row.paper_reference}` : ''}
              </small>
            </Link>
          ))}
          {query.length >= 2 && !results.length ? (
            <div className="dp-qb-empty">No matching questions found.</div>
          ) : null}
        </div>
      </main>
    </>
  );
}
