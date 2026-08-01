import 'server-only';

import { notFound } from 'next/navigation';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import type { QuestionListRow } from '@/lib/question-bank/types';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PRACTICE_SESSION_PAGE_SIZE = 50;

function requireData<T>(
  data: T | null,
  error: { message: string } | null,
  label: string,
) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

export async function getPracticeSession(
  sessionId: string,
  userId: string,
  options: {
    page?: number | null;
    requestedVariantId?: string | null;
    pageSize?: number;
  } = {},
) {
  if (!UUID.test(sessionId)) notFound();
  const client = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await client
    .from('dp_qb_practice_sessions')
    .select(
      'id,status,ordering_mode,requested_count,generated_count,current_position,configuration_snapshot,generation_seed,created_at,started_at,completed_at',
    )
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  requireData(session, sessionError, 'Practice session');
  if (!session) notFound();

  const pageSize = Math.min(Math.max(Number(options.pageSize || PRACTICE_SESSION_PAGE_SIZE), 10), 100);
  const total = Number(session.generated_count || 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  let targetPosition: number | null = null;

  if (options.requestedVariantId && UUID.test(options.requestedVariantId)) {
    const { data: requestedItem, error: requestedError } = await client
      .from('dp_qb_practice_session_items')
      .select('position')
      .eq('session_id', sessionId)
      .eq('variant_id', options.requestedVariantId)
      .maybeSingle();
    requireData(requestedItem, requestedError, 'Requested session question');
    if (requestedItem) targetPosition = Number(requestedItem.position);
  }

  const requestedPage = Number(options.page || 0);
  const currentPage = Math.min(
    pages,
    Math.max(
      1,
      targetPosition !== null
        ? Math.floor(targetPosition / pageSize) + 1
        : Number.isInteger(requestedPage) && requestedPage > 0
          ? requestedPage
          : Math.floor(Number(session.current_position || 0) / pageSize) + 1,
    ),
  );
  const offset = (currentPage - 1) * pageSize;
  const lastPosition = Math.min(total - 1, offset + pageSize - 1);

  const [itemsResult, previousBoundaryResult, nextBoundaryResult] = await Promise.all([
    client
      .from('dp_qb_practice_session_items')
      .select('id,position,status,question_id,variant_id,primary_block_snapshot')
      .eq('session_id', sessionId)
      .order('position')
      .range(offset, Math.max(offset, lastPosition)),
    offset > 0
      ? client
          .from('dp_qb_practice_session_items')
          .select('variant_id,position')
          .eq('session_id', sessionId)
          .eq('position', offset - 1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lastPosition + 1 < total
      ? client
          .from('dp_qb_practice_session_items')
          .select('variant_id,position')
          .eq('session_id', sessionId)
          .eq('position', lastPosition + 1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const sessionItems =
    requireData(itemsResult.data, itemsResult.error, 'Practice session items') || [];
  const previousBoundary = requireData(
    previousBoundaryResult.data,
    previousBoundaryResult.error,
    'Previous session boundary',
  );
  const nextBoundary = requireData(
    nextBoundaryResult.data,
    nextBoundaryResult.error,
    'Next session boundary',
  );
  const variantIds = sessionItems.map((item: any) => item.variant_id);
  const questionIds = sessionItems.map((item: any) => item.question_id);

  const [variantsResult, placementsResult, savedResult] = await Promise.all([
    variantIds.length
      ? client
          .from('dp_qb_question_variants')
          .select(
            'id,question_id,difficulty_value,difficulty_label,section_raw,calculator_allowed,source_index,question:dp_qb_questions!question_id(reference,content,maximum_mark),course:dp_qb_courses!course_id(id,slug,name,subject:dp_qb_subjects!subject_id(slug,name)),topic:dp_qb_topics!topic_id(id,name),paper:dp_qb_papers!paper_id(id,reference)',
          )
          .in('id', variantIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? client
          .from('dp_qb_question_subtopics')
          .select(
            'variant_id,placement_order,subtopic:dp_qb_subtopics!subtopic_id(name)',
          )
          .in('variant_id', variantIds)
          .order('placement_order')
      : Promise.resolve({ data: [], error: null }),
    questionIds.length
      ? client
          .from('dp_qb_user_saved_questions')
          .select('question_id')
          .eq('user_id', userId)
          .in('question_id', questionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const variants =
    requireData(variantsResult.data, variantsResult.error, 'Session variants') || [];
  const placements =
    requireData(
      placementsResult.data,
      placementsResult.error,
      'Session subtopics',
    ) || [];
  const saved =
    requireData(savedResult.data, savedResult.error, 'Session saved state') || [];

  const variantById = new Map((variants as any[]).map((row) => [row.id, row]));
  const subtopicsByVariant = new Map<string, string[]>();
  for (const row of placements as any[]) {
    const names = subtopicsByVariant.get(row.variant_id) || [];
    const name = String(row.subtopic?.name || '').trim();
    if (name && !names.includes(name)) names.push(name);
    subtopicsByVariant.set(row.variant_id, names);
  }
  const savedQuestions = new Set((saved as any[]).map((row) => row.question_id));

  const questions = sessionItems.map((item: any): QuestionListRow => {
    const variant = variantById.get(item.variant_id) as any;
    if (!variant?.question)
      throw new Error(`Practice session variant ${item.variant_id} is unavailable.`);
    const content = String(variant.question.content || '');
    const progressStatus: QuestionListRow['progress_status'] =
      item.status === 'completed'
        ? 'completed'
        : item.status === 'viewed'
          ? 'in_progress'
          : 'not_started';
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
      difficulty_label: variant.difficulty_label || null,
      section: variant.section_raw || null,
      calculator_allowed: variant.calculator_allowed,
      topic_id: variant.topic?.id || '',
      topic_name: variant.topic?.name || 'Topic not assigned',
      paper_id: variant.paper?.id || null,
      paper_reference: variant.paper?.reference || null,
      subtopic_names: subtopicsByVariant.get(variant.id) || [],
      progress_status: progressStatus,
      is_saved: savedQuestions.has(variant.question_id),
      total_count: total,
    };
  });

  return {
    session,
    items: sessionItems,
    questions,
    currentPage,
    pages,
    pageSize,
    offset,
    previousBoundaryVariantId: previousBoundary?.variant_id || null,
    nextBoundaryVariantId: nextBoundary?.variant_id || null,
  };
}
