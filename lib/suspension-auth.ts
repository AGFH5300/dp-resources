type AuthErrorLike = {
  code?: string | null;
  message?: string | null;
};

export function isSuspendedAuthError(error: AuthErrorLike | string) {
  const code = typeof error === 'string' ? '' : (error.code ?? '');
  const message =
    typeof error === 'string' ? error : (error.message ?? '');

  return (
    code === 'user_banned' ||
    /\b(?:banned|suspended)\b/i.test(message)
  );
}
