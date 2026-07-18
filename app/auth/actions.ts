'use server';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
export async function login(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get('email'));
  const password = String(formData.get('password'));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/auth?error=' + encodeURIComponent(error.message));
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
