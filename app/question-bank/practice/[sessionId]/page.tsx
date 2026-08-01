export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowLeft, Layers3 } from 'lucide-react';

import { Nav } from '@/components/nav';
import { CoursePracticeWorkspace } from '@/components/question-bank/course-practice-workspace';
import { PracticeShareDialog } from '@/components/question-bank/practice-share-dialog';
import { QuestionPracticeFullscreenControl } from '@/components/question-bank/question-practice-fullscreen-control';
import { PracticeSessionTracker } from '@/components/question-bank/practice-session-tracker';
import { requireMember } from '@/lib/auth';
import { parsePracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import { getPracticeSession } from '@/lib/question-bank/practice-session-queries';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function selectedQuestion(value: string | undefined) {
  return value && UUID.test(value) ? value : null;
}

function selectedPage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function PracticeSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user, membership } = await requireMember();
  const { sessionId } = await params;
  const query = await searchParams;
  const requestedVariant = selectedQuestion(query.question);
  const data = await getPracticeSession(sessionId, user.id, {
    page: selectedPage(query.page),
    requestedVariantId: requestedVariant,
  });
  const currentPosition = Math.min(
    Math.max(Number(data.session.current_position || 0), 0),
    Math.max(Number(data.session.generated_count || 1) - 1, 0),
  );
  const currentLocalIndex = currentPosition - data.offset;
  const initialVariantId =
    requestedVariant &&
    data.questions.some((question) => question.variant_id === requestedVariant)
      ? requestedVariant
      : currentLocalIndex >= 0 && currentLocalIndex < data.questions.length
        ? data.questions[currentLocalIndex]?.variant_id || null
        : data.questions[0]?.variant_id || null;
  const configuration = parsePracticeConfiguration(
    data.session.configuration_snapshot,
  );
  const blockCount = configuration.blocks.length;
  const basePath = `/question-bank/practice/${sessionId}`;
  const previousPageHref =
    data.currentPage > 1 ? `${basePath}?page=${data.currentPage - 1}` : null;
  const nextPageHref =
    data.currentPage < data.pages ? `${basePath}?page=${data.currentPage + 1}` : null;

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <PracticeSessionTracker
        sessionId={sessionId}
        variantIds={data.questions.map((question) => question.variant_id)}
      />
      <main className="mx-auto max-w-[1500px] px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/question-bank/build"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
          >
            <ArrowLeft className="size-4" /> Practice Builder
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950/45 dark:text-blue-100">
              Fixed session · {Number(data.session.generated_count).toLocaleString()} unique
              questions
            </span>
            <PracticeShareDialog
              configuration={configuration}
              sessionId={sessionId}
              buttonLabel="Share this session"
            />
          </div>
        </div>

        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-blue-700">
                <Layers3 className="size-5" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Practice session
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-[color:var(--dp-navy)]">
                Your custom question queue
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {blockCount} selected block{blockCount === 1 ? '' : 's'} · duplicates
                removed before generation · only this page of the fixed queue is
                loaded in the browser
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-500">Ordering</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {String(data.session.ordering_mode || 'interleaved').replaceAll(
                    '_',
                    ' ',
                  )}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-500">Queue page</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {data.currentPage} of {data.pages}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-5">
          <CoursePracticeWorkspace
            questions={data.questions}
            total={Number(data.session.generated_count)}
            currentPage={data.currentPage}
            pages={data.pages}
            previousHref={previousPageHref}
            nextHref={nextPageHref}
            initialVariantId={initialVariantId}
            coursePath={basePath}
          />
        </section>
        <QuestionPracticeFullscreenControl />
      </main>
    </>
  );
}
