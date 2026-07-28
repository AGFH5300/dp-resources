import { requireMember } from '@/lib/auth';
import { nativeFormulaBookletUrl } from '@/lib/question-bank/formula-booklets';
import { getQuestionDetail } from '@/lib/question-bank/queries';
import { getExtendedQuestionDetail } from '@/lib/question-bank/revision-village-detail';
import type { QuestionAsset } from '@/lib/question-bank/types';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET_RENDER_ROLES: QuestionAsset['role'][] = [
  'question',
  'markscheme',
  'examiner_report',
  'content_reference',
];

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function solutionReferenceUrl(video: any) {
  const direct = String(video?.vimeo_url || video?.source_url || '').trim();
  if (direct) {
    try {
      const parsed = new URL(direct);
      if (parsed.protocol === 'https:') return parsed.toString();
    } catch {}
  }
  const provider = String(video?.provider || 'solution').trim() || 'solution';
  const providerVideoId = String(
    video?.provider_video_id || video?.vimeo_video_id || video?.id || '',
  ).trim();
  return `dp-solution-id://${encodeURIComponent(provider)}/${encodeURIComponent(
    providerVideoId,
  )}`;
}

async function recordQuestionView(
  userId: string,
  questionId: string,
  variantId: string,
) {
  const client = createSupabaseAdminClient();
  const { data: existing, error: readError } = await client
    .from('dp_qb_user_progress')
    .select('status,to_revisit,first_viewed_at,completed_at')
    .eq('user_id', userId)
    .eq('question_id', questionId)
    .maybeSingle();
  if (readError) throw readError;

  const now = new Date().toISOString();
  const status =
    !existing || existing.status === 'not_started'
      ? 'in_progress'
      : existing.status;
  const { error } = await client.from('dp_qb_user_progress').upsert(
    {
      user_id: userId,
      question_id: questionId,
      last_variant_id: variantId,
      status,
      to_revisit: existing?.to_revisit ?? false,
      first_viewed_at: existing?.first_viewed_at || now,
      last_viewed_at: now,
      completed_at: existing?.completed_at || null,
      updated_at: now,
    },
    { onConflict: 'user_id,question_id' },
  );
  if (error) throw error;
  return { status, lastViewedAt: now };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ variantId: string }> },
) {
  const { user } = await requireMember();
  const { variantId } = await params;
  if (!UUID_PATTERN.test(variantId))
    return noStore({ error: 'Invalid question identifier.' }, { status: 400 });

  const data = await getQuestionDetail(variantId, user.id);
  const variant = data.variant as any;
  const question = variant.question as any;
  const assetIds = (data.assets as any[])
    .map((row) => row.asset?.id)
    .filter((id): id is string => typeof id === 'string');
  const extended = await getExtendedQuestionDetail(variantId, assetIds);
  const viewedProgress = await recordQuestionView(
    user.id,
    question.id,
    variant.id,
  ).catch((error) => {
    console.error('Unable to record recent Question Bank view.', {
      variantId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  const audioByAssetId = new Map(
    extended.audio.map((row: any) => [row.asset_id, row]),
  );
  const sourceAliasesByAssetId = new Map<string, Set<string>>();
  for (const row of extended.assetSources as any[]) {
    const assetId = String(row.asset_id || '');
    const sourceFileId = String(row.source_file_id || '');
    if (!assetId || !sourceFileId) continue;
    const aliases = sourceAliasesByAssetId.get(assetId) || new Set<string>();
    aliases.add(sourceFileId);
    sourceAliasesByAssetId.set(assetId, aliases);
  }
  const assets: QuestionAsset[] = (data.assets as any[])
    .filter((row) => row.asset?.verification_status === 'verified')
    .flatMap((row) => {
      const audio = audioByAssetId.get(row.asset.id) as any;
      const sourceFileId = row.source_file_id || null;
      const sourceFileIds = new Set<string>(
        sourceAliasesByAssetId.get(row.asset.id) || [],
      );
      if (sourceFileId) sourceFileIds.add(sourceFileId);
      const baseAsset = {
        id: row.asset.id,
        sourceFileId,
        sourceFileIds: [...sourceFileIds],
        role: (row.role === 'audio'
          ? 'content_reference'
          : row.role) as QuestionAsset['role'],
        originalRole: row.role,
        sortOrder: row.sort_order,
        altText: row.alt_text || `${question.reference} media`,
        contentType: row.asset.content_type || null,
        byteSize: Number(row.asset.byte_size || 0) || null,
        audio: audio
          ? {
              provider: String(audio.provider || ''),
              sourceAudioId: audio.source_audio_id || null,
              transcriptId: audio.transcript_id || null,
              transcript: String(audio.transcript || ''),
              durationSeconds:
                audio.duration_seconds === null || audio.duration_seconds === undefined
                  ? null
                  : Number(audio.duration_seconds),
            }
          : null,
      } satisfies QuestionAsset;
      if (audio || row.role === 'audio') return [baseAsset];
      // Deduplicated files can be referenced from a different source role than
      // the occurrence that attached the physical asset. Emit one safe render
      // alias per supported section so member UI filtering cannot hide it.
      return ASSET_RENDER_ROLES.map((role) => ({ ...baseAsset, role }));
    });

  const papers = extended.papers
    .map((row: any) => ({
      id: row.paper?.id,
      reference: String(row.paper?.reference || '').trim(),
      calculatorAllowed: row.paper?.calculator_allowed ?? null,
      isPrimary: Boolean(row.is_primary),
      sortOrder: Number(row.sort_order || 0),
    }))
    .filter((paper: any) => paper.id && paper.reference);
  if (!papers.length && variant.paper?.id) {
    papers.push({
      id: variant.paper.id,
      reference: variant.paper.reference,
      calculatorAllowed: variant.paper.calculator_allowed ?? null,
      isPrimary: true,
      sortOrder: 0,
    });
  }
  const paperReference = papers.map((paper: any) => paper.reference).join(' · ');
  const privateFormulaBooklet = extended.paperAssets.find(
    (row: any) => row.asset?.verification_status === 'verified',
  );
  const formulaBookletUrl = privateFormulaBooklet?.asset?.id
    ? `/api/question-bank/assets/${privateFormulaBooklet.asset.id}`
    : nativeFormulaBookletUrl(
        variant.course?.subject?.slug,
        variant.course?.slug,
      );

  const extendedVideos = extended.videos.length ? extended.videos : data.videos;

  return noStore({
    variant: {
      id: variant.id,
      difficultyLabel: variant.difficulty_label,
      section: variant.section_raw,
      calculatorAllowed: variant.calculator_allowed,
      topicName: variant.topic?.name || '',
      subtopicNames: (variant.placements || [])
        .map((placement: any) => placement.subtopic?.name)
        .filter(Boolean),
      paperReference: paperReference || null,
      papers,
      formulaBookletUrl,
    },
    question: {
      id: question.id,
      reference: question.reference,
      content: question.content,
      markScheme: question.mark_scheme,
      examinerReport: question.examiner_report,
      maximumMark: question.maximum_mark,
    },
    assets,
    videos: (extendedVideos as any[]).map((row) => {
      const video = row.video || {};
      return {
        id: video.id,
        name: row.part_name,
        url: solutionReferenceUrl(video),
      };
    }),
    progress: viewedProgress
      ? {
          ...data.progress,
          status: viewedProgress.status,
          last_viewed_at: viewedProgress.lastViewedAt,
        }
      : data.progress,
    saved: data.saved,
  });
}
