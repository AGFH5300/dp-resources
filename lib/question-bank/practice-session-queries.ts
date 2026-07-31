import 'server-only';

import { notFound } from 'next/navigation';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import type { QuestionListRow } from '@/lib/question-bank/types';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireData<T>(
  data: T | null,
  error: { message: string } | null,
  label: string,
) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

export async function getPracticeSession(sessionId: string, userId: string) {
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

  const { data: items, error: itemsError } = await client
    .from('dp_qb_practice_session_items')
    .select('id,position,status,question_id,variant_id,primary_block_snapshot')
    .eq('session_id', sessionId)
    .order('position');
  const sessionItems =
    requireData(items, itemsError, 'Practice session items') || [];
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
      total_count: sessionItems.length,
    };
  });

  return {
    session,
    items: sessionItems,
    questions,
  };
}
