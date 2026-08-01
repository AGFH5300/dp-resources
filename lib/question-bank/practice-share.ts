import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';

import {
  parsePracticeConfiguration,
  type PracticeConfiguration,
} from './practice-configuration';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PracticeSharePreset =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'saved'
  | 'all';

export type PracticeShare = {
  id: string;
  code: string;
  name: string;
  creatorUsername: string;
  creatorDisplayName: string | null;
  creatorLabel: string;
  configuration: PracticeConfiguration;
  hasExactQueue: boolean;
  exactQuestionCount: number;
  createdAt: string;
};

function requireData<T>(
  data: T | null,
  error: { message: string } | null,
  label: string,
) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

export function normalizePracticeShareCode(value: string) {
  const compact = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (compact.length !== 8) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function applyPracticeSharePreset(
  configuration: PracticeConfiguration,
  preset: string | undefined,
): PracticeConfiguration {
  const normalized = String(preset || '') as PracticeSharePreset;
  if (!['not_started', 'in_progress', 'completed', 'saved', 'all'].includes(normalized))
    return configuration;

  const statuses =
    normalized === 'all' || normalized === 'saved'
      ? (['not_started', 'in_progress', 'completed'] as const)
      : ([normalized] as const);
  const saved = normalized === 'saved' ? true : null;

  return {
    ...configuration,
    filters: {
      ...configuration.filters,
      statuses: [...statuses],
      saved,
    },
    blocks: configuration.blocks.map((block) => ({
      ...block,
      filters: {
        ...block.filters,
        statuses: [...statuses],
        saved,
      },
    })),
  };
}

export async function getPracticeShare(codeValue: string) {
  const code = normalizePracticeShareCode(codeValue);
  if (!code) return null;

  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from('dp_qb_practice_shares')
    .select(
      'id,code,name,creator_username,creator_display_name,configuration_snapshot,has_exact_queue,exact_question_count,created_at',
    )
    .eq('code', code)
    .maybeSingle();
  const row = requireData(data, error, 'Practice share');
  if (!row) return null;

  const configuration = parsePracticeConfiguration(row.configuration_snapshot);
  const displayName = String(row.creator_display_name || '').trim() || null;
  const username = String(row.creator_username || '').trim();

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    creatorUsername: username,
    creatorDisplayName: displayName,
    creatorLabel: displayName || `@${username}`,
    configuration,
    hasExactQueue: Boolean(row.has_exact_queue),
    exactQuestionCount: Number(row.exact_question_count || 0),
    createdAt: row.created_at,
  } satisfies PracticeShare;
}

export async function createPracticeShare({
  userId,
  name,
  configuration,
  sessionId,
}: {
  userId: string;
  name: string;
  configuration: PracticeConfiguration;
  sessionId?: string | null;
}) {
  if (sessionId && !UUID.test(sessionId))
    throw new Error('Practice session ID is invalid.');

  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc('dp_qb_create_practice_share', {
    p_user_id: userId,
    p_name: name,
    p_configuration: configuration,
    p_session_id: sessionId || null,
  });
  const rows = requireData(data, error, 'Create practice share') || [];
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.share_code) throw new Error('The share code could not be created.');

  return {
    code: String(row.share_code),
    hasExactQueue: Boolean(row.has_exact_queue),
    exactQuestionCount: Number(row.exact_question_count || 0),
  };
}

export async function cloneExactPracticeShare(userId: string, codeValue: string) {
  const code = normalizePracticeShareCode(codeValue);
  if (!code) throw new Error('Practice-set code is invalid.');

  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc(
    'dp_qb_clone_practice_share_exact_queue',
    {
      p_user_id: userId,
      p_code: code,
    },
  );
  const sessionId = requireData(data, error, 'Copy exact shared queue');
  if (typeof sessionId !== 'string' || !UUID.test(sessionId))
    throw new Error('The shared question queue could not be copied.');
  return sessionId;
}
