'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
export async function setApproval(formData:FormData){await requireAdmin(); const id=String(formData.get('id')); const approve=formData.get('approve')==='true'; await createSupabaseAdminClient().from('profiles').update({is_approved:approve,approved_at:approve?new Date().toISOString():null}).eq('id',id); revalidatePath('/admin')}
