import { requireMember } from '@/lib/auth';
import { getQuestionDetail } from '@/lib/question-bank/queries';
import type { QuestionAsset } from '@/lib/question-bank/types';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function safeExternalHttpsUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
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
      formulaBookletUrl: safeExternalHttpsUrl(
        variant.paper?.formula_booklet_source_url,
      ),
    },
    question: {
      id: question.id,
      reference: question.reference,
      content: question.content,
      markScheme: question.mark_scheme,
      maximumMark: question.maximum_mark,
    },
    assets,
    videos: (data.videos as any[]).map((row) => ({
      id: row.video.id,
      name: row.part_name,
      url: row.video.vimeo_url,
    })),
    progress: data.progress,
    saved: data.saved,
  });
}
