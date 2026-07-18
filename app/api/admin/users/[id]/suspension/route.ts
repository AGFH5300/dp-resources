import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import type { ResourceMembership } from '@/lib/types';

type SuspensionRequest = {
  suspended: boolean;
  reason?: string;
  blockDomain?: boolean;
};
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

function domainFromEmail(email: string) {
  return email.trim().toLowerCase().split('@').pop() ?? '';
}

type DomainPolicy = {
  allowed?: boolean;
  matched_domain?: string | null;
  domain?: string | null;
};

async function getMatchingDomainPolicy(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
) {
  const { data, error } = await supabase.rpc(
    'dp_resource_email_domain_policy',
    { p_email: email.trim().toLowerCase() },
  );
  if (error) throw error;
  return data as DomainPolicy | null;
}

type ModerationEvent = {
  target_user_id: string;
  target_email: string;
  actor_user_id: string;
  actor_email: string;
  action: 'suspend' | 'unsuspend' | 'block_domain';
  reason: string | null;
  metadata: Record<string, unknown>;
};

async function recordModerationEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  event: ModerationEvent,
  warnings: string[],
) {
  const { error } = await supabase
    .from('dp_resource_moderation_events')
    .insert(event);
  if (error) {
    console.error('[admin-suspension] moderation audit failed', {
      action: event.action,
      targetUserId: event.target_user_id,
      code: error.code,
      message: error.message,
    });
    warnings.push(
      'The account change was saved, but the moderation audit log could not be written.',
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const { id: targetUserId } = await params;
  if (!UUID_RE.test(targetUserId))
    return json({ error: 'Invalid user ID.' }, 400);

  let body: SuspensionRequest;
  try {
    body = (await request.json()) as SuspensionRequest;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (typeof body.suspended !== 'boolean')
    return json({ error: 'suspended must be a boolean.' }, 400);

  const { user: actingAdmin, membership: actingMembership } =
    await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const warnings: string[] = [];
  const now = new Date().toISOString();

  const { data: target, error: targetError } = await supabase
    .from('dp_resource_memberships')
    .select('*')
    .eq('id', targetUserId)
    .maybeSingle<ResourceMembership>();

  if (targetError) return json({ error: 'Could not read target user.' }, 500);
  if (!target) return json({ error: 'User not found.' }, 404);

  if (body.suspended) {
    const reason = body.reason?.trim() ?? '';
    if (reason.length < 3 || reason.length > 500)
      return json(
        { error: 'Suspension reason must be between 3 and 500 characters.' },
        400,
      );
    if (target.id === actingAdmin.id)
      return json(
        { error: 'Administrators cannot suspend their own account.' },
        403,
      );
    if (target.role === 'admin')
      return json(
        {
          error: 'Administrator accounts cannot be suspended from this panel.',
        },
        403,
      );

    const { error: updateError } = await supabase
      .from('dp_resource_memberships')
      .update({
        is_suspended: true,
        suspended_at: now,
        suspended_by: actingAdmin.id,
        suspension_reason: reason,
      })
      .eq('id', targetUserId);
    if (updateError) return json({ error: 'Could not suspend user.' }, 500);

    const { error: banError } = await supabase.auth.admin.updateUserById(
      targetUserId,
      { ban_duration: '876000h' },
    );
    if (banError) {
      console.error('[admin-suspension] auth ban failed', {
        targetUserId,
        code: banError.code,
        message: banError.message,
      });
      warnings.push(
        'The account is suspended in the application, but the Auth ban could not be applied.',
      );
    }

    const metadata: Record<string, unknown> = {
      blockDomainRequested: body.blockDomain === true,
    };
    await recordModerationEvent(
      supabase,
      {
        target_user_id: targetUserId,
        target_email: target.email,
        actor_user_id: actingAdmin.id,
        actor_email: actingMembership.email,
        action: 'suspend',
        reason,
        metadata,
      },
      warnings,
    );

    if (body.blockDomain) {
      const domain = domainFromEmail(target.email);
      if (domain) {
        let policy: DomainPolicy | null = null;
        try {
          policy = await getMatchingDomainPolicy(supabase, target.email);
        } catch (error) {
          console.error('[admin-suspension] domain policy check failed', {
            domain,
            error,
          });
          warnings.push(
            'The user was suspended, but the domain block could not be saved because the existing domain policy could not be verified.',
          );
        }

        const matchedDomain = policy?.matched_domain ?? null;
        if (policy?.allowed === true && matchedDomain) {
          warnings.push(
            'This email domain has an explicit allow rule and was not blocked. The individual account was suspended.',
          );
        } else if (policy?.allowed === false && matchedDomain) {
          warnings.push('This email domain is already blocked.');
        } else if (policy) {
          const { error: domainError } = await supabase
            .from('dp_resource_email_domain_rules')
            .upsert(
              {
                domain,
                action: 'block',
                source: 'admin',
                created_by: actingAdmin.id,
                reason: reason.slice(0, 200),
                updated_at: now,
              },
              { onConflict: 'domain' },
            );
          if (domainError) {
            console.error('[admin-suspension] domain block failed', {
              domain,
              code: domainError.code,
              message: domainError.message,
            });
            warnings.push(
              'The user was suspended, but the domain block could not be saved.',
            );
          } else {
            await recordModerationEvent(
              supabase,
              {
                target_user_id: targetUserId,
                target_email: target.email,
                actor_user_id: actingAdmin.id,
                actor_email: actingMembership.email,
                action: 'block_domain',
                reason,
                metadata: { domain },
              },
              warnings,
            );
          }
        }
      }
    }

    return json({ ok: true, suspended: true, warnings });
  }

  const { error: unbanError } = await supabase.auth.admin.updateUserById(
    targetUserId,
    { ban_duration: 'none' },
  );
  if (unbanError)
    return json(
      { error: 'Could not unban user; suspension remains active.' },
      500,
    );

  const { error: updateError } = await supabase
    .from('dp_resource_memberships')
    .update({
      is_suspended: false,
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null,
    })
    .eq('id', targetUserId);
  if (updateError)
    return json({ error: 'Could not clear application suspension.' }, 500);

  await recordModerationEvent(
    supabase,
    {
      target_user_id: targetUserId,
      target_email: target.email,
      actor_user_id: actingAdmin.id,
      actor_email: actingMembership.email,
      action: 'unsuspend',
      reason: body.reason?.trim() || null,
      metadata: {},
    },
    warnings,
  );

  return json({ ok: true, suspended: false, warnings });
}
