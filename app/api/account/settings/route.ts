import { requireApiMember } from '@/lib/auth';
import {
  DEFAULT_ACCOUNT_PREFERENCES,
  normalizeAcademicSubjects,
  normalizeExamSession,
  normalizeExamYear,
  type AccountPreferences,
} from '@/lib/account-settings';
import { signedAccountAvatarUrl } from '@/lib/account-avatar';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  username: string | null;
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
  academic_subjects: unknown;
  exam_year: number | null;
  exam_session: string | null;
};

type SettingsRow = {
  show_library_source_tags: boolean;
  show_library_resource_type_labels: boolean;
  show_question_bank_source_tags: boolean;
  show_expanded_source_attribution: boolean;
  support_notifications: boolean;
  show_whats_new: boolean;
};

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function text(value: unknown, maximum: number) {
  return typeof value === 'string' && value.length <= maximum
    ? value.trim()
    : '';
}

function preferencesFromRow(row: SettingsRow | null | undefined): AccountPreferences {
  if (!row) return DEFAULT_ACCOUNT_PREFERENCES;
  return {
    showLibrarySourceTags: row.show_library_source_tags !== false,
    showLibraryResourceTypeLabels:
      row.show_library_resource_type_labels !== false,
    showQuestionBankSourceTags: row.show_question_bank_source_tags !== false,
    showExpandedSourceAttribution:
      row.show_expanded_source_attribution !== false,
    supportNotifications: row.support_notifications !== false,
    showWhatsNew: row.show_whats_new !== false,
  };
}

function preferencesToRow(value: Record<string, unknown>) {
  return {
    show_library_source_tags: value.showLibrarySourceTags !== false,
    show_library_resource_type_labels:
      value.showLibraryResourceTypeLabels !== false,
    show_question_bank_source_tags: value.showQuestionBankSourceTags !== false,
    show_expanded_source_attribution:
      value.showExpandedSourceAttribution !== false,
    support_notifications: value.supportNotifications !== false,
    show_whats_new: value.showWhatsNew !== false,
  };
}

async function loadPayload(userId: string, authEmail: string | null) {
  const sb = createSupabaseAdminClient();
  const [profileResult, settingsResult, subjectResult] = await Promise.all([
    sb
      .from('dp_resource_profiles')
      .select(
        'username,full_name,email,avatar_path,academic_subjects,exam_year,exam_session',
      )
      .eq('id', userId)
      .maybeSingle<ProfileRow>(),
    sb
      .from('dp_resource_user_settings')
      .select(
        'show_library_source_tags,show_library_resource_type_labels,show_question_bank_source_tags,show_expanded_source_attribution,support_notifications,show_whats_new',
      )
      .eq('id', userId)
      .maybeSingle<SettingsRow>(),
    sb.from('dp_qb_subjects').select('slug,name').order('name'),
  ]);

  if (profileResult.error || settingsResult.error) {
    console.error('Unable to load account centre.', {
      profile: profileResult.error?.message,
      settings: settingsResult.error?.message,
    });
    return { ok: false as const };
  }

  if (subjectResult.error) {
    console.error('Unable to load academic subject catalogue.', {
      message: subjectResult.error.message,
    });
  }

  const profile = profileResult.data;
  const avatarUrl = await signedAccountAvatarUrl(profile?.avatar_path);
  return {
    ok: true as const,
    payload: {
      profile: {
        username: profile?.username?.trim() || '',
        displayName: profile?.full_name?.trim() || '',
        email: authEmail || profile?.email?.trim() || '',
        avatarUrl,
      },
      academic: {
        subjects: normalizeAcademicSubjects(profile?.academic_subjects),
        examYear: normalizeExamYear(profile?.exam_year),
        examSession: normalizeExamSession(profile?.exam_session),
      },
      preferences: preferencesFromRow(settingsResult.data),
      availableSubjects: (subjectResult.data || [])
        .map((subject) => ({
          slug: String(subject.slug || '').trim(),
          name: String(subject.name || '').trim(),
        }))
        .filter((subject) => subject.slug && subject.name),
    },
  };
}

export async function GET() {
  const context = await requireApiMember();
  if (!context.ok) return context.response;
  const loaded = await loadPayload(
    context.user.id,
    context.user.email?.trim().toLowerCase() || null,
  );
  if (!loaded.ok) {
    return noStore({ error: 'Unable to load account settings.' }, { status: 503 });
  }
  return noStore(loaded.payload);
}

