import React, { type ReactNode } from 'react';
import katex from 'katex';
import 'katex/contrib/mhchem';

import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';
import type { QuestionAsset } from '@/lib/question-bank/types';

type RendererProps = {
  source: string;
  assets?: QuestionAsset[];
  kind?: 'question' | 'markscheme';
};

const QUESTION_IMAGE = /^!\[([^\]]*)\]\(question:([0-9a-f-]{36})\)/i;
const AUDIO_DIRECTIVE_SOURCE =
  ':audio\\{\\s*#?([0-9a-f-]{36})(?:\\s+aid=(?:"([^"]+)"|\'([^\']+)\'|([^\\s}]+)))?[^}]*\\}';

type AudioDirectiveMatch = {
  raw: string;
  sourceId: string;
  index: number;
};

function audioDirectiveMatches(value: string): AudioDirectiveMatch[] {
  const pattern = new RegExp(AUDIO_DIRECTIVE_SOURCE, 'gi');
  return Array.from(value.matchAll(pattern)).map((match) => ({
    raw: match[0],
    sourceId: String(match[2] || match[3] || match[4] || match[1] || '').trim(),
    index: match.index || 0,
  }));
}

function math(source: string, displayMode: boolean, key: string) {
  try {
    const cleanSource = source
      .replace(/\\(?:ll|gg)\b/g, ' ')
      .replace(/[«»≪≫]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const html = katex.renderToString(cleanSource, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'htmlAndMathml',
    });
    return (
      <span
        key={key}
        className={displayMode ? 'dp-qb-math-block' : 'dp-qb-math-inline'}
        // KaTeX generates this HTML itself with trust disabled. Source HTML is
        // never passed through or interpreted by the renderer.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <code key={key} className="dp-qb-malformed">
        {source}
      </code>
    );
  }
}

