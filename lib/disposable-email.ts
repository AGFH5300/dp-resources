import type { SupabaseClient } from '@supabase/supabase-js';

export type EmailDomainPolicy = {
  allowed: boolean;
  domain: string;
  reason: string | null;
};

export const DISPOSABLE_EMAIL_MESSAGE =
  'Temporary or disposable email addresses cannot be used. Please use a permanent email address.';

function emailDomain(email: string) {
  return email.toLowerCase().split('@').pop() ?? '';
}

export async function getEmailDomainPolicy(
  supabase: SupabaseClient,
  email: string,
): Promise<EmailDomainPolicy> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.rpc(
    'dp_resource_email_domain_policy',
    { p_email: normalizedEmail },
  );
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[email-domain-policy] rpc failed', {
        domain: emailDomain(normalizedEmail),
        code: error.code,
        message: error.message,
      });
    }
    throw new Error('Unable to validate email domain policy.');
  }

  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') {
    return {
      allowed: false,
      domain: emailDomain(normalizedEmail),
      reason: 'invalid_policy_response',
    };
  }

  const record = value as Record<string, unknown>;
  return {
    allowed: record.allowed === true,
    domain:
      typeof record.domain === 'string'
        ? record.domain
        : emailDomain(normalizedEmail),
    reason: typeof record.reason === 'string' ? record.reason : null,
  };
}
