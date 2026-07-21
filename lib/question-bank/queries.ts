import 'server-only';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import type {
  QuestionFilters,
  QuestionListRow,
  QuestionProgressStatus,
} from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: string | undefined) {
  return value && UUID_PATTERN.test(value) ? value : null;
}

function bool(value: string | undefined) {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

export function parseQuestionFilters(
  searchParams: Record<string, string | undefined>,
): QuestionFilters {
  const page = Number(searchParams.page || 1);
  const difficulty = ['easy', 'medium', 'hard'].includes(
    searchParams.difficulty || '',
  )
    ? (searchParams.difficulty as QuestionFilters['difficulty'])
    : null;
  const status = ['not_started', 'in_progress', 'completed'].includes(
    searchParams.status || '',
  )
    ? (searchParams.status as QuestionProgressStatus)
    : null;
  return {
    q: String(searchParams.q || '').trim().slice(0, 160),
    topicId: uuid(searchParams.topic),
    subtopicId: uuid(searchParams.subtopic),
    difficulty,
    paperId: uuid(searchParams.paper),
    section: searchParams.section
      ? String(searchParams.section).trim().slice(0, 40)
      : null,
    calculator: bool(searchParams.calculator),
    status,
    saved: bool(searchParams.saved),
    revisit: bool(searchParams.revisit),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

function requireData<T>(data: T | null, error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

export async function getQuestionBankLanding(userId: string) {
  const client = await createClient();
  const [subjectsResult, coursesResult, datasetsResult, progressResult, savedResult] =
    await Promise.all([
      client
        .from('dp_qb_subjects')
        .select('id,slug,name,sort_order')
        .order('sort_order')
        .order('name'),
      client
        .from('dp_qb_courses')
        .select('id,subject_id,slug,name,level,syllabus_label,sort_order')
        .order('sort_order')
        .order('name'),
      client
        .from('dp_qb_datasets')
        .select('course_id,expected_question_count,expected_subtopic_count'),
      client
        .from('dp_qb_user_progress')
        .select('question_id,last_variant_id,status,last_viewed_at')
        .eq('user_id', userId)
        .not('last_viewed_at', 'is', null)
        .order('last_viewed_at', { ascending: false })
        .limit(6),
      client
        .from('dp_qb_user_saved_questions')
        .select('question_id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

  const subjects = requireData(subjectsResult.data, subjectsResult.error, 'Subjects') || [];
  const courses = requireData(coursesResult.data, coursesResult.error, 'Courses') || [];
  const datasets = requireData(datasetsResult.data, datasetsResult.error, 'Datasets') || [];
  const progress = requireData(progressResult.data, progressResult.error, 'Progress') || [];
  const totals = new Map<string, { questions: number; subtopics: number }>();
  for (const dataset of datasets as any[]) {
    const current = totals.get(dataset.course_id) || { questions: 0, subtopics: 0 };
    current.questions += Number(dataset.expected_question_count || 0);
    current.subtopics += Number(dataset.expected_subtopic_count || 0);
    totals.set(dataset.course_id, current);
  }

  const recentVariantIds = (progress as any[])
    .map((row) => row.last_variant_id)
    .filter(Boolean);
  const recentByVariant = new Map((progress as any[]).map((row) => [row.last_variant_id, row]));
  let recent: any[] = [];
  if (recentVariantIds.length) {
    const { data, error } = await client
      .from('dp_qb_question_variants')
      .select(
        'id,question:dp_qb_questions!question_id(reference),course:dp_qb_courses!course_id(slug,name,subject:dp_qb_subjects!subject_id(slug)),topic:dp_qb_topics!topic_id(name)',
      )
      .in('id', recentVariantIds);
    requireData(data, error, 'Recent questions');
    recent = (data || [])
      .map((row: any) => ({ ...row, progress: recentByVariant.get(row.id) }))
      .sort((a: any, b: any) =>
        String(b.progress?.last_viewed_at).localeCompare(
          String(a.progress?.last_viewed_at),
        ),
      );
  }

  return {
    subjects: (subjects as any[]).map((subject) => ({
      ...subject,
      courses: (courses as any[])
        .filter((course) => course.subject_id === subject.id)
        .map((course) => ({
          ...course,
          ...(totals.get(course.id) || { questions: 0, subtopics: 0 }),
        })),
    })),
    recent,
    savedCount: savedResult.count || 0,
  };
}

export async function getCourseQuestionBank(
  subjectSlug: string,
  courseSlug: string,
  filters: QuestionFilters,
) {
  const client = await createClient();
  const { data: subject, error: subjectError } = await client
    .from('dp_qb_subjects')
    .select('id,slug,name')
    .eq('slug', subjectSlug)
    .maybeSingle();
  requireData(subject, subjectError, 'Subject');
  if (!subject) notFound();
  const { data: course, error: courseError } = await client
    .from('dp_qb_courses')
    .select('id,subject_id,slug,name,level,syllabus_label')
    .eq('subject_id', subject.id)
    .eq('slug', courseSlug)
    .maybeSingle();
  requireData(course, courseError, 'Course');
  if (!course) notFound();

  const [topicsResult, papersResult, datasetsResult, questionsResult] =
    await Promise.all([
      client
        .from('dp_qb_topics')
        .select(
          'id,slug,name,sort_order,subtopics:dp_qb_subtopics(id,slug,name,code,description,sort_order)',
        )
        .eq('course_id', course.id)
        .order('sort_order'),
      client
        .from('dp_qb_course_papers')
        .select(
          'paper:dp_qb_papers!paper_id(id,reference,calculator_allowed,formula_booklet_source_url)',
        )
        .eq('course_id', course.id),
      client
        .from('dp_qb_datasets')
        .select('expected_question_count')
        .eq('course_id', course.id),
      client.rpc('dp_qb_list_questions', {
        p_course_id: course.id,
        p_query: filters.q || null,
        p_topic_id: filters.topicId,
        p_subtopic_id: filters.subtopicId,
        p_difficulty: filters.difficulty,
        p_paper_id: filters.paperId,
        p_section: filters.section,
        p_calculator: filters.calculator,
        p_status: filters.status,
        p_saved: filters.saved,
        p_revisit: filters.revisit,
        p_page: filters.page,
        p_page_size: 24,
      }),
    ]);

  return {
    subject,
    course,
    topics:
      requireData(topicsResult.data, topicsResult.error, 'Topics') || [],
    papers: (
      requireData(papersResult.data, papersResult.error, 'Papers') || []
    ).map((row: any) => row.paper),
    sourceQuestionCount: (
      requireData(datasetsResult.data, datasetsResult.error, 'Dataset counts') || []
    ).reduce(
      (total: number, row: any) => total + Number(row.expected_question_count || 0),
      0,
    ),
    questions: (requireData(
      questionsResult.data,
      questionsResult.error,
      'Question list',
    ) || []) as QuestionListRow[],
  };
}

export async function searchQuestionBank(query: string, page = 1) {
  const client = await createClient();
  const safeQuery = query.trim().slice(0, 160);
  if (safeQuery.length < 2) return [];
  const { data, error } = await client.rpc('dp_qb_search_questions', {
    p_query: safeQuery,
    p_limit: 30,
    p_offset: Math.max(0, page - 1) * 30,
  });
  return requireData(data, error, 'Question search') || [];
}

export async function getQuestionDetail(variantId: string, userId: string) {
  if (!UUID_PATTERN.test(variantId)) notFound();
  const client = await createClient();
  const { data: variant, error } = await client
    .from('dp_qb_question_variants')
    .select(
      'id,question_id,source_index,difficulty_value,difficulty_label,section_raw,calculator_allowed,question:dp_qb_questions!question_id(id,reference,content,mark_scheme,maximum_mark),course:dp_qb_courses!course_id(id,slug,name,syllabus_label,subject:dp_qb_subjects!subject_id(slug,name)),topic:dp_qb_topics!topic_id(id,name),paper:dp_qb_papers!paper_id(id,reference,calculator_allowed,formula_booklet_source_url),placements:dp_qb_question_subtopics(subtopic:dp_qb_subtopics!subtopic_id(id,name,slug))',
    )
    .eq('id', variantId)
    .maybeSingle();
  requireData(variant, error, 'Question');
  if (!variant) notFound();

  const [assetsResult, videosResult, progressResult, savedResult, neighborsResult] =
    await Promise.all([
      client
        .from('dp_qb_variant_assets')
        .select(
          'source_file_id,role,sort_order,alt_text,asset:dp_qb_assets!asset_id(id,content_type,byte_size,verification_status)',
        )
        .eq('variant_id', variantId)
        .order('sort_order'),
      client
        .from('dp_qb_variant_solution_videos')
        .select(
          'part_name,sort_order,video:dp_qb_solution_videos!video_id(id,vimeo_url,vimeo_video_id)',
        )
        .eq('variant_id', variantId)
        .order('sort_order'),
      client
        .from('dp_qb_user_progress')
        .select('status,to_revisit,last_viewed_at')
        .eq('user_id', userId)
        .eq('question_id', (variant as any).question_id)
        .maybeSingle(),
      client
        .from('dp_qb_user_saved_questions')
        .select('question_id')
        .eq('user_id', userId)
        .eq('question_id', (variant as any).question_id)
        .maybeSingle(),
      client.rpc('dp_qb_question_neighbors', { p_variant_id: variantId }),
    ]);

  return {
    variant,
    assets: requireData(assetsResult.data, assetsResult.error, 'Question assets') || [],
    videos:
      requireData(videosResult.data, videosResult.error, 'Solution videos') || [],
    progress:
      requireData(progressResult.data, progressResult.error, 'Question progress') || {
        status: 'not_started',
        to_revisit: false,
        last_viewed_at: null,
      },
    saved: Boolean(
      requireData(savedResult.data, savedResult.error, 'Saved question'),
    ),
    neighbors:
      (requireData(
        neighborsResult.data,
        neighborsResult.error,
        'Question navigation',
      ) || [])[0] || { previous_variant_id: null, next_variant_id: null },
  };
}
