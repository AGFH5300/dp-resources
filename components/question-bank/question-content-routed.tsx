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
  /^\[\[DP_AUDIO_CONTEXT:(secondary|final):([\s\S]*?):audio\{\]\]\s*/i;

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
  const ids = new Set<string>();
  for (const match of source.matchAll(/:audio\{([^}]*)\}/gi)) {
    const body = match[1];
    const aid = body.match(
      /\baid=(?:"([^"]+)"|'([^']+)'|([^\s}]+))/i,
    );
    const sourceId = aid?.[1] || aid?.[2] || aid?.[3] || body.match(/#([^\s}]+)/)?.[1];
    if (sourceId) ids.add(sourceId.toLowerCase());
  }
  return ids;
}

function decodeMarkerSourceIds(value: string) {
  return new Set(
    value
      .split(',')
      .map((sourceId) => {
        const trimmed = sourceId.trim();
        if (!trimmed) return '';
        try {
          return decodeURIComponent(trimmed).toLowerCase();
        } catch {
          return trimmed.toLowerCase();
        }
      })
      .filter(Boolean),
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
  const globalSourceIds = decodeMarkerSourceIds(String(marker[2] || ''));
  const cleanSource = source.replace(AUDIO_CONTEXT_MARKER, '');
  const selectedAssets = routedAssets(mode, cleanSource, globalSourceIds, assets);

  if (!cleanSource.trim()) {
    const fallbackAudio = selectedAssets.filter(isAudioAsset);
    if (!fallbackAudio.length) return null;
    return <BaseQuestionContent source="" assets={fallbackAudio} kind={kind} />;
  }

  return (
    <BaseQuestionContent
      source={cleanSource}
      assets={selectedAssets}
      kind={kind}
    />
  );
}
