import { headers } from 'next/headers';
import { createSupabaseAdminClient, isSupabaseConfigured } from './supabase';
import { privacySafeRequestKey, rateLimit } from './rate-limit';
import type { ActivityLog } from './types';

type ActivityInput = {
  userId: string;
  userEmail: string;
  fileId?: string | null;
  fileName: string;
  action: ActivityLog['action'];
};

export async function recordActivity(input: ActivityInput) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const h = await headers();
  const { error } = await createSupabaseAdminClient()
    .from('dp_resource_activity_logs')
    .insert({
      user_id: input.userId,
      user_email: input.userEmail,
      file_id: input.fileId,
      file_name: input.fileName,
      action: input.action,
      ip_address: h.get('x-forwarded-for')?.split(',')[0] || null,
      user_agent: h.get('user-agent'),
    });
  if (error) throw new Error(`Unable to record resource activity: ${error.message}`);
}

export async function recordFileOpenedOnce(
  req: Request,
  input: Omit<ActivityInput, 'action'>,
) {
  const fileId = input.fileId || 'unknown';
  const gate = await rateLimit(
    privacySafeRequestKey(req, `file-open:${input.userId}:${fileId}`),
    1,
    15 * 1000,
    'file-open-audit',
  );
  if (!gate.ok) return;
  await recordActivity({ ...input, action: 'file_opened' });
}
