'use client';

import { CopyCheck, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export function PracticeShareExactButton({
  code,
  questionCount,
}: {
  code: string;
  questionCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function copyExactQueue() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/question-bank/practice-shares/${encodeURIComponent(code)}/exact-session`,
        { method: 'POST' },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Unable to copy the exact question queue.');
      toast.success('The exact shared queue was copied to your account.');
      router.push(`/question-bank/practice/${payload.sessionId}`);
    } catch (error) {
      setLoading(false);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to copy the exact question queue.',
      );
    }
  }

  return (
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
      Use the exact {questionCount.toLocaleString()} questions and order
    </button>
  );
}
