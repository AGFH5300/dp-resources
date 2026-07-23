'use server';

import { redirect } from 'next/navigation';
import { resolveLoginEmail } from '@/lib/login-identifier';
import { createSupabaseServerClient } from '@/lib/supabase';

const GENERIC_LOGIN_ERROR = 'Invalid username/email or password.';

export async function login(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const identifier = String(
    formData.get('identifier') ?? formData.get('email') ?? '',
  );
  const password = String(formData.get('password'));
  const email = await resolveLoginEmail(identifier);

  if (!email) {
    redirect('/auth?error=' + encodeURIComponent(GENERIC_LOGIN_ERROR));
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/auth?error=' + encodeURIComponent(GENERIC_LOGIN_ERROR));
  redirect('/library');
}

export async function signup(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get('email'));
  const password = String(formData.get('password'));
  const full_name = String(formData.get('full_name') || '');
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  });
  if (error)
    redirect('/auth?mode=signup&error=' + encodeURIComponent(error.message));
  redirect('/auth?verify=1');
}
