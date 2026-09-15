import React from 'react';

import { QuestionContent as RoutedQuestionContent } from './question-content-routed';
import type { QuestionAsset } from '@/lib/question-bank/types';

type RendererProps = {
  source: string;
  assets?: QuestionAsset[];
  kind?: 'question' | 'markscheme';
};

const TABLE_OPTIONS =
  /^\s*(?:[-*]\s+)?(:{1,3}tableoptions(?:\{[^}]*\})?)\s*$/i;
const TEXTUAL_SOURCE_NOTE =
  /\$\\(?:footnotesize|scriptsize|tiny|small)\s*\{\s*\\(?:textrm|text)\s*\{([\s\S]*?)\}\s*\}\$/g;
const IMAGE_ROLES: QuestionAsset['role'][] = [
  'question',
  'markscheme',
  'examiner_report',
  'content_reference',
];

function normalizeTableDividerRow(row: string) {
  const cells = row
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
  if (!cells.length || !cells.every((cell) => /^:?-+:?$/.test(cell))) return row;
  const normalized = cells.map((cell) => {
    const leftAligned = cell.startsWith(':');
    const rightAligned = cell.endsWith(':');
    return `${leftAligned ? ':' : ''}---${rightAligned ? ':' : ''}`;
  });
  return `|${normalized.join('|')}|`;
}

function normalizeImportedTableRows(value: string) {
  const lines = String(value || '').split('\n');
  const output: string[] = [];
  let inTable = false;
  let sawRow = false;

  for (const originalLine of lines) {
    const trimmed = originalLine.trim();
    const tableOptions = trimmed.match(TABLE_OPTIONS);
    if (tableOptions) {
      const attributes = tableOptions[1].match(/\{[^}]*\}/)?.[0] || '';
      output.push(`:::tableoptions${attributes}`);
      inTable = true;
      sawRow = false;
      continue;
    }

    if (inTable && trimmed === ':::') {
      output.push(originalLine);
      inTable = false;
      sawRow = false;
      continue;
    }

    if (inTable && trimmed.includes('|')) {
      let row = trimmed.replace(/^[-*]\s+(?=\|)/, '').trim();
      if (!row.startsWith('|')) row = `|${row}`;
      if (!row.endsWith('|')) row = `${row}|`;
      output.push(normalizeTableDividerRow(row));
      sawRow = true;
      continue;
    }

    if (inTable && sawRow && trimmed) {
      inTable = false;
      sawRow = false;
    }

    output.push(originalLine);
  }

  return output.join('\n');
}

function decodeTextualSourceNote(value: string) {
  return value
    .replace(/\\textunderscore\s*/g, '_')
    .replace(/\\textasciitilde\s*/g, '~')
    .replace(/\\([#$%&_{}])/g, '$1')
    .replace(/\\(?:,|;|:|!)/g, ' ')
    .replace(/https?:\/\/\s+/g, (prefix) => prefix.replace(/\s+/g, ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeTextualSourceNotes(value: string) {
  return String(value || '').replace(
    TEXTUAL_SOURCE_NOTE,
    (_match, note: string) => decodeTextualSourceNote(note),
  );
}

function isEscaped(value: string, index: number) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1)
    slashes += 1;
  return slashes % 2 === 1;
}

function unwrapLatexAnswerMacros(value: string) {
  const source = String(value || '');
  const answer = /\\answer\s*\{/gi;
  let output = '';
  let cursor = 0;

  while (cursor < source.length) {
    answer.lastIndex = cursor;
    const match = answer.exec(source);
    if (!match || match.index === undefined) {
      output += source.slice(cursor);
      break;
    }

    output += source.slice(cursor, match.index);
    const opening = match.index + match[0].lastIndexOf('{');
    let depth = 0;
    let closing = -1;

    for (let index = opening; index < source.length; index += 1) {
      if (source[index] === '{' && !isEscaped(source, index)) depth += 1;
      else if (source[index] === '}' && !isEscaped(source, index)) {
        depth -= 1;
        if (depth === 0) {
          closing = index;
          break;
        }
      }
    }

    if (closing < 0) {
      // Do not destroy malformed source; the downstream renderer can still show it.
      output += source.slice(match.index);
      break;
    }

    // \answer{...} is only presentational source syntax. Keep all nested LaTeX
    // intact and remove the unsupported wrapper before KaTeX sees the formula.
    output += source.slice(opening + 1, closing);
    cursor = closing + 1;
  }

  return output;
}

function normalizeProductionSource(value: string) {
  return normalizeImportedTableRows(
    normalizeTextualSourceNotes(unwrapLatexAnswerMacros(value)),
  )
    .replace(/<\s*no\s*link\s*>/gi, '')
    .replace(/::answer\[/gi, ':answer[')
    .replace(/^::tableoptions(?:\{[^}]*\})?\s*$/gim, ':::tableoptions')
    .replace(
      /\((?:markscheme|examiner_report|content_reference):([0-9a-f-]{36})\)/gi,
      '(question:$1)',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isAudioAsset(asset: QuestionAsset) {
  return (
    asset.originalRole === 'audio' ||
    String(asset.contentType || '').toLowerCase().startsWith('audio/')
  );
}

function expandImageRoleAliases(assets: QuestionAsset[]) {
  return assets.flatMap((asset) => {
    if (isAudioAsset(asset)) return [asset];
    const sourceFileIds = [
      ...new Set(
        [asset.sourceFileId, ...(asset.sourceFileIds || [])].filter(
          (sourceFileId): sourceFileId is string => Boolean(sourceFileId),
        ),
      ),
    ];
    if (!sourceFileIds.length) return [asset];
    return sourceFileIds.flatMap((sourceFileId) =>
      IMAGE_ROLES.map((role) => ({
        ...asset,
        sourceFileId,
        sourceFileIds: [sourceFileId],
        role,
      })),
    );
  });
}

/**
 * Final source compatibility layer for the complete Revision Village corpus.
 * It deliberately repairs only known imported syntax before delegating to the
 * authenticated media and rich-content renderer.
 */
export function QuestionContent({
  source,
  assets = [],
  kind = 'question',
}: RendererProps) {
  return (
    <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">
      <RoutedQuestionContent
        source={normalizeProductionSource(source)}
        assets={expandImageRoleAliases(assets)}
        kind={kind}
      />
    </div>
  );
}
