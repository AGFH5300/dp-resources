import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextApiRequest, NextApiResponse } from 'next';

import {
  ACCOUNT_AVATAR_BUCKET,
  ACCOUNT_AVATAR_MAX_BYTES,
  signedAccountAvatarUrl,
} from '@/lib/account-avatar';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { getSupabaseServerConfig } from '@/lib/supabase-config';

export const config = {
  api: {
    bodyParser: false,
  },
};

const MIME_TO_EXTENSION = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noStore(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

function sendJson(res: NextApiResponse, status: number, payload: unknown) {
  noStore(res);
  res.status(status).json(payload);
}

function sameOrigin(req: NextApiRequest) {
  const origin = firstHeader(req.headers.origin);
  if (!origin) return true;

  const host =
    firstHeader(req.headers['x-forwarded-host']) || firstHeader(req.headers.host);
  if (!host) return false;

  const forwardedProto = firstHeader(req.headers['x-forwarded-proto']);
  const proto = forwardedProto?.split(',')[0]?.trim() || 'https';
  return origin === `${proto}://${host}`;
}

function serializeCookie(name: string, value: string, options: CookieOptions) {
  const parts = [`${name}=${value}`];

  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');

  if (options.sameSite) {
    const sameSite =
      options.sameSite === true
        ? 'Strict'
        : `${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`;
    parts.push(`SameSite=${sameSite}`);
  }

  return parts.join('; ');
}

async function authenticatedUser(req: NextApiRequest, res: NextApiResponse) {
  const { supabaseUrl, supabaseKey } = getSupabaseServerConfig();
  if (!supabaseUrl || !supabaseKey) {
    sendJson(res, 503, { error: 'Your account could not be verified. Please retry.' });
    return null;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () =>
        Object.entries(req.cookies)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([name, value]) => ({ name, value })),
      setAll(cookiesToSet) {
        res.setHeader(
          'Set-Cookie',
          cookiesToSet.map(({ name, value, options }) =>
            serializeCookie(name, value, options),
          ),
        );
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    sendJson(res, 401, {
      error: 'Your sign-in has expired. Refresh the page and sign in again.',
    });
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from('dp_resource_memberships')
    .select('id,is_suspended')
    .eq('id', user.id)
    .maybeSingle<{ id: string; is_suspended: boolean }>();

  if (membershipError) {
    sendJson(res, 503, { error: 'Your account could not be verified. Please retry.' });
    return null;
  }
  if (!membership) {
    sendJson(res, 403, { error: 'An approved DP Resources account is required.' });
    return null;
  }
  if (membership.is_suspended) {
    sendJson(res, 403, { error: 'This DP Resources account is suspended.' });
    return null;
  }

  return user;
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

async function readRawBody(req: NextApiRequest) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > ACCOUNT_AVATAR_MAX_BYTES) {
      throw new Error('avatar_too_large');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

async function uploadAvatar(req: NextApiRequest, res: NextApiResponse) {
  const user = await authenticatedUser(req, res);
  if (!user) return;

  const rawLength = firstHeader(req.headers['content-length']);
  const contentLength = rawLength ? Number(rawLength) : 0;
  if (
    Number.isFinite(contentLength) &&
    contentLength > ACCOUNT_AVATAR_MAX_BYTES
  ) {
    sendJson(res, 413, { error: 'Profile images must be 2 MB or smaller.' });
    return;
  }

  const mimeType = (firstHeader(req.headers['content-type']) || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const extension = MIME_TO_EXTENSION.get(mimeType);
  if (!extension) {
    sendJson(res, 415, { error: 'Use a JPG, PNG, or WebP image.' });
    return;
  }

  let bytes: Buffer;
  try {
    bytes = await readRawBody(req);
  } catch (error) {
    if (error instanceof Error && error.message === 'avatar_too_large') {
      sendJson(res, 413, { error: 'Profile images must be 2 MB or smaller.' });
      return;
    }
    console.error('Unable to read account avatar request stream.', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    sendJson(res, 400, { error: 'Unable to read that image. Please choose it again.' });
    return;
  }

  if (bytes.length < 1 || bytes.length > ACCOUNT_AVATAR_MAX_BYTES) {
    sendJson(res, 413, { error: 'Profile images must be 2 MB or smaller.' });
    return;
  }
  if (!hasExpectedMagicBytes(mimeType, bytes)) {
    sendJson(res, 415, { error: 'That image file is not valid.' });
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('dp_resource_profiles')
    .select('avatar_path')
    .eq('id', user.id)
    .maybeSingle<{ avatar_path: string | null }>();

  if (profileError) {
    sendJson(res, 503, { error: 'Unable to update your profile image.' });
    return;
  }

  const path = `${user.id}/avatar.${extension}`;
  const { error: uploadError } = await admin.storage
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
    sendJson(res, 503, { error: 'Unable to upload your profile image.' });
    return;
  }

  const { error: updateError } = await admin
    .from('dp_resource_profiles')
    .update({ avatar_path: path })
    .eq('id', user.id);

  if (updateError) {
    await admin.storage.from(ACCOUNT_AVATAR_BUCKET).remove([path]);
    sendJson(res, 503, { error: 'Unable to save your profile image.' });
    return;
  }

  if (profile?.avatar_path && profile.avatar_path !== path) {
    await admin.storage.from(ACCOUNT_AVATAR_BUCKET).remove([profile.avatar_path]);
  }

  sendJson(res, 200, {
    ok: true,
    avatarUrl: await signedAccountAvatarUrl(path),
  });
}

async function removeAvatar(req: NextApiRequest, res: NextApiResponse) {
  const user = await authenticatedUser(req, res);
  if (!user) return;

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('dp_resource_profiles')
    .select('avatar_path')
    .eq('id', user.id)
    .maybeSingle<{ avatar_path: string | null }>();

  if (profileError) {
    sendJson(res, 503, { error: 'Unable to remove your profile image.' });
    return;
  }

  if (profile?.avatar_path) {
    const { error: removeError } = await admin.storage
      .from(ACCOUNT_AVATAR_BUCKET)
      .remove([profile.avatar_path]);
    if (removeError) {
      console.error('Unable to remove account avatar object.', {
        message: removeError.message,
      });
    }
  }

  const { error } = await admin
    .from('dp_resource_profiles')
    .update({ avatar_path: null })
    .eq('id', user.id);

  if (error) {
    sendJson(res, 503, { error: 'Unable to remove your profile image.' });
    return;
  }

  sendJson(res, 200, { ok: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  if (req.method === 'POST') {
    await uploadAvatar(req, res);
    return;
  }
  if (req.method === 'DELETE') {
    await removeAvatar(req, res);
    return;
  }

  res.setHeader('Allow', 'POST, DELETE');
  sendJson(res, 405, { error: 'Method not allowed.' });
}
