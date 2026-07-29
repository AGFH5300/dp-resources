import Link from 'next/link';
import type { Metadata } from 'next';
import { BookOpenCheck } from 'lucide-react';
import { BrandWordmark } from '@/components/brand-wordmark';
import { BrandMark } from '@/components/brand-mark';
import { publicPageMetadata } from '@/lib/seo';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = publicPageMetadata({
  title: 'Free DP Study Library and Question Bank',
  description:
    'DP Resources provides free account-based access to a curated study library and interactive DP Question Bank with explanations and progress tracking.',
  path: '/',
});

async function hasSignedInUser() {
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

const questionBankButtonClass =
  'shrink-0 whitespace-nowrap rounded-full border border-[#f2b84b] bg-[#f2b84b] font-semibold text-[#172033] shadow-sm hover:border-[#ffd27a] hover:bg-[#ffd27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2b84b]/50';

export default async function Home() {
  const isSignedIn = await hasSignedInUser();
  const accountHref = isSignedIn ? '/library' : '/auth/login';
  const accountLabel = isSignedIn ? 'Open library' : 'Log in';
  const questionBankHref = isSignedIn
    ? '/question-bank'
    : '/auth/login?next=%2Fquestion-bank';

  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#10243f]">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9ccba] pb-5 sm:flex-nowrap sm:gap-4">
          <BrandWordmark href="/" className="text-base sm:text-xl" />
          <nav className="flex w-full items-center justify-end gap-2 text-sm font-medium sm:w-auto sm:shrink-0 sm:gap-3">
            <ThemeToggle />
            <Link
              href="/privacy"
              className="hidden whitespace-nowrap text-[#5d6470] hover:text-[#10243f] sm:inline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hidden whitespace-nowrap text-[#5d6470] hover:text-[#10243f] sm:inline"
            >
              Terms
            </Link>
            <Link
              href={questionBankHref}
              aria-label="Open question bank"
              className={`${questionBankButtonClass} px-3 py-2 sm:px-4`}
            >
              <span className="sm:hidden">Questions</span>
              <span className="hidden sm:inline">Open question bank</span>
            </Link>
            <Link
              href={accountHref}
              className="shrink-0 whitespace-nowrap rounded-full border border-[#10243f] px-3 py-2 text-[#10243f] hover:bg-white sm:px-4"
            >
              {accountLabel}
            </Link>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b5832d]">
              Free DP study access
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-[#10243f] sm:text-6xl">
              A focused study library and Question Bank for DP resources.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4b5563]">
              Find organised notes, documents, presentations and supporting school
              resources, then practise exam-style questions with explanations,
              saved progress and topic-based search from the same clean portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isSignedIn ? (
                <>
                  <Link
                    href="/library"
                    className="rounded-full bg-[#10243f] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#17385f]"
                  >
                    Open library
                  </Link>
                  <Link
                    href="/question-bank"
                    className={`${questionBankButtonClass} px-6 py-3 text-sm`}
                  >
                    Open question bank
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/sign-up"
                    className="rounded-full bg-[#10243f] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#17385f]"
                  >
                    Sign up
                  </Link>
                  <Link
                    href="/auth/login?next=%2Fquestion-bank"
                    className={`${questionBankButtonClass} px-6 py-3 text-sm`}
                  >
                    Open question bank
                  </Link>
                  <Link
                    href="/auth/login"
                    className="whitespace-nowrap rounded-full border border-[#d9ccba] bg-[#fffaf1] px-6 py-3 text-sm font-semibold text-[#10243f] hover:border-[#10243f]"
                  >
                    Log in
                  </Link>
                </>
              )}
            </div>
          </section>

          <section
            aria-label="Platform highlights"
            className="rounded-[2rem] border border-[#d9ccba] bg-[#fffaf1] p-6 shadow-sm"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 text-[#061a34] shadow-sm">
                <BrandMark className="h-16 w-16" title="DP Resources logo" />
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#b5832d]">
                  Library
                </p>
                <h2 className="mt-3 text-xl font-semibold">
                  Organised and searchable.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#4b5563]">
                  Preview files, download when needed, save useful material and report
                  broken or outdated resources.
                </p>
              </div>

              <div className="rounded-2xl bg-[#10243f] p-6 text-white shadow-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                  <BookOpenCheck className="h-9 w-9" aria-hidden />
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e4bd77]">
                  Question Bank
                </p>
                <h2 className="mt-3 text-xl font-semibold">
                  Practise and understand.
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  Browse by subject and topic, answer interactively, reveal full
                  explanations and keep track of your progress.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                'PDF and PPTX previews',
                'Question and topic search',
                'Instant answer feedback',
                'Saved progress and support',
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-[#eadfce] bg-white p-4 text-sm font-medium text-[#334155]"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