function closingBracket(source: string, opening: number) {
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '[') depth += 1;
    if (source[index] === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function inlineQuestionImage(
  altText: string,
  sourceFileId: string,
  assetsByFileId: Map<string, QuestionAsset>,
  key: string,
) {
  const asset = assetsByFileId.get(sourceFileId.toLowerCase());
  if (!asset) {
    return (
      <span key={key} className="dp-qb-image-unavailable" role="status">
        Referenced image is unavailable in the authorized archive.
      </span>
    );
  }

  return (
    <span
      key={key}
      className="dp-qb-inline-figure inline-flex max-w-full items-center justify-center align-middle"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="max-h-72 max-w-full object-contain"
        src={`/api/question-bank/assets/${asset.id}`}
        alt={altText || asset.altText}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

function directiveNode(
  name: string,
  content: string,
  key: string,
  assetsByFileId: Map<string, QuestionAsset>,
): ReactNode {
  const children = inline(content, `${key}-content`, assetsByFileId);
  if (name === 'marks')
    return (
      <span key={key} className="dp-qb-marks">
        {children}
      </span>
    );
  if (name === 'answer')
    return (
      <span key={key} className="dp-qb-answer">
        {children}
      </span>
    );
  if (name === 'u') return <u key={key}>{children}</u>;
  if (name === 'b') return <strong key={key}>{children}</strong>;
  if (name === 'sup') return <sup key={key}>{children}</sup>;
  return (
    <span key={key} className="dp-qb-span">
      {children}
    </span>
  );
}

function inline(
  source: string,
  keyPrefix = 'inline',
  assetsByFileId = new Map<string, QuestionAsset>(),
): ReactNode[] {
  const output: ReactNode[] = [];
  let plain = '';
  let index = 0;
  let key = 0;
  const flush = () => {
    if (!plain) return;
    output.push(<span key={`${keyPrefix}-text-${key++}`}>{plain}</span>);
    plain = '';
  };

  while (index < source.length) {
    const image = source.slice(index).match(QUESTION_IMAGE);
    if (image) {
      flush();
      output.push(
        inlineQuestionImage(
          image[1],
          image[2],
          assetsByFileId,
          `${keyPrefix}-image-${key++}`,
        ),
      );
      index += image[0].length;
      continue;
    }

    const audio = audioDirectiveMatches(source.slice(index))[0];
    if (audio && source.slice(index).startsWith(audio.raw)) {
      // Audio is rendered as a block by blocks(). If an imported directive lands
      // inside a paragraph, suppress its opaque source identifier rather than
      // ever exposing it to users.
      flush();
      output.push(
        <span key={`${keyPrefix}-audio-${key++}`} className="sr-only">
          Listening audio
        </span>,
      );
      index += audio.raw.length;
      continue;
    }

    const directive = source.slice(index).match(/^:(marks|answer|span|u|b|sup)\[/i);
    if (directive) {
      const opening = index + directive[0].length - 1;
      const closing = closingBracket(source, opening);
      if (closing > opening) {
        flush();
        output.push(
          directiveNode(
            directive[1].toLowerCase(),
            source.slice(opening + 1, closing),
            `${keyPrefix}-directive-${key++}`,
            assetsByFileId,
          ),
        );
        index = closing + 1;
        continue;
      }
    }

    if (source.startsWith('**', index)) {
      const closing = source.indexOf('**', index + 2);
      if (closing > index + 2) {
        flush();
        output.push(
          <strong key={`${keyPrefix}-strong-${key++}`}>
            {inline(
              source.slice(index + 2, closing),
              `${keyPrefix}-strong`,
              assetsByFileId,
            )}
          </strong>,
        );
        index = closing + 2;
        continue;
      }
    }

    if (source[index] === '*' && source[index + 1] !== '*') {
      const closing = source.indexOf('*', index + 1);
      if (closing > index + 1) {
        flush();
        output.push(
          <em key={`${keyPrefix}-emphasis-${key++}`}>
            {inline(
              source.slice(index + 1, closing),
              `${keyPrefix}-emphasis`,
              assetsByFileId,
            )}
          </em>,
        );
        index = closing + 1;
        continue;
      }
    }

    if (source[index] === '$') {
      const double = source[index + 1] === '$';
      const marker = double ? '$$' : '$';
      const closing = source.indexOf(marker, index + marker.length);
      if (closing > index + marker.length) {
        flush();
        output.push(
          math(
            source.slice(index + marker.length, closing),
            double,
            `${keyPrefix}-math-${key++}`,
          ),
        );
        index = closing + marker.length;
        continue;
      }
    }

    if (source.startsWith('\\(', index)) {
      const closing = source.indexOf('\\)', index + 2);
      if (closing > index + 2) {
        flush();
        output.push(
          math(
            source.slice(index + 2, closing),
            false,
            `${keyPrefix}-math-${key++}`,
          ),
        );
        index = closing + 2;
        continue;
      }
    }

    if (source.startsWith('  ', index)) {
      plain += ' ';
      index += 2;
      continue;
    }
    plain += source[index];
    index += 1;
  }
  flush();
  return output;
}

function imageBlock(
  line: string,
  assetsByFileId: Map<string, QuestionAsset>,
  key: string,
) {
  const match = line.match(QUESTION_IMAGE);
  if (!match || match[0].length !== line.length) return null;
  const asset = assetsByFileId.get(match[2].toLowerCase());
  if (!asset)
    return (
      <p key={key} className="dp-qb-image-unavailable" role="status">
        Referenced image is unavailable in the authorized archive.
      </p>
    );
  return (
    <figure key={key} className="dp-qb-figure">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/question-bank/assets/${asset.id}`}
        alt={match[1] || asset.altText}
        loading="lazy"
        decoding="async"
      />
      {match[1] ? <figcaption>{match[1]}</figcaption> : null}
    </figure>
  );
}

function cleanTranscript(value: string) {
  return String(value || '')
    .replace(/^\s*:u\[Transcript\]\s*/i, '')
    .replace(/^\s*\$\\underline\{\\textrm\{Transcript\}\}\$\s*/i, '')
    .replace(/^\s*:{1,2}br\s*/i, '')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function durationLabel(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds)) return null;
  const rounded = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

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

function audioCard(asset: QuestionAsset, key: string, label?: string) {
  const transcript = cleanTranscript(asset.audio?.transcript || '');
  const duration = durationLabel(asset.audio?.durationSeconds);
  return (
    <section
      key={key}
      className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left"
      aria-label={label || asset.altText || 'Listening material'}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Listening material
          </p>
          <p className="text-sm font-medium text-slate-800">
            {label || asset.altText || 'Question audio'}
          </p>
        </div>
        {duration ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">
            {duration}
          </span>
        ) : null}
      </div>
      <audio
        className="w-full"
        controls
        preload="metadata"
        src={`/api/question-bank/assets/${asset.id}`}
        aria-label={label || asset.altText || 'Question audio'}
      >
        Your browser does not support audio playback.
      </audio>
      {transcript ? (
        <details className="mt-3 rounded-lg bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Read transcript
          </summary>
          <div className="mt-3 text-sm leading-6 text-slate-700">
            {blocks(transcript, [])}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function unavailableAudio(key: string) {
  return (
    <p key={key} className="dp-qb-image-unavailable" role="status">
      Listening audio is temporarily unavailable. Please report this question if the
      problem continues.
    </p>
  );
}

function blocks(source: string, assets: QuestionAsset[]) {
  const assetsByFileId = new Map(
    assets
      .filter((asset) => asset.sourceFileId)
      .map((asset) => [asset.sourceFileId!.toLowerCase(), asset]),
  );
  const audioBySourceId = new Map<string, QuestionAsset>();
  for (const asset of assets.filter(isAudioAsset))
    for (const sourceId of audioAssetSourceIds(asset)) audioBySourceId.set(sourceId, asset);

  const lines = normalizeQuestionSource(source).split('\n');
  const output: ReactNode[] = [];
  let index = 0;
  let block = 0;
  let indentNext = false;
  let centered = false;
  const wrap = (node: ReactNode, key: string) => (
    <div
      key={key}
      className={`${indentNext ? 'dp-qb-indent' : ''} ${centered ? 'dp-qb-center' : ''}`.trim()}
    >
      {node}
    </div>
  );

  while (index < lines.length) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.trim() === '::indent') {
      indentNext = true;
      index += 1;
      continue;
    }
    const alignment = line.trim().match(/^:::(center|left)\s*$/i);
    if (alignment) {
      centered = alignment[1].toLowerCase() === 'center';
      index += 1;
      continue;
    }
    if (/^:::tableoptions/i.test(line.trim())) {
      index += 1;
      continue;
    }
    if (line.trim() === ':::') {
      centered = false;
      index += 1;
      continue;
    }
    if (/^:{1,2}br\s*$/i.test(line.trim())) {
      output.push(<div key={`block-${block++}`} className="h-3" aria-hidden />);
      index += 1;
      continue;
    }
    if (line.trim() === '|||') {
      index += 1;
      continue;
    }

    const audioDirectives = audioDirectiveMatches(line);
    if (audioDirectives.length) {
      let cursor = 0;
      for (const [audioIndex, directive] of audioDirectives.entries()) {
        const before = line.slice(cursor, directive.index).trim();
        if (before)
          output.push(
            wrap(
              <p>{inline(before, `audio-before-${block}`, assetsByFileId)}</p>,
              `block-${block++}`,
            ),
          );
        const asset = audioBySourceId.get(directive.sourceId.toLowerCase());
        output.push(
          wrap(
            asset
              ? audioCard(asset, `audio-${block}-${audioIndex}`)
              : unavailableAudio(`audio-unavailable-${block}-${audioIndex}`),
            `block-${block++}`,
          ),
        );
        cursor = directive.index + directive.raw.length;
      }
      const after = line.slice(cursor).trim();
      if (after)
        output.push(
          wrap(
            <p>{inline(after, `audio-after-${block}`, assetsByFileId)}</p>,
            `block-${block++}`,
          ),
        );
      indentNext = false;
      index += 1;
      continue;
    }

    const image = imageBlock(line.trim(), assetsByFileId, `block-${block}`);
    if (image) {
      output.push(wrap(image, `block-${block++}`));
      indentNext = false;
      index += 1;
      continue;
    }

    if (line.trim().startsWith('$$')) {
      const collected = [line.trim().slice(2)];
      index += 1;
      while (index < lines.length && !lines[index].trimEnd().endsWith('$$'))
        collected.push(lines[index++]);
      if (index < lines.length) {
        collected.push(lines[index].trimEnd().slice(0, -2));
        index += 1;
      }
      output.push(
        wrap(
          math(collected.join('\n'), true, `math-block-${block}`),
          `block-${block++}`,
        ),
      );
      indentNext = false;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index];
        if (/^\s*[-*]\s+/.test(candidate)) {
          items.push(candidate.replace(/^\s*[-*]\s+/, ''));
          index += 1;
          continue;
        }
        if (!candidate.trim() && /^\s*[-*]\s+/.test(lines[index + 1] || '')) {
          index += 1;
          continue;
        }
        break;
      }
      output.push(
        wrap(
          <ul className="dp-qb-list">
            {items.map((item, itemIndex) => (
              <li key={`item-${itemIndex}`}>
                {inline(item, `item-${itemIndex}`, assetsByFileId)}
              </li>
            ))}
          </ul>,
          `block-${block++}`,
        ),
      );
      indentNext = false;
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        const cells = lines[index]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => cell.trim());
        if (
          cells.some(Boolean) &&
          !cells.every((cell) => !cell || /^:?-{2,}:?$/.test(cell))
        )
          rows.push(cells);
        index += 1;
      }
      if (rows.length)
        output.push(
          wrap(
            <div className="dp-qb-table-wrap">
              <table>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${cellIndex}`}>
                          {inline(
                            cell,
                            `cell-${rowIndex}-${cellIndex}`,
                            assetsByFileId,
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
            `block-${block++}`,
          ),
        );
      indentNext = false;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\|/.test(lines[index]) &&
      !/^::/.test(lines[index].trim()) &&
      !/^:{1,2}br\s*$/i.test(lines[index].trim()) &&
      !audioDirectiveMatches(lines[index]).length
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(
      wrap(
        <p>{inline(paragraph.join(' '), `paragraph-${block}`, assetsByFileId)}</p>,
        `block-${block++}`,
      ),
    );
    indentNext = false;
  }
  return output;
}

function fallbackAudioBlocks(source: string, assets: QuestionAsset[]) {
  const referenced = new Set(
    audioDirectiveMatches(source).map((directive) => directive.sourceId.toLowerCase()),
  );
  const fallback = assets.filter(
    (asset) =>
      isAudioAsset(asset) &&
      !audioAssetSourceIds(asset).some((sourceId) => referenced.has(sourceId)),
  );
  if (!fallback.length) return null;
  return (
    <div className="mt-5 grid gap-4" aria-label="Additional listening material">
      {fallback.map((asset, index) =>
        audioCard(
          asset,
          `fallback-audio-${asset.id}`,
          fallback.length > 1 ? `Listening audio ${index + 1}` : undefined,
        ),
      )}
    </div>
  );
}

export function QuestionContent({
  source,
  assets = [],
  kind = 'question',
}: RendererProps) {
  const normalizedSource = normalizeQuestionSource(source);
  const fallbackAudio = fallbackAudioBlocks(normalizedSource, assets);
  if (!normalizedSource && !fallbackAudio)
    return (
      <p className="dp-qb-empty-content" role="status">
        This source occurrence contains no {kind === 'question' ? 'question' : 'markscheme'} text.
      </p>
    );
  return (
    <div className={`dp-qb-content dp-qb-content-${kind}`}>
      {normalizedSource ? blocks(normalizedSource, assets) : null}
      {fallbackAudio}
    </div>
  );
}
