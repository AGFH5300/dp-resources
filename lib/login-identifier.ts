import 'server-only';

import { isValidEmail } from './auth-email';
import { createSupabaseAdminClient } from './supabase-admin';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;

export const INVALID_LOGIN_EMAIL =
  '__dp_resources_missing_login__@example.invalid';

function escapeIlikeLiteral(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function normalizeLoginIdentifier(value: unknown) {
  return String(value ?? '').trim();
}

export async function resolveLoginEmail(identifier: string) {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized || normalized.length > 320) return null;

  if (isValidEmail(normalized)) return normalized.toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('dp_resource_profiles')
    .select('username,email')
    .ilike('username', escapeIlikeLiteral(normalized));

  if (error) {
    throw new Error(`Unable to resolve login username: ${error.message}`);
  }

  const normalizedUsername = normalized.toLowerCase();
  const match = (data ?? []).find(
    (profile) =>
      String(profile.username || '')
        .trim()
        .toLowerCase() === normalizedUsername,
  );
  const email = String(match?.email || '')
    .trim()
    .toLowerCase();

  return email || null;
}
