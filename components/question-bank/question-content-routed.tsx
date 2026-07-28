import React, { type ReactNode } from 'react';

import { QuestionContent as BaseQuestionContent } from './question-content';
import type { QuestionAsset } from '@/lib/question-bank/types';

type RendererProps = {
  source: string;
  assets?: QuestionAsset[];
  kind?: 'question' | 'markscheme';
};

type AudioContextMode = 'secondary' | 'final';

type CuratedImageFallback = {
  src: string;
  caption: string;
};

const AUDIO_CONTEXT_MARKER =
  /^\[\[DP_AUDIO_CONTEXT:(secondary|final):([\s\S]*?):audio\{\]\]\s*/i;
const QUESTION_IMAGE = /!\[([^\]]*)\]\(question:([0-9a-f-]{36})\)/gi;

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const CURATED_IMAGE_FALLBACKS: Record<string, CuratedImageFallback> = {
  'd8591cfe-c657-4825-868b-73faf4717afe': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/Erikr-eng.png',
    caption: 'Viking sailing routes described in the Icelandic sagas (CC BY-SA).',
  },
  'd1b6e570-d496-4d18-be0d-334c2eb6f610': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/6/62/Displaced_Persons_and_Refugees_in_Germany_BU6635.jpg',
    caption: 'Polish displaced children receiving food in Hamburg, 18 May 1945 (public domain).',
  },
  '2dc1e4ff-51a6-483d-a2b0-a87717452ccd': {
    src: svgDataUri(
      '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240" viewBox="0 0 720 240"><rect width="720" height="240" fill="white"/><rect x="205" y="65" width="310" height="110" rx="14" fill="#f8fafc" stroke="#334155" stroke-width="4"/><text x="360" y="112" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#0f172a">EEZ resource storage</text><text x="360" y="148" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#475569">for example fish, gas or minerals</text><line x1="515" y1="120" x2="660" y2="120" stroke="#334155" stroke-width="5"/><polygon points="660,120 630,102 630,138" fill="#334155"/><text x="590" y="92" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#0f172a">activity flow</text></svg>',
    ),
    caption: 'System-diagram structure: one storage rectangle and one activity flow.',
  },
  '25599f25-fda4-4c8b-a984-af11e9f0b9e6': {
    src: svgDataUri(
      '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240" viewBox="0 0 720 240"><rect width="720" height="240" fill="white"/><rect x="75" y="65" width="300" height="110" rx="14" fill="#ecfeff" stroke="#0f766e" stroke-width="4"/><text x="225" y="112" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#134e4a">Fish stock</text><text x="225" y="148" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#0f766e">storage</text><line x1="375" y1="120" x2="600" y2="120" stroke="#0f766e" stroke-width="5"/><polygon points="600,120 570,102 570,138" fill="#0f766e"/><text x="488" y="92" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#134e4a">fishing flow</text></svg>',
    ),
    caption: 'Sample system diagram showing fish stock as storage and fishing as a flow.',
  },
};

function normalizeRendererSource(value: string) {
  return String(value || '')
    .replace(
      /:box\[\s*(!\[[^\]]*\]\(question:[0-9a-f-]{36}\))\s*\](?:\{[^}]*\})?/gi,
      '$1',
    )
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

function renderWithCuratedFallbacks(
  source: string,
  assets: QuestionAsset[],
  kind: 'question' | 'markscheme',
) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let matched = false;

  for (const match of source.matchAll(QUESTION_IMAGE)) {
    const sourceFileId = String(match[2] || '').toLowerCase();
    const fallback = CURATED_IMAGE_FALLBACKS[sourceFileId];
    if (!fallback || match.index === undefined) continue;
    matched = true;
    const before = source.slice(cursor, match.index).trim();
    if (before)
      nodes.push(
        <BaseQuestionContent
          key={`content-${cursor}`}
          source={before}
          assets={assets}
          kind={kind}
        />,
      );
    nodes.push(
      <figure key={`fallback-${sourceFileId}-${match.index}`} className="dp-qb-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallback.src}
          alt={match[1] || fallback.caption}
          loading="lazy"
          decoding="async"
        />
        <figcaption>{fallback.caption}</figcaption>
      </figure>,
    );
    cursor = match.index + match[0].length;
  }

  if (!matched)
    return <BaseQuestionContent source={source} assets={assets} kind={kind} />;

  const after = source.slice(cursor).trim();
  if (after)
    nodes.push(
      <BaseQuestionContent
        key={`content-${cursor}`}
        source={after}
        assets={assets}
        kind={kind}
      />,
    );
  return <>{nodes}</>;
}

export function QuestionContent({
  source,
  assets = [],
  kind = 'question',
}: RendererProps) {
  const marker = source.match(AUDIO_CONTEXT_MARKER);
  if (!marker)
    return renderWithCuratedFallbacks(
      normalizeRendererSource(source),
      expandImageAliases(assets),
      kind,
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

  return renderWithCuratedFallbacks(
    cleanSource,
    expandImageAliases(selectedAssets),
    kind,
  );
}
