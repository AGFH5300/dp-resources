import React from 'react';

import { QuestionContent as BaseQuestionContent } from './question-content';
import type { QuestionAsset } from '@/lib/question-bank/types';

type RendererProps = {
  source: string;
  assets?: QuestionAsset[];
  kind?: 'question' | 'markscheme';
};

type AudioContextMode = 'secondary' | 'final';

const AUDIO_CONTEXT_MARKER =
  /^\[\[DP_AUDIO_CONTEXT:(secondary|final):([0-9a-f,-]*):audio\{\]\]\s*/i;
const AUDIO_DIRECTIVE_SOURCE_ID =
  /:audio\{\s*#?([0-9a-f-]{36})(?:\s+aid=(?:"([^"]+)"|'([^']+)'|([^\s}]+)))?[^}]*\}/gi;

function isAudioAsset(asset: QuestionAsset) {
  return (
    asset.originalRole === 'audio' ||
    String(asset.contentType || '').toLowerCase().startsWith('audio/')
  );
}

function audioAssetSourceIds(asset: QuestionAsset) {
  return [asset.sourceFileId, asset.audio?.sourceAudioId]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
}

function audioDirectiveSourceIds(source: string) {
  return new Set(
    Array.from(source.matchAll(AUDIO_DIRECTIVE_SOURCE_ID))
      .map((match) => String(match[2] || match[3] || match[4] || match[1] || ''))
      .filter(Boolean)
      .map((value) => value.toLowerCase()),
  );
}

function routedAssets(
  mode: AudioContextMode,
  source: string,
  globalSourceIds: Set<string>,
  assets: QuestionAsset[],
) {
  const localSourceIds = audioDirectiveSourceIds(source);
  return assets.filter((asset) => {
    if (!isAudioAsset(asset)) return true;
    const sourceIds = audioAssetSourceIds(asset);
    const isLocallyReferenced = sourceIds.some((sourceId) =>
      localSourceIds.has(sourceId),
    );
    if (mode === 'secondary') return isLocallyReferenced;

    const isReferencedAnywhere = sourceIds.some((sourceId) =>
      globalSourceIds.has(sourceId),
    );
    return isLocallyReferenced || !isReferencedAnywhere;
  });
}

/**
 * The practice workspace renders imported composite questions as several
 * QuestionContent instances. Private parser markers let this wrapper route
 * each audio asset to exactly one segment without changing the public renderer:
 * direct audio stays at its directive, while unattached fallback audio appears
 * once after every visible question section.
 */
export function QuestionContent({
  source,
  assets = [],
  kind = 'question',
}: RendererProps) {
  const marker = source.match(AUDIO_CONTEXT_MARKER);
  if (!marker)
    return <BaseQuestionContent source={source} assets={assets} kind={kind} />;

  const mode = marker[1].toLowerCase() as AudioContextMode;
  const globalSourceIds = new Set(
    String(marker[2] || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const cleanSource = source.replace(AUDIO_CONTEXT_MARKER, '');
  const selectedAssets = routedAssets(mode, cleanSource, globalSourceIds, assets);

  if (!cleanSource.trim()) {
    const fallbackAudio = selectedAssets.filter(isAudioAsset);
    if (!fallbackAudio.length) return null;
    return (
      <BaseQuestionContent source="" assets={fallbackAudio} kind={kind} />
    );
  }

  return (
    <BaseQuestionContent
      source={cleanSource}
      assets={selectedAssets}
      kind={kind}
    />
  );
}
