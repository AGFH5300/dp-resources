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

function normalizeRendererSource(value: string) {
  return String(value || '')
    .replace(/:box\[/gi, ':span[')
    .replace(/:sub\[/gi, ':span[')
    .replace(/^:tableoptions\{[^}]*\}\s*$/gim, '')
    .replace(/^:::centre\s*$/gim, ':::center')
    .replace(/^:::indent\s*$/gim, '::indent')
    .replace(/^:::(?:answer|box)\s*$/gim, ':::left')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isAudioAsset(asset: QuestionAsset) {
  return (
    asset.originalRole === 'audio' ||
    String(asset.contentType || '').toLowerCase().startsWith('audio/')
  );
}

function allAssetSourceIds(asset: QuestionAsset) {
  return [
    ...new Set(
      [asset.sourceFileId, ...(asset.sourceFileIds || [])].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];
}

function audioAssetSourceIds(asset: QuestionAsset) {
  return [...allAssetSourceIds(asset), asset.audio?.sourceAudioId]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
}

function expandImageAliases(assets: QuestionAsset[]) {
  return assets.flatMap((asset) => {
    if (isAudioAsset(asset)) return [asset];
    const sourceIds = allAssetSourceIds(asset);
    if (!sourceIds.length) return [asset];
    return sourceIds.map((sourceFileId) => ({ ...asset, sourceFileId }));
  });
}

function audioDirectiveSourceIds(source: string) {
  const ids = new Set<string>();
  for (const match of source.matchAll(/:audio\{([^}]*)\}/gi)) {
    const body = match[1];
    const aid = body.match(
      /\baid=(?:"([^"]+)"|'([^']+)'|([^\s}]+))/i,
    );
    const sourceId =
      aid?.[1] || aid?.[2] || aid?.[3] || body.match(/#([^\s}]+)/)?.[1];
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
 * QuestionContent instances. Private parser markers route each audio asset to
 * exactly one segment. Image aliases are expanded only at render time, while
 * remaining imported presentation directives are converted to safe equivalents.
 */
export function QuestionContent({
  source,
  assets = [],
  kind = 'question',
}: RendererProps) {
  const marker = source.match(AUDIO_CONTEXT_MARKER);
  if (!marker)
    return (
      <BaseQuestionContent
        source={normalizeRendererSource(source)}
        assets={expandImageAliases(assets)}
        kind={kind}
      />
    );

  const mode = marker[1].toLowerCase() as AudioContextMode;
  const globalSourceIds = decodeMarkerSourceIds(String(marker[2] || ''));
  const cleanSource = normalizeRendererSource(
    source.replace(AUDIO_CONTEXT_MARKER, ''),
  );
  const selectedAssets = routedAssets(mode, cleanSource, globalSourceIds, assets);

  if (!cleanSource.trim()) {
    const fallbackAudio = selectedAssets.filter(isAudioAsset);
    if (!fallbackAudio.length) return null;
    return <BaseQuestionContent source="" assets={fallbackAudio} kind={kind} />;
  }

  return (
    <BaseQuestionContent
      source={cleanSource}
      assets={expandImageAliases(selectedAssets)}
      kind={kind}
    />
  );
}
