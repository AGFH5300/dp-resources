export type AccountProfileSnapshot = {
  username: string | null;
  avatarUrl: string | null;
  fetchedAt: number;
};

// Signed avatar URLs currently live for one hour. Reuse the same URL for normal
// client-side navigation and refresh it with a comfortable margin before expiry.
export const ACCOUNT_PROFILE_CACHE_TTL_MS = 45 * 60 * 1000;

const profileCache = new Map<string, AccountProfileSnapshot>();
const profileRequests = new Map<string, Promise<AccountProfileSnapshot>>();

function normalizeProfile(data: {
  username?: string | null;
  avatarUrl?: string | null;
}): AccountProfileSnapshot {
  return {
    username: data.username?.trim() || null,
    avatarUrl: data.avatarUrl || null,
    fetchedAt: Date.now(),
  };
}

export function peekCachedAccountProfile(
  userId?: string | null,
): AccountProfileSnapshot | null {
  if (!userId) return null;
  const cached = profileCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt >= ACCOUNT_PROFILE_CACHE_TTL_MS) return null;
  return cached;
}

async function preloadAvatar(url: string) {
  if (typeof Image === 'undefined') return;

  await new Promise<void>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    image.onload = finish;
    image.onerror = finish;
    image.src = url;

    // Do not hold a profile refresh indefinitely if an image host is slow.
    window.setTimeout(finish, 4000);
  });
}

export async function loadAccountProfile(
  userId: string,
  options: { force?: boolean } = {},
): Promise<AccountProfileSnapshot> {
  const cached = peekCachedAccountProfile(userId);
  if (cached && !options.force) return cached;

  const inFlight = profileRequests.get(userId);
  if (inFlight) return inFlight;

  const previous = profileCache.get(userId) || null;
  const request = fetch('/api/account/profile', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Profile request failed');
      return response.json() as Promise<{
        username?: string | null;
        avatarUrl?: string | null;
      }>;
    })
    .then(async (data) => {
      const next = normalizeProfile(data);

      // When the avatar genuinely changes, warm the new signed URL before the
      // header swaps its src. The existing picture therefore remains visible
      // until the replacement is ready in the browser cache.
      if (
        previous?.avatarUrl &&
        next.avatarUrl &&
        previous.avatarUrl !== next.avatarUrl
      ) {
        await preloadAvatar(next.avatarUrl);
      }

      profileCache.set(userId, next);
      return next;
    })
    .finally(() => {
      profileRequests.delete(userId);
    });

  profileRequests.set(userId, request);
  return request;
}
