export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

import { requireMember } from '@/lib/auth';

export default async function JoinPracticeSetPage() {
  await requireMember();
  redirect('/question-bank?join=1');
}