export async function PATCH(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const context = await requireApiMember();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    return noStore({ error: 'Invalid settings request.' }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();

  if (isPlainObject(body.profile)) {
    const username = text(body.profile.username, 24);
    const displayName = text(body.profile.displayName, 120);
    if (!username || !displayName) {
      return noStore(
        { error: 'Enter both a display name and username.' },
        { status: 400 },
      );
    }

    const { data: current, error: currentError } = await sb
      .from('dp_resource_profiles')
      .select('username')
      .eq('id', context.user.id)
      .maybeSingle<{ username: string | null }>();
    if (currentError) {
      return noStore({ error: 'Unable to verify your profile.' }, { status: 503 });
    }

    if ((current?.username || '').trim().toLowerCase() !== username.toLowerCase()) {
      const { data: status, error: statusError } = await sb.rpc(
        'dp_resource_username_availability_status',
        { p_username: username },
      );
      if (statusError) {
        return noStore({ error: 'Unable to verify that username.' }, { status: 503 });
      }
      if (status === 'invalid') {
        return noStore(
          { error: 'Use 3–24 letters, numbers, or underscores for the username.' },
          { status: 400 },
        );
      }
      if (status !== 'available') {
        return noStore({ error: 'That username is already taken.' }, { status: 409 });
      }
    }

    const { error } = await sb
      .from('dp_resource_profiles')
      .update({ username, full_name: displayName })
      .eq('id', context.user.id);
    if (error) {
      const message =
        error.code === '23505'
          ? 'That username is already taken.'
          : error.code === '23514'
            ? 'Choose a valid display name and username.'
            : 'Unable to update your profile.';
      return noStore({ error: message }, { status: error.code === '23505' ? 409 : 400 });
    }
  }

  if (isPlainObject(body.academic)) {
    const subjects = normalizeAcademicSubjects(body.academic.subjects);
    const requestedSubjects = Array.isArray(body.academic.subjects)
      ? body.academic.subjects.length
      : 0;
    if (requestedSubjects !== subjects.length) {
      return noStore({ error: 'One or more selected subjects are invalid.' }, { status: 400 });
    }

    let canonicalSubjects = subjects;
    if (subjects.length) {
      const slugs = subjects.map((subject) => subject.slug);
      const { data: catalogue, error: catalogueError } = await sb
        .from('dp_qb_subjects')
        .select('slug,name')
        .in('slug', slugs);
      if (catalogueError) {
        return noStore({ error: 'Unable to verify your subjects.' }, { status: 503 });
      }
      const bySlug = new Map(
        (catalogue || []).map((subject) => [String(subject.slug), String(subject.name)]),
      );
      if (slugs.some((slug) => !bySlug.has(slug))) {
        return noStore({ error: 'Choose subjects available in DP Resources.' }, { status: 400 });
      }
      canonicalSubjects = subjects.map((subject) => ({
        ...subject,
        name: bySlug.get(subject.slug) || subject.name,
      }));
    }

    const rawYear = body.academic.examYear;
    const examYear = normalizeExamYear(rawYear);
    if (rawYear !== null && rawYear !== '' && typeof rawYear !== 'undefined' && examYear === null) {
      return noStore({ error: 'Choose a valid exam year.' }, { status: 400 });
    }
    const rawSession = body.academic.examSession;
    const examSession = normalizeExamSession(rawSession);
    if (
      rawSession !== null &&
      rawSession !== '' &&
      typeof rawSession !== 'undefined' &&
      examSession === null
    ) {
      return noStore({ error: 'Choose May or November for the exam session.' }, { status: 400 });
    }

    const { error } = await sb
      .from('dp_resource_profiles')
      .update({
        academic_subjects: canonicalSubjects,
        exam_year: examYear,
        exam_session: examSession,
      })
      .eq('id', context.user.id);
    if (error) {
      return noStore({ error: 'Unable to update your academic profile.' }, { status: 503 });
    }
  }

  if (isPlainObject(body.preferences)) {
    const row = preferencesToRow(body.preferences);
    const { error } = await sb.from('dp_resource_user_settings').upsert({
      id: context.user.id,
      ...row,
    });
    if (error) {
      return noStore({ error: 'Unable to update your preferences.' }, { status: 503 });
    }
  }

  const loaded = await loadPayload(
    context.user.id,
    context.user.email?.trim().toLowerCase() || null,
  );
  if (!loaded.ok) {
    return noStore({ error: 'Your changes were saved, but the page could not refresh.' }, { status: 503 });
  }
  return noStore({ ok: true, ...loaded.payload });
}
