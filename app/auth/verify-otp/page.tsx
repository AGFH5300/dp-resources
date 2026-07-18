import { VerifyOtpForm } from './verify-otp-form';

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const emailParam = params.email;
  const usernameParam = params.username;
  const fullNameParam = params.fullName;
  const nextParam = params.next;

  const email = typeof emailParam === 'string' ? emailParam : '';
  const username = typeof usernameParam === 'string' ? usernameParam : '';
  const fullName = typeof fullNameParam === 'string' ? fullNameParam : '';
  const next =
    typeof nextParam === 'string' &&
    nextParam.startsWith('/') &&
    !nextParam.startsWith('//')
      ? nextParam
      : '/library';

  return (
    <VerifyOtpForm
      email={email}
      username={username}
      fullName={fullName}
      next={next}
    />
  );
}
