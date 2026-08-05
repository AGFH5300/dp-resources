'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  DatabaseZap,
  HardDrive,
  Layers3,
  Loader2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { CoursePracticeWorkspace } from '@/components/question-bank/course-practice-workspace';
import { LocalPracticeSessionTracker } from '@/components/question-bank/local-practice-session-tracker';
import { PracticeShareDialog } from '@/components/question-bank/practice-share-dialog';
import { QuestionPracticeFullscreenControl } from '@/components/question-bank/question-practice-fullscreen-control';
import { readPracticeApiJson } from '@/lib/question-bank/practice-api-client';
import {
  cleanupLocalPracticeSessions,
  discardLocalPracticeSession,
  getLocalPracticeSessionPage,
  type LocalPracticePageItem,
  type LocalPracticeSession,
} from '@/lib/question-bank/local-practice-session-storage';
import type { QuestionListRow } from '@/lib/question-bank/types';

type LoadedLocalPracticePage = {
  session: LocalPracticeSession;
  items: LocalPracticePageItem[];
  questions: QuestionListRow[];
  currentPage: number;
  pages: number;
  pageSize: number;
  offset: number;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function positivePage(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function LocalPracticeSessionPage({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedVariantId = searchParams.get('question');
  const requestedPage = positivePage(searchParams.get('page'));
  const [loaded, setLoaded] = useState<LoadedLocalPracticePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setLoading(true);
    setError('');

    void (async () => {
      try {
        await cleanupLocalPracticeSessions(userId, sessionId);
        const local = await getLocalPracticeSessionPage({
          sessionId,
          userId,
          page: requestedPage,
          requestedVariantId:
            requestedVariantId && UUID.test(requestedVariantId)
              ? requestedVariantId
              : null,
        });
        if (!local) {
          if (!disposed)
            setError(
              'This practice session is not stored on this device. It may have been cleared by the browser, created on another device, or expired.',
            );
          return;
        }

        const response = await fetch(
          '/api/question-bank/practice-builder/local-session-page',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              totalCount: local.session.totalCount,
              items: local.items.map((item) => ({
                position: item.position,
                questionId: item.questionId,
                variantId: item.variantId,
              })),
            }),
          },
        );
        const payload = await readPracticeApiJson<{
          questions: QuestionListRow[];
        }>(response, 'This local practice page could not be loaded.');
        if (!disposed)
          setLoaded({
            ...local,
            questions: payload.questions,
          });
      } catch (reason) {
        if (!disposed && !controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'This local practice session could not be loaded.',
          );
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [requestedPage, requestedVariantId, sessionId, userId]);

  const initialVariantId = useMemo(() => {
    if (!loaded) return null;
    if (
      requestedVariantId &&
      loaded.questions.some(
        (question) => question.variant_id === requestedVariantId,
      )
    )
      return requestedVariantId;
    const localIndex = loaded.session.currentPosition - loaded.offset;
    if (localIndex >= 0 && localIndex < loaded.questions.length)
      return loaded.questions[localIndex]?.variant_id || null;
    return loaded.questions[0]?.variant_id || null;
  }, [loaded, requestedVariantId]);

  async function deleteSession() {
    if (deleting) return;
    const confirmed = window.confirm(
      'Delete this locally stored practice session from this device? Your saved questions and overall question progress will not be deleted.',
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await discardLocalPracticeSession(sessionId, userId);
      toast.success('This local practice session was deleted.');
      router.replace('/question-bank/build');
      router.refresh();
    } catch {
      setDeleting(false);
      toast.error('This local practice session could not be deleted.');
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[55vh] max-w-3xl items-center justify-center px-4 py-10">
        <div className="text-center" role="status">
          <Loader2 className="mx-auto size-8 animate-spin text-blue-700" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-50">
            Loading this device’s practice queue…
          </h1>
        </div>
      </main>
    );
  }

  if (!loaded || error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 pb-24 sm:px-6">
        <Link
          href="/question-bank/build"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
        >
          <ArrowLeft className="size-4" /> Practice Builder
        </Link>
        <section className="mt-4 rounded-3xl border border-amber-200 bg-white p-6 shadow-sm dark:border-amber-900 dark:bg-slate-900 sm:p-8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            <HardDrive className="size-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Local practice session unavailable
          </h1>
          <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">
            {error || 'This practice session is not available on this device.'}
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Ordinary practice queues stay in this browser to avoid filling the shared
            production database. Shared practice codes remain available across devices.
          </p>
          <Link
            href="/question-bank/build"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800"
          >
            Build another practice session
          </Link>
        </section>
      </main>
    );
  }

  const basePath = `/question-bank/practice/${sessionId}`;
  const previousPageHref =
    loaded.currentPage > 1 ? `${basePath}?page=${loaded.currentPage - 1}` : null;
  const nextPageHref =
    loaded.currentPage < loaded.pages
      ? `${basePath}?page=${loaded.currentPage + 1}`
      : null;
  const blockCount = loaded.session.configuration.blocks.length;

  return (
    <>
      <LocalPracticeSessionTracker
        sessionId={sessionId}
        userId={userId}
        positions={loaded.items.map((item) => ({
          variantId: item.variantId,
          position: item.position,
        }))}
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100">
              <HardDrive className="size-3.5" /> Stored on this device
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950/45 dark:text-blue-100">
              Fixed session · {loaded.session.totalCount.toLocaleString()} unique questions
            </span>
            <PracticeShareDialog
              configuration={loaded.session.configuration}
              localSession={{
                id: sessionId,
                userId,
                totalCount: loaded.session.totalCount,
              }}
              buttonLabel="Save and share this session"
            />
            <button
              type="button"
              onClick={() => void deleteSession()}
              disabled={deleting}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 transition hover:border-red-400 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete from device
            </button>
          </div>
        </div>

        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Layers3 className="size-5" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Local practice session
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-[color:var(--dp-navy)]">
                Your custom question queue
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {blockCount} selected block{blockCount === 1 ? '' : 's'} · duplicates
                removed before generation · only this page is hydrated from the server
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <DatabaseZap className="size-4" /> The queue itself is not stored in
                Supabase unless you explicitly save and share it.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Ordering</dt>
                <dd className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                  {loaded.session.orderingMode.replaceAll('_', ' ')}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Queue page</dt>
                <dd className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                  {loaded.currentPage} of {loaded.pages}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-5">
          <CoursePracticeWorkspace
            questions={loaded.questions}
            total={loaded.session.totalCount}
            currentPage={loaded.currentPage}
            pages={loaded.pages}
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
