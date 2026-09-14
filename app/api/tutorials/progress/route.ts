import { requireApiMember } from '@/lib/auth';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  isSupportedTutorial,
  tutorialDismissalKey,
} from '@/lib/tutorials';

export const dynamic = 'force-dynamic';

type DismissalRow = {
  dismissed_at: string;
};

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function readTutorialIdentity(keyValue: unknown, versionValue: unknown) {
  const key = typeof keyValue === 'string' ? keyValue.trim() : '';
  const version =
    typeof versionValue === 'number'
      ? versionValue
      : typeof versionValue === 'string'
        ? Number(versionValue)
        : Number.NaN;

  if (!Number.isInteger(version) || !isSupportedTutorial(key, version)) {
    return null;
  }

  return { key, version };
}

export async function GET(request: Request) {
  const context = await requireApiMember();
  if (!context.ok) return context.response;

  const url = new URL(request.url);
  const tutorial = readTutorialIdentity(
    url.searchParams.get('key'),
    url.searchParams.get('version'),
  );
  if (!tutorial) {
    return noStore({ error: 'Unknown tutorial version.' }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_resource_onboarding_dismissals')
    .select('dismissed_at')
    .eq('user_id', context.user.id)
    .eq('key', tutorialDismissalKey(tutorial.key, tutorial.version))
    .maybeSingle<DismissalRow>();

  if (error) {
    console.error('Unable to load tutorial progress.', error.message);
    return noStore(
      { error: 'Unable to load tutorial progress.' },
      { status: 503 },
    );
  }

  return noStore({
    key: tutorial.key,
    version: tutorial.version,
    dismissed: Boolean(data),
    dismissedAt: data?.dismissed_at ?? null,
  });
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const context = await requireApiMember();
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    return noStore({ error: 'Invalid tutorial request.' }, { status: 400 });
  }

  const tutorial = readTutorialIdentity(body.key, body.version);
  if (!tutorial) {
    return noStore({ error: 'Unknown tutorial version.' }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const dismissedAt = new Date().toISOString();
  const { error } = await sb.from('dp_resource_onboarding_dismissals').upsert(
    {
      user_id: context.user.id,
      key: tutorialDismissalKey(tutorial.key, tutorial.version),
      dismissed_at: dismissedAt,
    },
    { onConflict: 'user_id,key' },
  );

  if (error) {
    console.error('Unable to save tutorial progress.', error.message);
    return noStore(
      { error: 'Unable to save tutorial progress.' },
      { status: 503 },
    );
  }

  return noStore({
    ok: true,
    key: tutorial.key,
    version: tutorial.version,
    dismissed: true,
    dismissedAt,
  });
}
