import { requireApiMember } from '@/lib/auth';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { getWhatsNewRelease } from '@/lib/whats-new';

export const dynamic = 'force-dynamic';

type SettingsRow = {
  viewed_whats_new_releases: unknown;
};

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function releaseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (releaseId): releaseId is string =>
          typeof releaseId === 'string' && releaseId.length > 0 && releaseId.length <= 120,
      ),
    ),
  );
}

export async function GET() {
  const context = await requireApiMember();
  if (!context.ok) return context.response;

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_resource_user_settings')
    .select('viewed_whats_new_releases')
    .eq('id', context.user.id)
    .maybeSingle<SettingsRow>();

  if (error) {
    return noStore(
      { error: 'Unable to load viewed releases.' },
      { status: 503 },
    );
  }

  return noStore({
    viewedReleaseIds: releaseIds(data?.viewed_whats_new_releases),
  });
}

export async function PATCH(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const context = await requireApiMember();
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body) || typeof body.releaseId !== 'string') {
    return noStore({ error: 'Invalid release request.' }, { status: 400 });
  }

  const release = getWhatsNewRelease(body.releaseId);
  if (!release) {
    return noStore({ error: 'Unknown release.' }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: current, error: currentError } = await sb
    .from('dp_resource_user_settings')
    .select('viewed_whats_new_releases')
    .eq('id', context.user.id)
    .maybeSingle<SettingsRow>();

  if (currentError) {
    return noStore(
      { error: 'Unable to load viewed releases.' },
      { status: 503 },
    );
  }

  const viewedReleaseIds = Array.from(
    new Set([
      ...releaseIds(current?.viewed_whats_new_releases),
      release.id,
    ]),
  );

  const { error } = await sb.from('dp_resource_user_settings').upsert({
    id: context.user.id,
    viewed_whats_new_releases: viewedReleaseIds,
  });
  if (error) {
    return noStore(
      { error: 'Unable to save viewed release.' },
      { status: 503 },
    );
  }

  return noStore({ ok: true, viewedReleaseIds });
}
