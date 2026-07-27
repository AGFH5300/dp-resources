import { requireMember } from '@/lib/auth';
import { nativeFormulaBookletUrl } from '@/lib/question-bank/formula-booklets';
import { getQuestionDetail } from '@/lib/question-bank/queries';
import type { QuestionAsset } from '@/lib/question-bank/types';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
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
  const assets: QuestionAsset[] = (data.assets as any[])
    .filter((row) => row.asset?.verification_status === 'verified')
    .map((row) => ({
      id: row.asset.id,
      sourceFileId: row.source_file_id,
      role: row.role,
      sortOrder: row.sort_order,
      altText: row.alt_text || `${question.reference} image`,
    }));

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
      paperReference: variant.paper?.reference || null,
      formulaBookletUrl: nativeFormulaBookletUrl(
        variant.course?.subject?.slug,
        variant.course?.slug,
      ),
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
    videos: (data.videos as any[]).map((row) => ({
      id: row.video.id,
      name: row.part_name,
      url: row.video.vimeo_url,
    })),
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
