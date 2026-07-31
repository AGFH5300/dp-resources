import 'server-only';

import { createClient } from '@/lib/supabase-server';

type CourseQuestionCountRow = {
  course_id: string;
  question_count: number | string | null;
};

export async function getQuestionBankCourseCounts() {
  const client = await createClient();
  const { data, error } = await client.rpc('dp_qb_course_question_counts');

  if (error) {
    throw new Error(`Question Bank course counts: ${error.message}`);
  }

  return new Map(
    ((data || []) as CourseQuestionCountRow[]).map((row) => [
      row.course_id,
      Number(row.question_count || 0),
    ]),
  );
}
