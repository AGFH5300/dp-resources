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
      output.push(row);
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

function normalizeProductionSource(value: string) {
  return normalizeImportedTableRows(value)
    .replace(/<\s*no\s*link\s*>/gi, '')
    .replace(/::answer\[/gi, ':answer[')
    .replace(/^::tableoptions(?:\{[^}]*\})?\s*$/gim, ':::tableoptions')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    <RoutedQuestionContent
      source={normalizeProductionSource(source)}
      assets={assets}
      kind={kind}
    />
  );
}
