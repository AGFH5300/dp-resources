import React, { type ReactNode } from 'react';
import katex from 'katex';
import 'katex/contrib/mhchem';

import type { QuestionAsset } from '@/lib/question-bank/types';

type RendererProps = {
  source: string;
  assets?: QuestionAsset[];
  kind?: 'question' | 'markscheme';
};

function math(source: string, displayMode: boolean, key: string) {
  try {
    const html = katex.renderToString(source, {
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

function inline(source: string, keyPrefix = 'inline'): ReactNode[] {
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
    const directive = source.slice(index).match(/^:(marks|answer|span)\[/);
    if (directive) {
      const opening = index + directive[0].length - 1;
      const closing = closingBracket(source, opening);
      if (closing > opening) {
        flush();
        const content = source.slice(opening + 1, closing);
        const className =
          directive[1] === 'marks'
            ? 'dp-qb-marks'
            : directive[1] === 'answer'
              ? 'dp-qb-answer'
              : 'dp-qb-span';
        output.push(
          <span key={`${keyPrefix}-directive-${key++}`} className={className}>
            {inline(content, `${keyPrefix}-directive`)}
          </span>,
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
            {inline(source.slice(index + 2, closing), `${keyPrefix}-strong`)}
          </strong>,
        );
        index = closing + 2;
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
  const match = line.match(/^!\[([^\]]*)\]\(question:([0-9a-f-]{36})\)$/i);
  if (!match) return null;
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

function blocks(source: string, assets: QuestionAsset[]) {
  const assetsByFileId = new Map(
    assets
      .filter((asset) => asset.sourceFileId)
      .map((asset) => [asset.sourceFileId!.toLowerCase(), asset]),
  );
  const lines = String(source || '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n');
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
    let line = lines[index].trimEnd();
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.trim() === '::indent') {
      indentNext = true;
      index += 1;
      continue;
    }
    if (/^:::center\s*$/.test(line.trim())) {
      centered = true;
      index += 1;
      continue;
    }
    if (/^:::tableoptions/.test(line.trim())) {
      index += 1;
      continue;
    }
    if (line.trim() === ':::') {
      centered = false;
      index += 1;
      continue;
    }
    if (line.trim() === ':br') {
      output.push(<div key={`block-${block++}`} className="h-3" aria-hidden />);
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
              <li key={`item-${itemIndex}`}>{inline(item, `item-${itemIndex}`)}</li>
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
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        index += 1;
      }
      output.push(
        wrap(
          <div className="dp-qb-table-wrap">
            <table>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`cell-${cellIndex}`}>
                        {inline(cell, `cell-${rowIndex}-${cellIndex}`)}
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
      lines[index].trim() !== ':br'
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(
      wrap(
        <p>{inline(paragraph.join(' '), `paragraph-${block}`)}</p>,
        `block-${block++}`,
      ),
    );
    indentNext = false;
  }
  return output;
}

export function QuestionContent({
  source,
  assets = [],
  kind = 'question',
}: RendererProps) {
  if (!source.trim())
    return (
      <p className="dp-qb-empty-content" role="status">
        This source occurrence contains no {kind === 'question' ? 'question' : 'markscheme'} text.
      </p>
    );
  return (
    <div className={`dp-qb-content dp-qb-content-${kind}`}>
      {blocks(source, assets)}
    </div>
  );
}
