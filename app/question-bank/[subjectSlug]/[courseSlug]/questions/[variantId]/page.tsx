export const dynamic = 'force-dynamic';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  ExternalLink,
  FileText,
  PlayCircle,
} from 'lucide-react';

import { Nav } from '@/components/nav';
import { QuestionContent } from '@/components/question-bank/question-content';
import { QuestionStateControls } from '@/components/question-bank/question-state-controls';
import { SolutionVideo } from '@/components/question-bank/solution-video';
import { requireMember } from '@/lib/auth';
import { safeInternalReturnPath } from '@/lib/auth-redirect';
import { getQuestionDetail } from '@/lib/question-bank/queries';
import type { QuestionAsset } from '@/lib/question-bank/types';

function safeExternalHttpsUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{
    subjectSlug: string;
    courseSlug: string;
    variantId: string;
  }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user, membership } = await requireMember();
  const route = await params;
  const query = await searchParams;
  const fallback = `/question-bank/${route.subjectSlug}/${route.courseSlug}`;
  const returnTo = safeInternalReturnPath(query.from, fallback);
  const data = await getQuestionDetail(route.variantId, user.id);
  const variant = data.variant as any;
  const question = variant.question as any;
  const course = variant.course as any;
  const topic = variant.topic as any;
  const paper = variant.paper as any;
  const formulaBookletUrl = safeExternalHttpsUrl(
    paper?.formula_booklet_source_url,
  );
  const assets: QuestionAsset[] = (data.assets as any[])
    .filter((row) => row.asset?.verification_status === 'verified')
    .map((row) => ({
      id: row.asset.id,
      sourceFileId: row.source_file_id,
      role: row.role,
      sortOrder: row.sort_order,
      altText: row.alt_text || `${question.reference} image`,
    }));
  const questionAssets = assets.filter(
    (asset) => asset.role === 'question' || asset.role === 'content_reference',
  );
  const markschemeAssets = assets.filter((asset) => asset.role === 'markscheme');
  const navigationQuery = query.from ? `?from=${encodeURIComponent(returnTo)}` : '';
  const questionBase = `/question-bank/${route.subjectSlug}/${route.courseSlug}/questions`;
  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <nav className="dp-qb-breadcrumb" aria-label="Breadcrumb">
          <Link href="/question-bank">Question Bank</Link>
          <span>/</span>
          <Link href={fallback}>{course.name}</Link>
          <span>/</span>
          <span>{question.reference}</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-[color:var(--dp-navy)]">
                {question.reference}
              </h1>
              <span className="dp-qb-chip capitalize">
                {variant.difficulty_label || 'Unrated'}
              </span>
              <span className="dp-qb-chip">
                {question.maximum_mark} mark{question.maximum_mark === 1 ? '' : 's'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {topic.name}
              {(variant.placements || []).length
                ? ` · ${variant.placements
                    .map((placement: any) => placement.subtopic?.name)
                    .filter(Boolean)
                    .join(', ')}`
                : ''}
            </p>
          </div>
          <Link href={returnTo} className="dp-qb-back-link">
            <ArrowLeft className="size-4" /> Back to questions
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
          {paper?.reference ? (
            <span className="dp-qb-meta"><FileText className="size-4" /> {paper.reference}</span>
          ) : null}
          {variant.section_raw ? (
            <span className="dp-qb-meta">Section {variant.section_raw}</span>
          ) : null}
          {typeof variant.calculator_allowed === 'boolean' ? (
            <span className="dp-qb-meta">
              <Calculator className="size-4" />
              {variant.calculator_allowed ? 'Calculator allowed' : 'No calculator'}
            </span>
          ) : null}
        </div>

        <section className="dp-qb-question-paper mt-5">
          <QuestionContent source={question.content} assets={questionAssets} />
          {questionAssets.length ? (
            <details className="dp-qb-associated-images">
              <summary>All associated question images ({questionAssets.length})</summary>
              <div className="grid gap-4 sm:grid-cols-2">
                {questionAssets.map((asset) => (
                  <figure key={`${asset.id}-${asset.role}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/question-bank/assets/${asset.id}`}
                      alt={asset.altText}
                      loading="lazy"
                    />
                  </figure>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section className="dp-qb-state-panel">
          <h2>Your progress</h2>
          <QuestionStateControls
            questionId={question.id}
            variantId={variant.id}
            initialStatus={data.progress.status}
            initialRevisit={data.progress.to_revisit}
            initialSaved={data.saved}
          />
        </section>

        <details className="dp-qb-markscheme">
          <summary>Reveal markscheme</summary>
          <div className="mt-5">
            <QuestionContent
              source={question.mark_scheme}
              assets={markschemeAssets}
              kind="markscheme"
            />
          </div>
        </details>

        {(data.videos as any[]).length ? (
          <section className="dp-qb-videos">
            <h2><PlayCircle className="size-5" /> Solution videos</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {(data.videos as any[]).map((row, index) => (
                <div key={`${row.video.id}-${row.part_name}`}>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">
                    {row.part_name || `Solution ${index + 1}`}
                  </h3>
                  <SolutionVideo
                    url={row.video.vimeo_url}
                    title={`${question.reference} ${row.part_name || `solution ${index + 1}`}`}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="dp-qb-videos">
            <h2><PlayCircle className="size-5" /> Solution video</h2>
            <p className="mt-2 text-sm text-slate-600">
              No solution video is available for this source occurrence.
            </p>
          </section>
        )}

        {formulaBookletUrl ? (
          <a
            href={formulaBookletUrl}
            target="_blank"
            rel="noreferrer noopener"
            referrerPolicy="no-referrer"
            className="dp-qb-formula-link"
          >
            Formula booklet (external source) <ExternalLink className="size-4" />
          </a>
        ) : null}

        <nav className="dp-qb-question-navigation" aria-label="Question navigation">
          {data.neighbors.previous_variant_id ? (
            <Link
              href={`${questionBase}/${data.neighbors.previous_variant_id}${navigationQuery}`}
            >
              <ArrowLeft className="size-4" /> Previous question
            </Link>
          ) : (
            <span />
          )}
          {data.neighbors.next_variant_id ? (
            <Link
              href={`${questionBase}/${data.neighbors.next_variant_id}${navigationQuery}`}
            >
              Next question <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </nav>
      </main>
    </>
  );
}
