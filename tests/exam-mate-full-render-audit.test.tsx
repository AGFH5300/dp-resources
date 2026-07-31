import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content';
import type { QuestionAsset } from '@/lib/question-bank/types';

const enabled = process.env.EXAM_MATE_FULL_RENDER_AUDIT === '1';
const fullAudit = enabled ? it : it.skip;
const IMAGE_REFERENCE =
  /!\[[^\]]*\]\((?:question|markscheme|examiner_report|content_reference):([0-9a-f-]{36})\)/gi;
const FORBIDDEN_VISIBLE_MARKUP = [
  /\bquestion:[0-9a-f-]{36}\b/i,
  /\bmarkscheme:[0-9a-f-]{36}\b/i,
  /\bexaminer_report:[0-9a-f-]{36}\b/i,
  /\bcontent_reference:[0-9a-f-]{36}\b/i,
  /!\[[^\]]*\]\(/,
  /:::(?:center|tableoptions|box)?/i,
  /::indent\b/i,
  /:(?:marks|answer|audio|br)\b/i,
  /\[object Object\]/i,
  /\bundefined\b/i,
  /\uFFFD/,
  /<(?:script|style|iframe|object|embed)\b/i,
];

type VariantRow = {
  id: string;
  question_id: string;
  render_status: string;
  render_issue_codes: string[] | null;
};

type QuestionRow = {
  id: string;
  content: string;
  mark_scheme: string;
};

type VariantAssetRow = {
  variant_id: string;
  asset_id: string;
  source_file_id: string | null;
  role: QuestionAsset['role'];
  sort_order: number;
  alt_text: string | null;
};

type AssetRow = {
  id: string;
  content_type: string | null;
  byte_size: number;
  verification_status: string;
};

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the full render audit.`);
  return value;
}

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function fetchPaged<T>(
  client: any,
  table: string,
  columns: string,
  filter?: (query: any) => any,
) {
  const output: T[] = [];
  for (let start = 0; ; start += 1000) {
    let query: any = client
      .from(table)
      .select(columns)
      .range(start, start + 999);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table} render-audit read failed: ${error.message}`);
    const rows = (data || []) as T[];
    output.push(...rows);
    if (rows.length < 1000) break;
  }
  return output;
}

async function fetchByIds<T>(
  client: any,
  table: string,
  columns: string,
  column: string,
  values: string[],
) {
  const output: T[] = [];
  for (let index = 0; index < values.length; index += 200) {
    const chunk = values.slice(index, index + 200);
    const { data, error } = await client
      .from(table)
      .select(columns)
      .in(column, chunk);
    if (error) throw new Error(`${table} render-audit read failed: ${error.message}`);
    output.push(...((data || []) as T[]));
  }
  return output;
}

function visibleText(html: string) {
  return html
    .replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#xA0;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#x27;|&#39;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function auditRenderedSection(
  source: string,
  html: string,
  expectedSourceIds: Set<string>,
) {
  const codes: string[] = [];
  if (html.includes('dp-qb-image-unavailable'))
    codes.push('unavailable_image');
  if (html.includes('dp-qb-empty-content')) codes.push('empty_content');
  if (html.includes('dp-qb-malformed') || html.includes('katex-error'))
    codes.push('malformed_content');

  const references = [...source.matchAll(IMAGE_REFERENCE)].map((match) =>
    String(match[1]).toLowerCase(),
  );
  if (references.some((sourceId) => !expectedSourceIds.has(sourceId)))
    codes.push('unlinked_image_reference');
  const renderedImages = (html.match(/<img\b/gi) || []).length;
  if (renderedImages !== references.length)
    codes.push('rendered_image_count_mismatch');

  const visible = visibleText(html);
  if (FORBIDDEN_VISIBLE_MARKUP.some((pattern) => pattern.test(visible)))
    codes.push('visible_source_markup');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(visible))
    codes.push('visible_control_character');
  return [...new Set(codes)].sort();
}

