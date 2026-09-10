import {
  ACCOUNT_AVATAR_BUCKET,
  ACCOUNT_AVATAR_MAX_BYTES,
  signedAccountAvatarUrl,
} from '@/lib/account-avatar';
import { requireApiMember } from '@/lib/auth';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const MIME_TO_EXTENSION = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function normalizedMimeType(request: Request) {
  return (request.headers.get('content-type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

function hasExpectedMagicBytes(type: string, bytes: Uint8Array) {
  if (type === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (type === 'image/png') {
    const expected = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return (
      bytes.length >= expected.length &&
      expected.every((value, index) => bytes[index] === value)
    );
  }
  if (type === 'image/webp') {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    return bytes.length >= 12 && riff === 'RIFF' && webp === 'WEBP';
  }
  return false;
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const context = await requireApiMember();
  if (!context.ok) return context.response;

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > ACCOUNT_AVATAR_MAX_BYTES) {
    return noStore(
      { error: 'Profile images must be 2 MB or smaller.' },
      { status: 413 },
    );
  }

  const mimeType = normalizedMimeType(request);
  const extension = MIME_TO_EXTENSION.get(mimeType);
  if (!extension) {
    return noStore(
      { error: 'Use a JPG, PNG, or WebP image.' },
      { status: 415 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch (error) {
    console.error('Unable to read account avatar request body.', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return noStore(
      { error: 'Unable to read that image. Please choose it again.' },
      { status: 400 },
    );
  }

  if (bytes.length < 1 || bytes.length > ACCOUNT_AVATAR_MAX_BYTES) {
    return noStore(
      { error: 'Profile images must be 2 MB or smaller.' },
      { status: 413 },
    );
  }

  if (!hasExpectedMagicBytes(mimeType, bytes)) {
    return noStore(
      { error: 'That image file is not valid.' },
      { status: 415 },
    );
  }

  const sb = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await sb
    .from('dp_resource_profiles')
    .select('avatar_path')
    .eq('id', context.user.id)
    .maybeSingle<{ avatar_path: string | null }>();
  if (profileError) {
    return noStore(
      { error: 'Unable to update your profile image.' },
      { status: 503 },
    );
  }

  const path = `${context.user.id}/avatar.${extension}`;
  const { error: uploadError } = await sb.storage
    .from(ACCOUNT_AVATAR_BUCKET)
    .upload(path, bytes, {
      upsert: true,
      contentType: mimeType,
      cacheControl: '3600',
    });
  if (uploadError) {
    console.error('Unable to upload account avatar.', {
      message: uploadError.message,
    });
    return noStore(
      { error: 'Unable to upload your profile image.' },
      { status: 503 },
    );
  }

  if (profile?.avatar_path && profile.avatar_path !== path) {
    await sb.storage.from(ACCOUNT_AVATAR_BUCKET).remove([profile.avatar_path]);
  }

  const { error: updateError } = await sb
    .from('dp_resource_profiles')
    .update({ avatar_path: path })
    .eq('id', context.user.id);
  if (updateError) {
    await sb.storage.from(ACCOUNT_AVATAR_BUCKET).remove([path]);
    return noStore(
      { error: 'Unable to save your profile image.' },
      { status: 503 },
    );
  }

  return noStore({
    ok: true,
    avatarUrl: await signedAccountAvatarUrl(path),
  });
}

export async function DELETE(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const context = await requireApiMember();
  if (!context.ok) return context.response;

  const sb = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await sb
    .from('dp_resource_profiles')
    .select('avatar_path')
    .eq('id', context.user.id)
    .maybeSingle<{ avatar_path: string | null }>();
  if (profileError) {
    return noStore(
      { error: 'Unable to remove your profile image.' },
      { status: 503 },
    );
  }

  if (profile?.avatar_path) {
    const { error: removeError } = await sb.storage
      .from(ACCOUNT_AVATAR_BUCKET)
      .remove([profile.avatar_path]);
    if (removeError) {
      console.error('Unable to remove account avatar object.', {
        message: removeError.message,
      });
    }
  }

  const { error } = await sb
    .from('dp_resource_profiles')
    .update({ avatar_path: null })
    .eq('id', context.user.id);
  if (error) {
    return noStore(
      { error: 'Unable to remove your profile image.' },
      { status: 503 },
    );
  }

  return noStore({ ok: true });
}
