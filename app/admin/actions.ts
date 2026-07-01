'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

export async function setApproval(formData: FormData) {
  const { user } = await requireAdmin();
  const id = String(formData.get('id') || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid membership id');
  const approve = formData.get('approve') === 'true';
  if (!approve && id === user.id) throw new Error('Admins cannot revoke their own access');
  const sb = createSupabaseAdminClient();
  if (!approve) {
    const { count, error } = await sb.from('dp_resource_memberships').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_approved', true);
    if (error) throw new Error(error.message);
    const { data: target, error: targetError } = await sb.from('dp_resource_memberships').select('role,is_approved').eq('id', id).single();
    if (targetError) throw new Error(targetError.message);
    if (target?.role === 'admin' && target.is_approved && (count || 0) <= 1) throw new Error('Cannot revoke the final approved admin');
  }
  const { error } = await sb.from('dp_resource_memberships').update({ is_approved: approve, approved_at: approve ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}
