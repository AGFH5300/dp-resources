import 'server-only';

import { createClient } from '@/lib/supabase-server';

type CourseQuestionCountRow = {
  course_id: string;
  question_count: number | string | null;
};

export async function getQuestionBankCourseCounts() {
  const client = await createClient();
  const { data, error } = await client.rpc('dp_qb_course_question_counts');

  // Counts decorate the landing page; they must never make the whole
  // Question Bank unavailable when Postgres is briefly under load.
  if (error) {
    return new Map<string, number>();
  }

  return new Map(
    ((data || []) as CourseQuestionCountRow[]).map((row) => [
      row.course_id,
      Number(row.question_count || 0),
    ]),
  );
}
