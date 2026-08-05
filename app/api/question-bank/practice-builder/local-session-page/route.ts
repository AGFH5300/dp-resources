import { requireApiMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_ITEMS = 100;

type RequestedItem = {
  position: number;
  questionId: string;
  variantId: string;
};

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function parseItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PAGE_ITEMS)
    return null;
  const items: RequestedItem[] = [];
  const positions = new Set<number>();
  const variants = new Set<string>();
  const questions = new Set<string>();
  for (const valueItem of value) {
    if (!isPlainObject(valueItem)) return null;
    const position = Number(valueItem.position);
    const questionId =
      typeof valueItem.questionId === 'string' ? valueItem.questionId : '';
    const variantId =
      typeof valueItem.variantId === 'string' ? valueItem.variantId : '';
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      !UUID.test(questionId) ||
      !UUID.test(variantId) ||
      positions.has(position) ||
      variants.has(variantId) ||
      questions.has(questionId)
    )
      return null;
    positions.add(position);
    variants.add(variantId);
    questions.add(questionId);
    items.push({ position, questionId, variantId });
  }
  return items.sort((a, b) => a.position - b.position);
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body))
    return noStore({ error: 'Expected a JSON request body.' }, { status: 400 });
  const items = parseItems(body.items);
  const totalCount = Number(body.totalCount);
  if (
    !items ||
    !Number.isInteger(totalCount) ||
    totalCount < items.length ||
    items.some((item) => item.position >= totalCount)
  )
    return noStore({ error: 'The local practice page is invalid.' }, { status: 400 });

  const variantIds = items.map((item) => item.variantId);
  const questionIds = items.map((item) => item.questionId);
  const client = createSupabaseAdminClient();
  const [variantsResult, placementsResult, progressResult, savedResult] =
    await Promise.all([
      client
        .from('dp_qb_question_variants')
        .select(
          'id,question_id,difficulty_value,difficulty_label,section_raw,calculator_allowed,question:dp_qb_questions!question_id(reference,content,maximum_mark),topic:dp_qb_topics!topic_id(id,name),paper:dp_qb_papers!paper_id(id,reference)',
        )
        .in('id', variantIds)
        .eq('render_status', 'ready'),
      client
        .from('dp_qb_question_subtopics')
        .select(
          'variant_id,placement_order,subtopic:dp_qb_subtopics!subtopic_id(name)',
        )
        .in('variant_id', variantIds)
        .order('placement_order'),
      client
        .from('dp_qb_user_progress')
        .select('question_id,status')
        .eq('user_id', user.id)
        .in('question_id', questionIds),
      client
        .from('dp_qb_user_saved_questions')
        .select('question_id')
        .eq('user_id', user.id)
        .in('question_id', questionIds),
    ]);

  const firstError =
    variantsResult.error ||
    placementsResult.error ||
    progressResult.error ||
    savedResult.error;
  if (firstError) {
    console.error('Unable to load local Question Bank practice page.', {
      userId: user.id,
      message: firstError.message,
    });
    return noStore(
      { error: 'This practice page could not be loaded.' },
      { status: 500 },
    );
  }

  const variants = (variantsResult.data || []) as any[];
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const progressByQuestion = new Map(
    ((progressResult.data || []) as any[]).map((row) => [
      row.question_id,
      row.status,
    ]),
  );
  const savedQuestions = new Set(
    ((savedResult.data || []) as any[]).map((row) => row.question_id),
  );
  const subtopicsByVariant = new Map<string, string[]>();
  for (const row of (placementsResult.data || []) as any[]) {
    const names = subtopicsByVariant.get(row.variant_id) || [];
    const name = String(row.subtopic?.name || '').trim();
    if (name && !names.includes(name)) names.push(name);
    subtopicsByVariant.set(row.variant_id, names);
  }

  try {
    const questions = items.map((item) => {
      const variant = variantById.get(item.variantId) as any;
      if (!variant?.question || variant.question_id !== item.questionId)
        throw new Error(`Local practice variant ${item.variantId} is unavailable.`);
      const content = String(variant.question.content || '');
      const status = progressByQuestion.get(item.questionId);
      return {
        variant_id: variant.id,
        question_id: variant.question_id,
        reference: String(variant.question.reference || ''),
        content_preview: content.replace(/\s+/g, ' ').trim().slice(0, 280),
        maximum_mark: Number(variant.question.maximum_mark || 0),
        difficulty_value:
          variant.difficulty_value === null
            ? null
            : Number(variant.difficulty_value),
        difficulty_label:
          variant.difficulty_label === 'easy' ||
          variant.difficulty_label === 'medium' ||
          variant.difficulty_label === 'hard'
            ? variant.difficulty_label
            : null,
        section: variant.section_raw || null,
        calculator_allowed: variant.calculator_allowed,
        topic_id: variant.topic?.id || '',
        topic_name: variant.topic?.name || 'Topic not assigned',
        paper_id: variant.paper?.id || null,
        paper_reference: variant.paper?.reference || null,
        subtopic_names: subtopicsByVariant.get(variant.id) || [],
        progress_status:
          status === 'completed' || status === 'in_progress'
            ? status
            : 'not_started',
        is_saved: savedQuestions.has(item.questionId),
        total_count: totalCount,
      };
    });
    return noStore({ questions });
  } catch (error) {
    console.error('Local Question Bank practice page contains invalid data.', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { error: 'Part of this local practice queue is no longer available.' },
      { status: 409 },
    );
  }
}
