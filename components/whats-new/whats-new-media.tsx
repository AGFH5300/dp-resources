'use client';

import {
  BookOpen,
  Check,
  CirclePlay,
  Layers3,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type {
  WhatsNewIllustrationMedia,
  WhatsNewMedia as WhatsNewMediaDefinition,
  WhatsNewVideoMedia,
} from '@/lib/whats-new';

type Props = {
  media?: WhatsNewMediaDefinition;
  active: boolean;
};

function MediaUnavailable() {
  return (
    <div className="flex h-full min-h-56 items-center justify-center px-8 text-center sm:min-h-80">
      <div>
        <div className="mx-auto flex size-11 items-center justify-center rounded-2xl border border-[color:var(--dp-theme-border)] bg-white/80 text-[color:var(--dp-navy)] shadow-sm dark:bg-slate-900/80 dark:text-slate-100">
          <BookOpen className="size-5" aria-hidden />
        </div>
        <p className="mt-4 text-sm font-semibold text-[color:var(--dp-heading)]">
          Preview unavailable
        </p>
        <p className="mt-1 text-xs leading-5 text-[color:var(--dp-muted-text)]">
          The update details are still available alongside this preview.
        </p>
      </div>
    </div>
  );
}

function QuestionBankIllustration({
  alt,
  snapshot = '2026-09-16',
}: {
  alt: string;
  snapshot?: '2026-09-16' | '2026-09-18' | 'current';
}) {
  const sourceVariants =
    snapshot === 'current'
      ? ([
          ['RevisionDojo', '15,503'],
          ['Exam-Mate', '13,374'],
          ['PESTLE', '13,190'],
          ['Revision Town', '12,172'],
          ['Revision Village', '4,173'],
          ['CBS', '302'],
          ['Save My Exams', '44'],
        ] as const)
      : snapshot === '2026-09-18'
        ? ([
            ['RevisionDojo', '15,571'],
            ['Exam-Mate', '13,374'],
            ['PESTLE', '13,190'],
            ['Revision Town', '12,169'],
            ['Revision Village', '4,173'],
            ['CBS', '302'],
            ['Save My Exams', '44'],
          ] as const)
        : ([
            ['RevisionDojo', '15,571'],
            ['Exam-Mate', '13,374'],
            ['PESTLE', '13,190'],
            ['Revision Town', '12,169'],
            ['Revision Village', '4,173'],
            ['CBS', '302'],
          ] as const);
  const totalVariants =
    snapshot === 'current'
      ? '57,675'
      : snapshot === '2026-09-18'
        ? '57,740'
        : '57,696';

  return (
    <div
      className="relative flex h-full min-h-64 items-center justify-center overflow-hidden p-5 sm:min-h-96 sm:p-9"
      role="img"
      aria-label={alt}
    >
      <div
        className="absolute inset-x-[14%] top-[12%] h-28 rounded-full bg-blue-400/10 blur-3xl dark:bg-blue-300/10"
        aria-hidden
      />
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-white/70 bg-white/92 shadow-[0_24px_70px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-slate-950/88">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-slate-300 dark:bg-slate-700" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Question Bank
            </span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            Live coverage
          </span>
        </div>

        <div className="p-4 sm:p-6">
          <div>
            <p className="text-sm font-semibold text-[color:var(--dp-heading)]">
              Questions by source
            </p>
            <p className="mt-1 text-[11px] text-[color:var(--dp-muted-text)]">
              Coverage across available sources
            </p>
          </div>

          <div
            className={`mt-4 grid grid-cols-2 gap-2 sm:gap-3 ${
              sourceVariants.length >= 7 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
            }`}
          >
            {sourceVariants.map(([source, count]) => (
              <div
                key={source}
                className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-[10px] font-medium leading-4 text-slate-500 dark:text-slate-400">
                  {source}
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--dp-heading)] sm:text-xl">
                  {count}
                </p>
                <p className="text-[10px] text-[color:var(--dp-muted-text)]">
                  variants
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-[color:var(--dp-navy)] px-4 py-4 text-white sm:px-5">
            <div>
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {totalVariants}
              </p>
              <p className="mt-1 text-xs text-white/70">
                questions ready to practise
              </p>
            </div>
            <div className="flex items-center gap-2 text-right text-[10px] leading-4 text-white/55">
              <Layers3 className="size-4 shrink-0" aria-hidden />
              <span>Each question counted once</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivateAssetsIllustration({ alt }: { alt: string }) {
  return (
    <div
      className="relative flex h-full min-h-64 items-center justify-center overflow-hidden p-5 sm:min-h-96 sm:p-9"
      role="img"
      aria-label={alt}
    >
      <div className="w-full max-w-3xl rounded-[1.4rem] border border-white/70 bg-white/92 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-950/88 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Question Bank visuals
            </p>
            <p className="mt-1 text-xl font-semibold text-[color:var(--dp-heading)]">
              Clearer, faster diagrams
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
            DP Resources
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'More reliable', 'Question and markscheme diagrams now load more consistently.'],
            ['2', 'Faster loading', 'Images are optimized to keep questions responsive.'],
            ['3', 'Quality checked', 'Questions missing essential visuals stay out of live practice sets.'],
          ].map(([step, title, detail]) => (
            <div
              key={step}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex size-8 items-center justify-center rounded-xl bg-white text-sm font-semibold text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300">
                {step}
              </span>
              <p className="mt-4 text-sm font-semibold text-[color:var(--dp-heading)]">
                {title}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[color:var(--dp-muted-text)]">
                {detail}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-[color:var(--dp-navy)] px-4 py-4 text-white">
          <div>
            <p className="text-2xl font-semibold tracking-tight">Smoother practice</p>
            <p className="mt-1 text-xs text-white/70">Clear visuals with fewer interruptions</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">Built for reliability</p>
            <p className="mt-1 text-[10px] text-white/60">Incomplete visual questions are kept out of live sets</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsNewExperienceIllustration({ alt }: { alt: string }) {
  return (
    <div
      className="relative flex h-full min-h-64 items-center justify-center overflow-hidden p-5 sm:min-h-96 sm:p-9"
      role="img"
      aria-label={alt}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-white/70 bg-white/92 shadow-[0_24px_70px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-950/88">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
              What’s New
            </p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--dp-heading)]">
              One feature at a time
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            4 / 6
          </span>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-[1.2fr_0.8fr] sm:p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
              <CirclePlay className="size-10 text-blue-600 dark:text-blue-300" aria-hidden />
            </div>
            <p className="mt-4 text-base font-semibold text-[color:var(--dp-heading)]">
              Visual release stories
            </p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--dp-muted-text)]">
              Screens, illustrations and video can explain each update without turning the release into a wall of text.
            </p>
          </div>

          <div className="space-y-3">
            {['Swipe or use arrows', 'Try it shortcuts', 'Viewed releases remembered', 'Replay from release history'].map(
              (label) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                >
                  <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  {label}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200/80 px-5 py-4 dark:border-slate-800">
          <div className="flex gap-1.5" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full ${
                  index === 3
                    ? 'w-6 bg-blue-600 dark:bg-blue-300'
                    : 'w-1.5 bg-slate-300 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            Try it →
          </span>
        </div>
      </div>
    </div>
  );
}

function PhysicsIllustration({ alt }: { alt: string }) {
  return (
    <div
      className="relative flex h-full min-h-64 items-center justify-center overflow-hidden p-5 sm:min-h-96 sm:p-9"
      role="img"
      aria-label={alt}
    >
      <div className="w-full max-w-3xl rounded-[1.4rem] border border-white/70 bg-white/92 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-950/88 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              IB Physics
            </p>
            <p className="mt-1 text-xl font-semibold text-[color:var(--dp-heading)]">
              CBS topic coverage
            </p>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
            302 ready
          </div>
        </div>
        <div className="mt-6 grid grid-cols-5 gap-2 sm:gap-3">
          {['A.1', 'A.2', 'A.3', 'A.4', 'A.5'].map((topic, index) => (
            <div
              key={topic}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-2 py-4 text-center dark:border-slate-800 dark:bg-slate-900 sm:px-3 sm:py-5"
            >
              <div className="mx-auto flex size-8 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300">
                <Check className="size-4" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-semibold text-[color:var(--dp-heading)]">
                {topic}
              </p>
              <p className="mt-1 text-[10px] text-[color:var(--dp-muted-text)]">
                {index < 3 ? 'SL + HL' : 'HL'}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-900">
            <p className="text-lg font-semibold text-[color:var(--dp-heading)]">165</p>
            <p className="text-xs text-[color:var(--dp-muted-text)]">SL questions</p>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-900">
            <p className="text-lg font-semibold text-[color:var(--dp-heading)]">137</p>
            <p className="text-xs text-[color:var(--dp-muted-text)]">HL questions</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KinematicsCoverageIllustration({ alt }: { alt: string }) {
  return (
    <div
      className="relative flex h-full min-h-64 items-center justify-center overflow-hidden p-5 sm:min-h-96 sm:p-9"
      role="img"
      aria-label={alt}
    >
      <div className="w-full max-w-3xl rounded-[1.4rem] border border-white/70 bg-white/92 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-950/88 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              IB Physics
            </p>
            <p className="mt-1 text-xl font-semibold text-[color:var(--dp-heading)]">
              Kinematics source coverage
            </p>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
            346 questions
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                Save My Exams
              </p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-200">
                A.1
              </span>
            </div>
            <p className="mt-5 text-4xl font-semibold tracking-tight text-[color:var(--dp-heading)]">
              44
            </p>
            <p className="mt-1 text-xs text-[color:var(--dp-muted-text)]">
              Kinematics questions
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white/80 px-2 py-2 dark:bg-slate-950/70">
                <p className="font-semibold text-[color:var(--dp-heading)]">30</p>
                <p className="text-[10px] text-[color:var(--dp-muted-text)]">MCQ</p>
              </div>
              <div className="rounded-xl bg-white/80 px-2 py-2 dark:bg-slate-950/70">
                <p className="font-semibold text-[color:var(--dp-heading)]">14</p>
                <p className="text-[10px] text-[color:var(--dp-muted-text)]">
                  long-response
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                CBS
              </p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                A.1–A.5
              </span>
            </div>
            <p className="mt-5 text-4xl font-semibold tracking-tight text-[color:var(--dp-heading)]">
              302
            </p>
            <p className="mt-1 text-xs text-[color:var(--dp-muted-text)]">
              Physics variants
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white px-2 py-2 dark:bg-slate-950">
                <p className="font-semibold text-[color:var(--dp-heading)]">165</p>
                <p className="text-[10px] text-[color:var(--dp-muted-text)]">SL</p>
              </div>
              <div className="rounded-xl bg-white px-2 py-2 dark:bg-slate-950">
                <p className="font-semibold text-[color:var(--dp-heading)]">137</p>
                <p className="text-[10px] text-[color:var(--dp-muted-text)]">HL</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--dp-navy)] px-4 py-3 text-white">
          <div>
            <p className="text-sm font-semibold">346 unique variants</p>
            <p className="mt-0.5 text-[10px] text-white/65">
              Distinct coverage shown once
            </p>
          </div>
          <Layers3 className="size-5 shrink-0 text-white/70" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function GuidedTourIllustration({ alt }: { alt: string }) {
  return (
    <div
      className="relative flex h-full min-h-64 items-center justify-center overflow-hidden p-5 sm:min-h-96 sm:p-9"
      role="img"
      aria-label={alt}
    >
      <div className="relative w-full max-w-3xl rounded-[1.4rem] border border-white/70 bg-white/92 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-950/88 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[0.55fr_1.45fr]">
          <div className="rounded-2xl bg-[color:var(--dp-navy)] p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
              Explore
            </p>
            <div className="mt-4 space-y-2 text-xs">
              {['Library', 'Question Bank', 'Search', 'Practice', 'Saved', 'Settings'].map(
                (item, index) => (
                  <div
                    key={item}
                    className={`rounded-xl px-3 py-2 ${
                      index === 1 ? 'bg-white text-slate-900' : 'text-white/70'
                    }`}
                  >
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="relative min-h-64 rounded-2xl bg-slate-50 p-5 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-blue-600 dark:text-blue-300" aria-hidden />
              <span className="text-xs font-semibold text-[color:var(--dp-heading)]">
                Question Bank filters
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="h-11 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" />
              <div className="h-24 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="absolute bottom-4 right-4 w-[min(82%,17rem)] rounded-2xl bg-slate-950 p-4 text-white shadow-xl dark:bg-white dark:text-slate-900">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">
                  Step 4 of 12
                </span>
                <MousePointer2 className="size-4" aria-hidden />
              </div>
              <p className="mt-2 text-sm font-semibold">
                Choose exactly what you want to practise.
              </p>
              <p className="mt-1 text-[11px] leading-4 opacity-70">
                The walkthrough points to the real control, then lets you continue.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PracticeIllustration({ alt }: { alt: string }) {
  return (
    <div
      className="relative flex h-full min-h-64 items-center justify-center overflow-hidden p-5 sm:min-h-96 sm:p-9"
      role="img"
      aria-label={alt}
    >
      <div className="w-full max-w-3xl rounded-[1.4rem] border border-white/70 bg-white/92 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-slate-950/88 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Practice Builder
            </p>
            <p className="mt-1 text-xl font-semibold text-[color:var(--dp-heading)]">
              Ready when you are
            </p>
          </div>
          <CirclePlay className="size-7 text-blue-600 dark:text-blue-300" aria-hidden />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ['01', 'Selected', 'Physics · A.2'],
            ['02', 'Selected', 'Physics · A.4'],
            ['03', 'Next', 'Physics · A.5'],
          ].map(([number, state, label], index) => (
            <div
              key={number}
              className={`rounded-2xl border p-4 ${
                index < 2
                  ? 'border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/30'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">{number}</span>
                {index < 2 ? (
                  <Check className="size-4 text-blue-600 dark:text-blue-300" aria-hidden />
                ) : null}
              </div>
              <p className="mt-7 text-sm font-semibold text-[color:var(--dp-heading)]">
                {state}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--dp-muted-text)]">
                {label}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[color:var(--dp-navy)] px-4 py-3 text-white">
          <span className="text-xs text-white/70">2 questions selected</span>
          <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900">
            Start practice
          </span>
        </div>
      </div>
    </div>
  );
}

function Illustration({ media }: { media: WhatsNewIllustrationMedia }) {
  if (media.variant === 'question-bank') {
    return <QuestionBankIllustration alt={media.alt} snapshot="2026-09-16" />;
  }
  if (media.variant === 'question-bank-current') {
    return <QuestionBankIllustration alt={media.alt} snapshot="current" />;
  }
  if (media.variant === 'private-assets') {
    return <PrivateAssetsIllustration alt={media.alt} />;
  }
  if (media.variant === 'whats-new-experience') {
    return <WhatsNewExperienceIllustration alt={media.alt} />;
  }
  if (media.variant === 'question-bank-sep18') {
    return <QuestionBankIllustration alt={media.alt} snapshot="2026-09-18" />;
  }
  if (media.variant === 'physics-coverage') {
    return <PhysicsIllustration alt={media.alt} />;
  }
  if (media.variant === 'kinematics-coverage') {
    return <KinematicsCoverageIllustration alt={media.alt} />;
  }
  if (media.variant === 'guided-tour') {
    return <GuidedTourIllustration alt={media.alt} />;
  }
  return <PracticeIllustration alt={media.alt} />;
}

function VideoMedia({ media, active }: { media: WhatsNewVideoMedia; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      video.pause();
      setPlaying(false);
      return;
    }

    video.muted = true;
    setMuted(true);
    setEnded(false);
    const promise = video.play();
    if (promise) {
      promise
        .then(() => {
          setPlaying(true);
          setBlocked(false);
        })
        .catch(() => {
          setPlaying(false);
          setBlocked(true);
        });
    }

    return () => {
      video.pause();
    };
  }, [active, media.src]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video
        .play()
        .then(() => {
          setPlaying(true);
          setBlocked(false);
        })
        .catch(() => setBlocked(true));
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setEnded(false);
    void video
      .play()
      .then(() => {
        setPlaying(true);
        setBlocked(false);
      })
      .catch(() => setBlocked(true));
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const enterFullscreen = async () => {
    const frame = frameRef.current;
    const video = videoRef.current;
    try {
      if (frame?.requestFullscreen) {
        await frame.requestFullscreen();
        return;
      }
      const iosVideo = video as
        | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
        | null;
      iosVideo?.webkitEnterFullscreen?.();
    } catch {
      // Fullscreen support varies by mobile browser; playback remains usable.
    }
  };

  if (failed) return <MediaUnavailable />;

  return (
    <div
      ref={frameRef}
      className="group relative h-full min-h-64 overflow-hidden bg-slate-950 sm:min-h-96"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={media.src}
        poster={media.poster}
        preload={active ? 'metadata' : 'none'}
        playsInline
        muted
        loop={media.loop ?? false}
        aria-label={media.alt}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
        }}
        onError={() => setFailed(true)}
      />

      {(blocked || ended) && (
        <button
          type="button"
          onClick={ended ? replay : togglePlayback}
          className="absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          aria-label={ended ? 'Replay video' : 'Play video'}
        >
          {ended ? (
            <RotateCcw className="size-5" aria-hidden />
          ) : (
            <Play className="ml-0.5 size-5" aria-hidden />
          )}
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-3 pt-10 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePlayback}
            className="flex size-9 items-center justify-center rounded-full bg-black/35 hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={playing ? 'Pause video' : 'Play video'}
          >
            {playing ? (
              <Pause className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={replay}
            className="flex size-9 items-center justify-center rounded-full bg-black/35 hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Replay video"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
          {media.hasAudio ? (
            <button
              type="button"
              onClick={toggleMute}
              className="flex size-9 items-center justify-center rounded-full bg-black/35 hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label={muted ? 'Unmute video' : 'Mute video'}
            >
              {muted ? (
                <VolumeX className="size-4" aria-hidden />
              ) : (
                <Volume2 className="size-4" aria-hidden />
              )}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void enterFullscreen()}
          className="flex size-9 items-center justify-center rounded-full bg-black/35 hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label="View video fullscreen"
        >
          <Maximize2 className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function WhatsNewMedia({ media, active }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setImageFailed(false);
  }, [media]);

  if (!media) return <MediaUnavailable />;
  if (media.type === 'illustration') return <Illustration media={media} />;
  if (media.type === 'video') return <VideoMedia media={media} active={active} />;
  if (imageFailed) return <MediaUnavailable />;

  const fullscreenImage = async () => {
    try {
      await imageFrameRef.current?.requestFullscreen?.();
    } catch {
      // The image remains available in its responsive stage if fullscreen fails.
    }
  };

  return (
    <div
      ref={imageFrameRef}
      className="group relative flex h-full min-h-64 items-center justify-center overflow-hidden bg-slate-100 p-2 dark:bg-slate-950 sm:min-h-96 sm:p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- release media can live outside Next image domains */}
      <img
        src={media.src}
        alt={media.alt}
        loading={active ? 'eager' : 'lazy'}
        onError={() => setImageFailed(true)}
        className="max-h-full max-w-full rounded-xl object-contain shadow-sm"
        style={{ objectPosition: media.objectPosition ?? 'center' }}
      />
      <button
        type="button"
        onClick={() => void fullscreenImage()}
        className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-slate-950/70 text-white opacity-100 shadow-sm backdrop-blur transition hover:bg-slate-950/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        aria-label="View image fullscreen"
      >
        <Maximize2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}
