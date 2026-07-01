import { redirect } from 'next/navigation'

export default async function AuthPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  redirect(params.mode === 'signup' ? '/auth/sign-up' : '/auth/login')
}
