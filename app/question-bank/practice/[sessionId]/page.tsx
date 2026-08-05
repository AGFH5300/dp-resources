export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';

import { Nav } from '@/components/nav';
import { LocalPracticeSessionPage } from '@/components/question-bank/local-practice-session-page';
import { requireMember } from '@/lib/auth';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PracticeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { membership } = await requireMember();
  const { sessionId } = await params;
  if (!UUID.test(sessionId)) notFound();

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <LocalPracticeSessionPage
        sessionId={sessionId}
        userId={membership.id}
      />
    </>
  );
}
