import { requireApiMember } from '@/lib/auth';
import { parsePracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import {
  previewPracticeConfiguration,
  type PracticePreviewGroupRequest,
} from '@/lib/question-bank/practice-engine';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function parsePreviewGroups(
  value: unknown,
  validBlockKeys: Set<string>,
): PracticePreviewGroupRequest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > validBlockKeys.size)
    throw new Error('Preview groups must match the selected practice blocks.');

  const groupKeys = new Set<string>();
  const groupedBlockKeys = new Set<string>();
  return value.map((rawGroup, index) => {
    if (!isPlainObject(rawGroup))
      throw new Error(`Preview group ${index + 1} must be an object.`);
    const key = rawGroup.key;
    if (typeof key !== 'string' || !key || key.length > 100 || groupKeys.has(key))
      throw new Error(`Preview group ${index + 1} has an invalid key.`);
    if (!Array.isArray(rawGroup.blockKeys) || !rawGroup.blockKeys.length)
      throw new Error(`Preview group ${index + 1} must contain practice blocks.`);

    const blockKeys = rawGroup.blockKeys.map((blockKey) => {
      if (
        typeof blockKey !== 'string' ||
        !validBlockKeys.has(blockKey) ||
        groupedBlockKeys.has(blockKey)
      )
        throw new Error(`Preview group ${index + 1} contains an invalid block.`);
      groupedBlockKeys.add(blockKey);
      return blockKey;
    });
    groupKeys.add(key);
    return { key, blockKeys };
  });
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  // Read the POST stream immediately. The builder can replace stale previews
  // rapidly, and leaving the body unread while authentication performs network
  // work allows Node/Next to observe a cancelled, disturbed stream.
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body))
    return noStore({ error: 'Expected a JSON request body.' }, { status: 400 });

  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  let configuration;
  let previewGroups: PracticePreviewGroupRequest[];
  try {
    configuration = parsePracticeConfiguration(body.configuration);
    previewGroups = parsePreviewGroups(
      body.previewGroups,
      new Set(configuration.blocks.map((block) => block.key)),
    );
  } catch (error) {
    return noStore(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid practice configuration.',
      },
      { status: 400 },
    );
  }

  try {
    const preview = await previewPracticeConfiguration(
      user.id,
      configuration,
      previewGroups,
    );
    return noStore({ preview });
  } catch (error) {
    console.error('Unable to preview Question Bank practice configuration.', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore(
      { error: 'Unable to preview this practice set.' },
      { status: 500 },
    );
  }
}
