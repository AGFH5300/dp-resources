import 'server-only';

import { createClient } from '@/lib/supabase-server';

type AvailabilityRow = {
  concept_id: string;
  course_id: string;
  question_count: number | string;
};

function requireData<T>(
  data: T | null,
  error: { message: string } | null,
  label: string,
) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

export async function getPracticeBuilderCatalog() {
  const client = await createClient();
  const [subjectsResult, groupsResult, conceptsResult, availabilityResult] =
    await Promise.all([
      client
        .from('dp_qb_subjects')
        .select('id,slug,name,sort_order')
        .order('sort_order')
        .order('name'),
      client
        .from('dp_qb_concept_groups')
        .select('id,subject_id,parent_group_id,slug,name,description,sort_order')
        .eq('status', 'approved')
        .order('sort_order')
        .order('name'),
      client
        .from('dp_qb_concepts')
        .select(
          'id,subject_id,group_id,slug,name,description,aliases,sort_order,mapping_version',
        )
        .eq('status', 'approved')
        .order('sort_order')
        .order('name'),
      client.rpc('dp_qb_practice_concept_availability'),
    ]);

  const subjects =
    requireData(subjectsResult.data, subjectsResult.error, 'Practice subjects') || [];
  const groups =
    requireData(groupsResult.data, groupsResult.error, 'Practice concept groups') || [];
  const concepts =
    requireData(conceptsResult.data, conceptsResult.error, 'Practice concepts') || [];
  const availability =
    (requireData(
      availabilityResult.data,
      availabilityResult.error,
      'Practice concept availability',
    ) || []) as AvailabilityRow[];

  const courseIds = [...new Set(availability.map((row) => row.course_id))];
  let courses: any[] = [];
  if (courseIds.length) {
    const { data, error } = await client
      .from('dp_qb_courses')
      .select('id,subject_id,slug,name,level,syllabus_label,sort_order')
      .in('id', courseIds)
      .order('sort_order')
      .order('name');
    courses = requireData(data, error, 'Practice courses') || [];
  }

  const availabilityByConcept = new Map<string, Map<string, number>>();
  for (const row of availability) {
    const byCourse = availabilityByConcept.get(row.concept_id) || new Map();
    byCourse.set(row.course_id, Number(row.question_count || 0));
    availabilityByConcept.set(row.concept_id, byCourse);
  }
  const courseById = new Map(courses.map((course) => [course.id, course]));

  return {
    subjects: (subjects as any[])
      .map((subject) => ({
        id: subject.id,
        slug: subject.slug,
        name: subject.name,
        groups: (groups as any[])
          .filter((group) => group.subject_id === subject.id)
          .map((group) => ({
            id: group.id,
            slug: group.slug,
            name: group.name,
            description: group.description,
            concepts: (concepts as any[])
              .filter((concept) => concept.group_id === group.id)
              .map((concept) => {
                const byCourse = availabilityByConcept.get(concept.id) || new Map();
                return {
                  id: concept.id,
                  slug: concept.slug,
                  name: concept.name,
                  description: concept.description,
                  aliases: concept.aliases || [],
                  mappingVersion: concept.mapping_version,
                  courses: [...byCourse.entries()]
                    .map(([courseId, questionCount]) => {
                      const course = courseById.get(courseId);
                      return course
                        ? {
                            id: course.id,
                            slug: course.slug,
                            name: course.name,
                            level: course.level,
                            syllabusLabel: course.syllabus_label,
                            questionCount,
                          }
                        : null;
                    })
                    .filter(Boolean),
                };
              })
              .filter((concept) => concept.courses.length),
          }))
          .filter((group) => group.concepts.length),
      }))
      .filter((subject) => subject.groups.length),
  };
}

export type PracticeBuilderCatalog = Awaited<
  ReturnType<typeof getPracticeBuilderCatalog>
>;