fullAudit(
  'renders every Exam-Mate question and markscheme without leaks or missing assets',
  async () => {
    const client = createClient(
      requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
      requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            'X-Client-Info': 'dp-resources-exam-mate-full-render-audit',
          },
        },
      },
    );
    const variantSources = await fetchPaged<{
      source_question_id: string;
      variant_id: string;
    }>(
      client,
      'dp_qb_variant_sources',
      'source_question_id,variant_id',
      (query) => query.eq('provider', 'exam_mate'),
    );
    const variantIds = [...new Set(variantSources.map((row) => row.variant_id))].sort();
    const variants = await fetchByIds<VariantRow>(
      client,
      'dp_qb_question_variants',
      'id,question_id,render_status,render_issue_codes',
      'id',
      variantIds,
    );
    const questionIds = [...new Set(variants.map((row) => row.question_id))].sort();
    const [questions, variantAssets] = await Promise.all([
      fetchByIds<QuestionRow>(
        client,
        'dp_qb_questions',
        'id,content,mark_scheme',
        'id',
        questionIds,
      ),
      fetchByIds<VariantAssetRow>(
        client,
        'dp_qb_variant_assets',
        'variant_id,asset_id,source_file_id,role,sort_order,alt_text',
        'variant_id',
        variantIds,
      ),
    ]);
    const assetIds = [...new Set(variantAssets.map((row) => row.asset_id))].sort();
    const assets = await fetchByIds<AssetRow>(
      client,
      'dp_qb_assets',
      'id,content_type,byte_size,verification_status',
      'id',
      assetIds,
    );

    const variantById = new Map(variants.map((row) => [row.id, row]));
    const questionById = new Map(questions.map((row) => [row.id, row]));
    const assetById = new Map(assets.map((row) => [row.id, row]));
    const variantAssetsById = new Map<string, VariantAssetRow[]>();
    for (const row of variantAssets) {
      const rows = variantAssetsById.get(row.variant_id) || [];
      rows.push(row);
      variantAssetsById.set(row.variant_id, rows);
    }

    const failures: Array<{ variantIdHash: string; codes: string[] }> = [];
    let renderedQuestions = 0;
    let renderedMarkschemes = 0;
    let renderedImages = 0;
    for (const variantId of variantIds) {
      const variant = variantById.get(variantId);
      const question = variant && questionById.get(variant.question_id);
      const linkedRows = variantAssetsById.get(variantId) || [];
      const codes: string[] = [];
      if (!variant || !question) {
        codes.push('missing_variant_or_question');
      } else {
        if (
          variant.render_status !== 'ready' ||
          (variant.render_issue_codes || []).length
        ) {
          codes.push('variant_not_ready');
        }
        const renderAssets: QuestionAsset[] = linkedRows.flatMap((row) => {
          const asset = assetById.get(row.asset_id);
          if (
            !asset ||
            asset.verification_status !== 'verified' ||
            !row.source_file_id
          ) {
            codes.push('invalid_linked_asset');
            return [];
          }
          return [
            {
              id: asset.id,
              sourceFileId: row.source_file_id,
              sourceFileIds: [row.source_file_id],
              role: row.role,
              originalRole: row.role,
              sortOrder: Number(row.sort_order),
              altText: row.alt_text || 'Question Bank image',
              contentType: asset.content_type,
              byteSize: Number(asset.byte_size),
              audio: null,
            },
          ];
        });
        const sourceIds = new Set(
          linkedRows
            .map((row) => String(row.source_file_id || '').toLowerCase())
            .filter(Boolean),
        );
        const questionHtml = renderToStaticMarkup(
          <QuestionContent
            source={question.content}
            assets={renderAssets}
            kind="question"
          />,
        );
        const markschemeHtml = renderToStaticMarkup(
          <QuestionContent
            source={question.mark_scheme}
            assets={renderAssets}
            kind="markscheme"
          />,
        );
        codes.push(
          ...auditRenderedSection(question.content, questionHtml, sourceIds),
          ...auditRenderedSection(
            question.mark_scheme,
            markschemeHtml,
            sourceIds,
          ),
        );
        renderedQuestions += 1;
        renderedMarkschemes += 1;
        renderedImages +=
          (questionHtml.match(/<img\b/gi) || []).length +
          (markschemeHtml.match(/<img\b/gi) || []).length;
      }
      if (codes.length) {
        failures.push({
          variantIdHash: hash(variantId),
          codes: [...new Set(codes)].sort(),
        });
      }
    }

    const report = {
      verificationStatus: failures.length ? 'failed' : 'passed',
      sourceQuestions: variantSources.length,
      uniqueVariants: variantIds.length,
      questionCores: questionIds.length,
      linkedAssetOccurrences: variantAssets.length,
      distinctLinkedAssets: assetIds.length,
      renderedQuestions,
      renderedMarkschemes,
      renderedImages,
      failedVariants: failures.length,
      failures: failures.slice(0, 20),
    };
    const reportPath = process.env.EXAM_MATE_RENDER_AUDIT_REPORT?.trim();
    if (reportPath) {
      const target = path.resolve(reportPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    expect(report.sourceQuestions).toBe(14_128);
    expect(report.uniqueVariants).toBe(14_128);
    expect(report.distinctLinkedAssets).toBe(31_231);
    expect(failures, JSON.stringify(report)).toEqual([]);
  },
  60 * 60 * 1000,
);
