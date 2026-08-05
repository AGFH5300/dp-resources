'use client';

import { CopyCheck, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  readPracticeBuildStream,
  type PracticeBuildProgress,
} from '@/lib/question-bank/practice-api-client';

export function PracticeShareExactButton({
  code,
  questionCount,
}: {
  code: string;
  questionCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<PracticeBuildProgress | null>(null);

  async function copyExactQueue() {
    if (loading) return;
    setLoading(true);
    setProgress({
      phase: 'selecting',
      label: 'Preparing the exact shared queue…',
      processedCount: null,
      totalCount: null,
    });
    try {
      const response = await fetch(
        `/api/question-bank/practice-shares/${encodeURIComponent(code)}/exact-session`,
        { method: 'POST' },
      );
      const payload = await readPracticeBuildStream(response, setProgress);
      toast.success('The exact shared queue was copied to this device.');
      router.push(`/question-bank/practice/${payload.sessionId}`);
    } catch (error) {
      setLoading(false);
      setProgress(null);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to copy the exact question queue.',
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void copyExactQueue()}
        disabled={loading}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CopyCheck className="size-4" />
        )}
        {loading
          ? progress?.label || 'Copying to this device…'
          : `Use the exact ${questionCount.toLocaleString()} questions and order`}
      </button>
      {loading && progress?.totalCount ? (
        <div className="mt-2" role="status" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/60">
            <div
              className="h-full rounded-full bg-blue-700 transition-[width]"
              style={{
                width: `${Math.round(
                  ((progress.processedCount || 0) / progress.totalCount) * 100,
                )}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-blue-800 dark:text-blue-200">
            {(progress.processedCount || 0).toLocaleString()} of{' '}
            {progress.totalCount.toLocaleString()} questions saved on this device
          </p>
        </div>
      ) : null}
    </div>
  );
}
