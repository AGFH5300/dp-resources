import 'server-only';

import { driveAuth } from './drive';

const DRIVE_HEADER_TIMEOUT_MS = 8_000;

let cachedAuth: ReturnType<typeof driveAuth> | null = null;
let tokenRefresh: Promise<string> | null = null;

function authClient() {
  if (!cachedAuth) cachedAuth = driveAuth();
  return cachedAuth;
}

async function refreshAccessToken() {
  const auth = authClient();
  const token = await auth.getAccessToken();
  const value = typeof token === 'string' ? token : token?.token;
  if (!value) throw new Error('Unable to authorize Drive request');
  return value;
}

export async function getCachedDriveAccessToken() {
  const auth = authClient();
  const current = auth.credentials.access_token;
  const expiresAt = auth.credentials.expiry_date ?? 0;

  if (current && expiresAt > Date.now() + 60_000) return current;

  if (!tokenRefresh) {
    tokenRefresh = refreshAccessToken().finally(() => {
      tokenRefresh = null;
    });
  }
  return tokenRefresh;
}

export async function getFastDriveMediaFetch(
  fileId: string,
  range?: string | null,
) {
  const token = await getCachedDriveAccessToken();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DRIVE_HEADER_TIMEOUT_MS,
  );

  try {
    return await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(range ? { Range: range } : {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}
