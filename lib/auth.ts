import { redirect } from 'next/navigation';
import { getSessionProfile } from './supabase';
export async function requireUser(){const ctx=await getSessionProfile(); if(!ctx.user) redirect('/auth'); return ctx as typeof ctx & {user:NonNullable<typeof ctx.user>}}
export async function requireApproved(){const ctx=await requireUser(); if(!ctx.profile?.is_approved) redirect('/awaiting-approval'); return ctx as typeof ctx & {profile:NonNullable<typeof ctx.profile>}}
export async function requireAdmin(){const ctx=await requireApproved(); if(ctx.profile.role!=='admin') redirect('/library'); return ctx as typeof ctx & {profile:NonNullable<typeof ctx.profile>}}
