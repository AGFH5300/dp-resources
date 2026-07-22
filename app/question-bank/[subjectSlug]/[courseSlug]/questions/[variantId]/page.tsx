export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

import { requireMember } from '@/lib/auth';

export default async function LegacyQuestionPage({
  params,
}: {
  params: Promise<{
    subjectSlug: string;
    courseSlug: string;
    variantId: string;
  }>;
}) {
  await requireMember();
  const route = await params;
  const query = new URLSearchParams({ question: route.variantId });
  redirect(
    `/question-bank/${route.subjectSlug}/${route.courseSlug}?${query.toString()}`,
  );
}
