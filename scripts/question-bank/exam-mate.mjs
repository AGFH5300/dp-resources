import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  mkdtemp,
  opendir,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { deterministicUuid } from './archive.mjs';

export const EXAM_MATE_IMPORTER_VERSION = 'exam-mate-1.0.0';
export const EXAM_MATE_AUDIT_ZIP_SHA256 =
  '0ba6835f8046af116c589a6545af7f02d472e059cdb8488d7eb4fcd4dd65fa4f';
export const EXAM_MATE_CHECKSUMS_SHA256 =
  'ac4699532e92f6dd40ae79a89bc03b4b2556d2ab3030c766ba84bed70224d361';

export const EXAM_MATE_EXPECTED = Object.freeze({
  sourceQuestions: 14_199,
  sourceOccurrences: 14_199,
  assetManifestRows: 32_198,
  uniquePhysicalAssets: 31_336,
  metadataPages: 589,
  discoveredJobs: 27,
  completedJobs: 11,
  emptyOrUnavailableJobs: 16,
  retiredQuestions: 754,
  importableQuestions: 13_374,
  quarantinedQuestions: 71,
  importableAssetUrls: 30_552,
  importablePhysicalAssets: 30_225,
});

const SUBJECTS = Object.freeze({
  Biology: { id: 'biology', slug: 'biology', name: 'Biology', order: 0 },
  Mathematics: { id: 'math', slug: 'mathematics', name: 'Mathematics', order: 1, legacyTrack: 'mathematics' },
  'Mathematical Studies': { id: 'math', slug: 'mathematics', name: 'Mathematics', order: 1, legacyTrack: 'mathematical-studies' },
  'Further Mathematics': { id: 'math', slug: 'mathematics', name: 'Mathematics', order: 1, legacyTrack: 'further-mathematics' },
  Physics: { id: 'physics', slug: 'physics', name: 'Physics', order: 2 },
  Chemistry: { id: 'chemistry', slug: 'chemistry', name: 'Chemistry', order: 3 },
  Psychology: { id: 'psychology', slug: 'psychology', name: 'Psychology', order: 5 },
  Economics: { id: 'economics', slug: 'economics', name: 'Economics', order: 6 },
  'Global Politics': { id: 'global-politics', slug: 'global-politics', name: 'Global Politics', order: 13 },
});

const RETIRED_SUBJECTS = new Set(['Philosophy', 'World Religions']);

export function isRetiredExamMateSubject(subject) {
  return RETIRED_SUBJECTS.has(subject);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function* readNdjson(filePath) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch (error) {
      throw new Error(
        `Invalid NDJSON at ${path.basename(filePath)}:${lineNumber}: ${error.message}`,
      );
    }
  }
}

async function readAllNdjson(filePath) {
  const rows = [];
  for await (const row of readNdjson(filePath)) rows.push(row);
  return rows;
}

async function archiveRootFromExtracted(directory) {
  if (await exists(path.join(directory, 'summary.json'))) return directory;
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(directory, entry.name);
    if (await exists(path.join(nested, 'summary.json'))) candidates.push(nested);
  }
  if (candidates.length !== 1) {
    throw new Error('Unable to identify the Exam-Mate archive root.');
  }
  return candidates[0];
}

export async function resolveExamMateArchive(inputPath, options = {}) {
  const resolved = path.resolve(inputPath);
  const inputStat = await stat(resolved);
  if (inputStat.isDirectory()) {
    return {
      root: await archiveRootFromExtracted(resolved),
      assetRoot: options.assetRoot ? path.resolve(options.assetRoot) : resolved,
      sourcePath: resolved,
      sourceSha256: null,
      cleanup: async () => {},
    };
  }
  if (!resolved.toLowerCase().endsWith('.zip')) {
    throw new Error('Exam-Mate input must be the reviewed ZIP or extracted directory.');
  }
  const digest = await hashFile(resolved);
  if (digest !== EXAM_MATE_AUDIT_ZIP_SHA256) {
    throw new Error(
      `Exam-Mate audit ZIP SHA-256 mismatch: expected ${EXAM_MATE_AUDIT_ZIP_SHA256}, received ${digest}.`,
    );
  }
  const destination = await mkdtemp(path.join(tmpdir(), 'dp-exam-mate-qb-'));
  const result = spawnSync('unzip', ['-q', resolved, '-d', destination], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Unable to extract Exam-Mate archive: ${result.stderr}`);
  }
  return {
    root: await archiveRootFromExtracted(destination),
    assetRoot: options.assetRoot ? path.resolve(options.assetRoot) : destination,
    sourcePath: resolved,
    sourceSha256: digest,
    cleanup: () => rm(destination, { recursive: true, force: true }),
  };
}

async function verifyChecksums(root) {
  const checksumPath = path.join(root, 'checksums.sha256');
  const checksumDigest = await hashFile(checksumPath);
  if (checksumDigest !== EXAM_MATE_CHECKSUMS_SHA256) {
    throw new Error(
      `Exam-Mate checksums file mismatch: expected ${EXAM_MATE_CHECKSUMS_SHA256}, received ${checksumDigest}.`,
    );
  }
  const content = await readFile(checksumPath, 'utf8');
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/i);
      if (!match) throw new Error(`Invalid checksum line: ${line}`);
      return { sha256: match[1].toLowerCase(), relative: match[2] };
    });

  let verified = 0;
  for (const row of rows) {
    if (row.relative.startsWith('assets/sha256/')) continue;
    const filePath = path.join(root, ...row.relative.split('/'));
    if (!(await exists(filePath))) {
      throw new Error(`Checksummed metadata file is missing: ${row.relative}`);
    }
    const digest = await hashFile(filePath);
    if (digest !== row.sha256) {
      throw new Error(`Checksum mismatch for ${row.relative}.`);
    }
    verified += 1;
  }
  return { rows, verified };
}

function cleanText(value) {
  return String(value ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'uncategorized';
}

function titleCase(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (['and', 'of', 'the', 'to', 'in'].includes(lower)) return lower;
      if (['hl', 'sl', 'ai', 'aa'].includes(lower)) return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

function finding(severity, code, details = {}, source = {}) {
  return {
    id: deterministicUuid(
      `exam-mate-finding:${severity}:${code}:${source.sourceQuestionId || ''}:${JSON.stringify(details)}`,
    ),
    severity,
    code,
    source_dataset: source.subject || null,
    source_question_id: null,
    source_reference: source.reference || null,
    details,
  };
}

function conflictKey(row, columns) {
  return columns.map((column) => String(row?.[column] ?? '')).join('\u0000');
}

export function mergeExamMateSearchText(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .join('\n');
}

export function normalizeExamMateSearchDocuments(candidates) {
  const grouped = groupBy(candidates, (row) => row.variant_id);
  const rows = [];
  const findings = [];
  let duplicateCandidates = 0;
  let exactDuplicateCandidates = 0;
  let mergedSearchCandidates = 0;

  for (const variantId of [...grouped.keys()].sort()) {
    const group = [...grouped.get(variantId)].sort(
      (left, right) =>
        String(left.source_question_id).localeCompare(
          String(right.source_question_id),
        ) || String(left.search_text).localeCompare(String(right.search_text)),
    );
    const materialSignatures = [
      ...new Set(group.map((row) => row.material_signature)),
    ].sort();
    const searchTexts = [
      ...new Set(group.map((row) => cleanText(row.search_text)).filter(Boolean)),
    ].sort();

    if (materialSignatures.length > 1) {
      findings.push(
        finding('critical', 'exam_mate_variant_sources_materially_diverge', {
          variantId,
          sourceQuestionIds: group.map((row) =>
            String(row.source_question_id),
          ),
          materialSignatures,
          searchDocumentCandidates: group.length,
        }),
      );
    }

    if (group.length > 1) {
      duplicateCandidates += group.length - 1;
      if (searchTexts.length === 1) {
        exactDuplicateCandidates += group.length - 1;
      } else {
        mergedSearchCandidates += group.length - 1;
      }
      findings.push(
        finding('info', 'exam_mate_search_documents_normalized', {
          variantId,
          sourceQuestionIds: group.map((row) =>
            String(row.source_question_id),
          ),
          inputRows: group.length,
          distinctSearchTexts: searchTexts.length,
          rule:
            searchTexts.length === 1
              ? 'identical-first-by-source-question-id'
              : 'unique-search-texts-lexicographically-joined',
        }),
      );
    }

    rows.push({
      variant_id: variantId,
      search_text: mergeExamMateSearchText(group.map((row) => row.search_text)),
    });
  }

  return {
    rows,
    findings,
    counts: {
      inputRows: candidates.length,
      outputRows: rows.length,
      duplicateCandidates,
      exactDuplicateCandidates,
      mergedSearchCandidates,
      materiallyDivergentGroups: findings.filter(
        (row) => row.code === 'exam_mate_variant_sources_materially_diverge',
      ).length,
    },
  };
}

export function normalizedRowUniqueness(rows) {
  const specifications = [
    ['searchDocuments', ['variant_id']],
    ['variants', ['id']],
    ['questionSources', ['id']],
    ['variantSources', ['id']],
    ['variantAssets', ['variant_id', 'asset_id', 'role']],
    ['placements', ['variant_id', 'subtopic_id']],
    ['variantPapers', ['variant_id', 'paper_id']],
  ];
  const findings = [];
  const counts = {};

  for (const [collection, columns] of specifications) {
    const values = rows[collection] || [];
    const seen = new Set();
    const duplicateKeys = new Set();
    for (const row of values) {
      const key = conflictKey(row, columns);
      if (seen.has(key)) duplicateKeys.add(key);
      else seen.add(key);
    }
    counts[collection] = {
      rows: values.length,
      uniqueKeys: seen.size,
      duplicateKeys: duplicateKeys.size,
    };
    if (duplicateKeys.size) {
      findings.push(
        finding('critical', 'exam_mate_normalized_row_key_collision', {
          collection,
          columns,
          duplicateKeyCount: duplicateKeys.size,
          duplicateKeyHashes: [...duplicateKeys]
            .sort()
            .slice(0, 20)
            .map((key) => sha256(key)),
        }),
      );
    }
  }

  return { findings, counts };
}

export function canRetargetExamMatePartialAsset(
  asset,
  examMateAssetIds,
  recoveryBatchId,
) {
  return Boolean(
    recoveryBatchId &&
      examMateAssetIds.has(asset.id) &&
      asset.created_by_batch_id === recoveryBatchId &&
      asset.upload_status !== 'uploaded' &&
      asset.verification_status !== 'verified',
  );
}

export function canRepairExamMatePartialRow(row, recoveryBatchId) {
  return Boolean(
    recoveryBatchId &&
      row?.created_by_batch_id &&
      row.created_by_batch_id === recoveryBatchId,
  );
}

function referenceParts(question) {
  const provided = question.referenceParts;
  if (
    provided &&
    provided.sourcePaperCode &&
    provided.level &&
    provided.season &&
    provided.year &&
    provided.questionNumber != null
  ) {
    return {
      raw: question.reference,
      sourceCourseCode: provided.sourceCourseCode || null,
      sourcePaperCode: String(provided.sourcePaperCode),
      level: String(provided.level).toUpperCase(),
      season: String(provided.season),
      year: Number(provided.year),
      questionNumber: String(provided.questionNumber),
    };
  }
  const match = String(question.reference || '').match(
    /^([A-Z0-9-]+)\/(.+?)_(HL|SL)_(Summer|Winter)_(\d{4})_Q(.+)$/i,
  );
  if (!match) return null;
  return {
    raw: question.reference,
    sourceCourseCode: match[1],
    sourcePaperCode: match[2],
    level: match[3].toUpperCase(),
    season: match[4],
    year: Number(match[5]),
    questionNumber: match[6],
  };
}

function paperParts(parts) {
  const raw = String(parts?.sourcePaperCode || '').trim();
  const digits = raw.match(/^(\d)(\d)$/);
  const legacyMathematicsOption = raw.match(/^(\d)\s+(.+?)(\d)$/i);
  const singlePaperWithoutTimezone = raw.match(/^(\d)$/);
  if (digits) {
    return {
      paper: digits[1],
      timezone: digits[2],
      option: null,
    };
  }
  if (legacyMathematicsOption) {
    const option = cleanText(legacyMathematicsOption[2]).replace(
      /^option\s+/i,
      '',
    );
    return {
      paper: legacyMathematicsOption[1],
      timezone: legacyMathematicsOption[3],
      option,
    };
  }
  if (!singlePaperWithoutTimezone) return null;
  return {
    paper: singlePaperWithoutTimezone[1],
    timezone: '0',
    option: null,
  };
}

export function canonicalExamKey(subject, referenceOrQuestion) {
  if (referenceOrQuestion && typeof referenceOrQuestion === 'object') {
    const parts = referenceParts(referenceOrQuestion);
    const paper = paperParts(parts);
    if (!parts || !paper) return null;
    const session = parts.season === 'Winter' ? 'N' : parts.season === 'Summer' ? 'M' : null;
    if (!session) return null;
    const key = [
      slugify(subject),
      String(parts.year).slice(-2),
      session,
      paper.paper,
      parts.level,
      `TZ${paper.timezone}`,
      parts.questionNumber,
    ];
    if (paper.option) key.push(`OPT${slugify(paper.option)}`);
    return key.join('|');
  }

  const value = cleanText(referenceOrQuestion);
  const pestle = value.match(/^(\d{2})([MN])\.(\d+)\.(HL|SL)(?:\.TZ(\d+))?\.(.+)$/i);
  if (pestle) {
    return [
      slugify(subject),
      pestle[1],
      pestle[2].toUpperCase(),
      pestle[3],
      pestle[4].toUpperCase(),
      `TZ${pestle[5] || '0'}`,
      pestle[6],
    ].join('|');
  }
  return null;
}

function sourceCourse(subjectDescriptor, level) {
  const levelSlug = level.toLowerCase();
  if (subjectDescriptor.legacyTrack) {
    return `${subjectDescriptor.legacyTrack}-${levelSlug}`;
  }
  return levelSlug;
}

export function courseDescriptor(subjectName, level) {
  const subject = SUBJECTS[subjectName];
  if (!subject) throw new Error(`Unsupported Exam-Mate subject: ${subjectName}`);
  const normalizedLevel = String(level || '').toUpperCase();
  if (!['SL', 'HL'].includes(normalizedLevel)) {
    throw new Error(`Unsupported Exam-Mate level ${level} for ${subjectName}.`);
  }
  const courseSlug = sourceCourse(subject, normalizedLevel);
  const courseName = subject.legacyTrack
    ? `${titleCase(subject.legacyTrack)} ${normalizedLevel}`
    : `${subject.name} ${normalizedLevel}`;
  return {
    subject: {
      id: subject.id,
      slug: subject.slug,
      name: subject.name,
      sort_order: subject.order,
    },
    course: {
      id: deterministicUuid(`course:${subject.id}:${courseSlug}`),
      subject_id: subject.id,
      source_key: `${subject.id}:${courseSlug}`,
      slug: courseSlug,
      name: courseName,
      level: normalizedLevel,
      syllabus_label: 'Legacy syllabus',
      sort_order: normalizedLevel === 'SL' ? 0 : 1,
    },
  };
}

export function sourceFileId(question, role, ordinal, url) {
  return deterministicUuid(
    `exam-mate:source-file:${question.sourceQuestionId}:${role}:${ordinal}:${url}`,
  );
}

export function questionMarkdown(question) {
  const blocks = [];
  if (cleanText(question.questionText)) blocks.push(cleanText(question.questionText));
  for (const [index, url] of (question.questionImages || []).entries()) {
    const id = sourceFileId(question, 'question', index, url);
    blocks.push(`![Question image ${index + 1}](question:${id})`);
  }
  return blocks.join('\n\n');
}

export function answerMarkdown(question) {
  const blocks = [];
  if (cleanText(question.answerText)) blocks.push(cleanText(question.answerText));
  for (const [index, url] of (question.answerImages || []).entries()) {
    const id = sourceFileId(question, 'markscheme', index, url);
    blocks.push(`![Markscheme image ${index + 1}](markscheme:${id})`);
  }
  return blocks.join('\n\n');
}

export function strictQuestionSignature(question) {
  return sha256(
    JSON.stringify({
      reference: cleanText(question.reference),
      content: cleanText(question.content),
      markScheme: cleanText(question.mark_scheme),
      maximumMark: Number(question.maximum_mark || 0),
    }),
  );
}

export function sourceQuestionSignature(question) {
  return strictQuestionSignature({
    reference: question.reference,
    content: questionMarkdown(question),
    mark_scheme: answerMarkdown(question),
    maximum_mark: 0,
  });
}

function topicLabel(question) {
  return cleanText(question.topicsRaw) || 'Uncategorized';
}

function paperDescriptor(question) {
  const parts = referenceParts(question);
  const paper = paperParts(parts);
  if (!parts || !paper) return null;
  const session = `${String(parts.year).slice(-2)}${parts.season === 'Winter' ? 'N' : 'M'}`;
  const reference = [
    session,
    `Paper ${paper.paper}`,
    `TZ${paper.timezone}`,
    ...(paper.option ? [`Option ${paper.option}`] : []),
  ].join(' · ');
  return {
    id: deterministicUuid(`paper:${reference}:null`),
    reference,
    calculator_allowed: null,
    formula_booklet_source_url: null,
    formula_booklet_filename: null,
    formula_booklet_storage_provider: null,
    formula_booklet_storage_bucket: null,
    formula_booklet_storage_key: null,
    source_metadata: {
      provider: 'Exam-Mate',
      year: parts.year,
      season: parts.season,
      paper: paper.paper,
      timezone: paper.timezone,
      option: paper.option,
      sourcePaperCode: parts.sourcePaperCode,
    },
  };
}

function mapBy(rows, key) {
  return new Map(rows.map((row) => [key(row), row]));
}

function groupBy(rows, key) {
  const output = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!output.has(value)) output.set(value, []);
    output.get(value).push(row);
  }
  return output;
}

const EXAM_MATE_READ_CONCURRENCY = 1;
let activeExamMateReads = 0;
const examMateReadWaiters = [];

async function withExamMateReadSlot(operation) {
  if (activeExamMateReads < EXAM_MATE_READ_CONCURRENCY) {
    activeExamMateReads += 1;
  } else {
    await new Promise((resolve) => examMateReadWaiters.push(resolve));
  }
  try {
    return await operation();
  } finally {
    const next = examMateReadWaiters.shift();
    if (next) next();
    else activeExamMateReads -= 1;
  }
}

export async function fetchAll(
  client,
  table,
  columns,
  orderColumns = ['id'],
  retryDelayMs = 500,
) {
  const output = [];
  const pageSize = 1000;
  const orderedColumns = Array.isArray(orderColumns)
    ? orderColumns
    : [orderColumns];
  const useKeysetPagination = orderedColumns.length === 1;
  let cursor = null;
  for (let pageIndex = 0; ; pageIndex += 1) {
    let data = null;
    let error = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await withExamMateReadSlot(async () => {
        let query = client.from(table).select(columns);
        for (const orderColumn of orderedColumns) {
          query = query.order(orderColumn, { ascending: true });
        }
        if (useKeysetPagination && cursor !== null) {
          query = query.gt(orderedColumns[0], cursor);
        }
        const offset = useKeysetPagination ? 0 : pageIndex * pageSize;
        return query.range(offset, offset + pageSize - 1);
      });
      data = result.data;
      error = result.error;
      const retriable =
        error &&
        error.code === '57014' &&
        /statement timeout/i.test(String(error.message || ''));
      if (!error || !retriable || attempt === 4) break;
      process.stderr.write(
        `${table} read page ${pageIndex + 1} timed out; retrying attempt ${attempt + 1}/4.\n`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * retryDelayMs),
      );
    }
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    const rows = data || [];
    output.push(...rows);
    if (rows.length < pageSize) break;
    if (useKeysetPagination) {
      const nextCursor = rows.at(-1)?.[orderedColumns[0]];
      if (nextCursor == null || nextCursor === cursor) {
        throw new Error(
          `${table} keyset pagination did not advance on page ${pageIndex + 1}.`,
        );
      }
      cursor = nextCursor;
    }
  }
  return output;
}

function localAssetPath(assetRoot, manifestRow) {
  if (!manifestRow?.path) return null;
  return path.join(assetRoot, ...String(manifestRow.path).split('/'));
}

function assetUrls(question) {
  return [
    ...(question.questionImages || []),
    ...(question.answerImages || []),
  ].filter(Boolean);
}

function sourceVariantMaterialSignature({
  sourceQuestion,
  course,
  topic,
  paper,
  verifiedAssetByUrl,
}) {
  function selectedAssets(urls) {
    return urls.map((url, ordinal) => {
      const manifest = verifiedAssetByUrl.get(url);
      return {
        ordinal,
        contentHash: manifest?.sha256 || null,
        byteSize: Number(manifest?.bytes || 0),
        contentType: manifest?.contentType || null,
      };
    });
  }

  return sha256(
    JSON.stringify({
      canonicalExamKey: canonicalExamKey(sourceQuestion.subject, sourceQuestion),
      subject: sourceQuestion.subject,
      course: course.source_key,
      topic: topic.slug,
      paper: paper?.reference || null,
      questionText: cleanText(sourceQuestion.questionText),
      answerText: cleanText(sourceQuestion.answerText),
      mcqAnswer: cleanText(sourceQuestion.mcqAnswer),
      questionAssets: selectedAssets(sourceQuestion.questionImages || []),
      answerAssets: selectedAssets(sourceQuestion.answerImages || []),
    }),
  );
}

export async function normalizeExamMateArchive(root, options = {}) {
  const required = [
    'summary.json',
    'progress.json',
    'checksums.sha256',
    'index/questions.ndjson',
    'index/question-occurrences.ndjson',
    'index/asset-manifest.ndjson',
    'source/discovered-jobs.json',
  ];
  for (const relative of required) {
    if (!(await exists(path.join(root, ...relative.split('/'))))) {
      throw new Error(`Exam-Mate capture is missing ${relative}.`);
    }
  }

  const checksumResult = await verifyChecksums(root);
  const [summary, progress, jobs, questionsIndex, occurrences, assetManifest] =
    await Promise.all([
      readFile(path.join(root, 'summary.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'progress.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'source', 'discovered-jobs.json'), 'utf8').then(JSON.parse),
      readAllNdjson(path.join(root, 'index', 'questions.ndjson')),
      readAllNdjson(path.join(root, 'index', 'question-occurrences.ndjson')),
      readAllNdjson(path.join(root, 'index', 'asset-manifest.ndjson')),
    ]);

  const findings = [];
  const sourceQuestions = [];
  const sourceQuestionFiles = await readdir(path.join(root, 'source', 'questions'));
  for (const filename of sourceQuestionFiles.sort()) {
    if (!filename.endsWith('.json')) continue;
    sourceQuestions.push(
      JSON.parse(await readFile(path.join(root, 'source', 'questions', filename), 'utf8')),
    );
  }

  const verifiedAssetByUrl = new Map(
    assetManifest
      .filter((row) => row.status === 'verified' && row.url && row.sha256)
      .map((row) => [row.url, row]),
  );
  const quarantinedQuestions = [];
  const importableQuestions = [];
  const retiredQuestions = [];
  const usedAssetUrls = new Set();

  for (const question of sourceQuestions) {
    if (isRetiredExamMateSubject(question.subject)) {
      retiredQuestions.push(question);
      continue;
    }
    const reasons = [];
    if (
      !cleanText(question.questionText) &&
      !(question.questionImages || []).length
    ) {
      reasons.push('missing_question_payload');
    }
    if (!cleanText(question.answerText) && !(question.answerImages || []).length) {
      reasons.push('missing_answer_payload');
    }
    const parts = referenceParts(question);
    if (!parts || !paperParts(parts) || !SUBJECTS[question.subject]) {
      reasons.push('unparseable_reference');
    }
    const missingAssetUrls = assetUrls(question).filter(
      (url) => !verifiedAssetByUrl.has(url),
    );
    if (missingAssetUrls.length) reasons.push('missing_verified_asset');

    if (reasons.length) {
      const row = {
        ...question,
        quarantineReasons: reasons,
        missingAssetUrls,
      };
      quarantinedQuestions.push(row);
      findings.push(
        finding('warning', 'exam_mate_question_quarantined', {
          reasons,
          missingAssetCount: missingAssetUrls.length,
          missingAssetUrlHashes: missingAssetUrls.map((url) => sha256(url)),
        }, question),
      );
      continue;
    }

    for (const url of assetUrls(question)) usedAssetUrls.add(url);
    importableQuestions.push(question);
  }

  const usedPhysicalHashes = new Set(
    [...usedAssetUrls]
      .map((url) => verifiedAssetByUrl.get(url)?.sha256)
      .filter(Boolean),
  );
  const allPhysicalHashes = new Set(
    assetManifest.map((row) => row.sha256).filter(Boolean),
  );

  const actualCounts = {
    sourceQuestions: sourceQuestions.length,
    sourceOccurrences: occurrences.length,
    assetManifestRows: assetManifest.length,
    uniquePhysicalAssets: allPhysicalHashes.size,
    metadataPages: Number(summary.totalPagesCaptured || 0),
    discoveredJobs: jobs.length,
    completedJobs: Number(summary.completedJobs || 0),
    emptyOrUnavailableJobs: Number(summary.emptyOrUnavailableJobs || 0),
    importableQuestions: importableQuestions.length,
    retiredQuestions: retiredQuestions.length,
    quarantinedQuestions: quarantinedQuestions.length,
    importableAssetUrls: usedAssetUrls.size,
    importablePhysicalAssets: usedPhysicalHashes.size,
    verifiedMetadataFiles: checksumResult.verified,
    checksumRows: checksumResult.rows.length,
  };

  for (const [key, expected] of Object.entries(EXAM_MATE_EXPECTED)) {
    if (actualCounts[key] !== expected) {
      findings.push(
        finding('critical', 'exam_mate_count_mismatch', {
          key,
          expected,
          actual: actualCounts[key],
        }),
      );
    }
  }

  if (summary.format !== 'dp-resources-exam-mate-source-index-v1') {
    findings.push(
      finding('critical', 'exam_mate_format_mismatch', {
        expected: 'dp-resources-exam-mate-source-index-v1',
        actual: summary.format,
      }),
    );
  }
  if (summary.indexerVersion !== '1.2.2') {
    findings.push(
      finding('critical', 'exam_mate_indexer_version_mismatch', {
        expected: '1.2.2',
        actual: summary.indexerVersion,
      }),
    );
  }

  const assetRoot = options.assetRoot || root;
  const assetManifestByHash = new Map(
    assetManifest.map((row) => [String(row.sha256 || '').toLowerCase(), row]),
  );
  let localVerifiedAssets = 0;
  let missingLocalAssets = 0;
  for (const hash of usedPhysicalHashes) {
    const row = assetManifestByHash.get(String(hash).toLowerCase());
    const localPath = row ? localAssetPath(assetRoot, row) : null;
    if (!localPath || !(await exists(localPath))) {
      missingLocalAssets += 1;
      continue;
    }
    if (options.verifyLocalAssets) {
      const fileStat = await stat(localPath);
      const digest = await hashFile(localPath);
      if (digest !== hash || fileStat.size !== Number(row.bytes)) {
        findings.push(
          finding('critical', 'exam_mate_local_asset_verification_failed', {
            hash,
            expectedBytes: row.bytes,
            actualBytes: fileStat.size,
            actualHash: digest,
          }),
        );
        continue;
      }
    }
    localVerifiedAssets += 1;
  }

  if (options.requireLocalAssets && missingLocalAssets) {
    findings.push(
      finding('critical', 'exam_mate_local_assets_missing', {
        expected: usedPhysicalHashes.size,
        available: localVerifiedAssets,
        missing: missingLocalAssets,
        assetRoot,
      }),
    );
  }

  actualCounts.localVerifiedAssets = localVerifiedAssets;
  actualCounts.missingLocalAssets = missingLocalAssets;

  const critical = findings.filter((row) => row.severity === 'critical');
  return {
    importerVersion: EXAM_MATE_IMPORTER_VERSION,
    archiveIdentifier: 'exam-mate-source-index-20260729-223333',
    archiveSha256: EXAM_MATE_AUDIT_ZIP_SHA256,
    sourceChecksumsSha256: EXAM_MATE_CHECKSUMS_SHA256,
    processedAt: new Date().toISOString(),
    expectedCounts: EXAM_MATE_EXPECTED,
    actualCounts,
    verificationStatus: critical.length ? 'failed' : 'passed',
    findings,
    source: {
      root,
      assetRoot,
      summary,
      progress,
      jobs,
      questionsIndex,
      occurrences,
      assetManifest,
      verifiedAssetByUrl,
      importableQuestions,
      retiredQuestions,
      quarantinedQuestions,
      usedAssetUrls,
      usedPhysicalHashes,
    },
  };
}

function nextFreeOccurrence(existingTupleCounts, questionId, datasetId, sourceIndex) {
  const key = `${questionId}\u0000${datasetId}\u0000${sourceIndex}`;
  const next = existingTupleCounts.get(key) || 0;
  existingTupleCounts.set(key, next + 1);
  return next;
}

export async function resolveExamMateForProduction(normalized, client, options = {}) {
  if (normalized.verificationStatus !== 'passed') {
    throw new Error('Production resolution refused because source verification failed.');
  }

  const [
    existingSubjects,
    existingCourses,
    existingDatasets,
    existingTopics,
    existingSubtopics,
    existingQuestions,
    existingVariants,
    existingPapers,
    existingAssets,
    existingQuestionSources,
    existingVariantSources,
    existingCoursePapers,
    existingPlacements,
    existingVariantPapers,
    existingAssetSources,
    existingVariantAssets,
  ] = await Promise.all([
    fetchAll(client, 'dp_qb_subjects', 'id,slug,name,sort_order'),
    fetchAll(client, 'dp_qb_courses', 'id,subject_id,source_key,slug,name,level,syllabus_label,sort_order'),
    fetchAll(client, 'dp_qb_datasets', 'id,course_id,source_filename,encoded_filename,chunk_id,topic_slug,expected_question_count,expected_subtopic_count,source_metadata'),
    fetchAll(client, 'dp_qb_topics', 'id,dataset_id,course_id,slug,name,sort_order'),
    fetchAll(client, 'dp_qb_subtopics', 'id,topic_id,course_id,slug,name,code,description,sort_order'),
    fetchAll(client, 'dp_qb_questions', 'id,reference,content,mark_scheme,examiner_report,maximum_mark,source_status,content_hash,source_metadata'),
    fetchAll(client, 'dp_qb_question_variants', 'id,question_id,dataset_id,course_id,topic_id,paper_id,source_index,source_occurrence,canonical_source_subtopic_id,difficulty_value,difficulty_label,section_raw,section_normalized,calculator_allowed,source_metadata,created_by_batch_id,last_seen_batch_id'),
    fetchAll(client, 'dp_qb_papers', 'id,reference,calculator_allowed,formula_booklet_source_url,formula_booklet_filename,formula_booklet_storage_provider,formula_booklet_storage_bucket,formula_booklet_storage_key,source_metadata,created_by_batch_id,last_seen_batch_id'),
    fetchAll(client, 'dp_qb_assets', 'id,content_hash,canonical_source_path,original_filename,file_extension,content_type,byte_size,storage_provider,storage_bucket,storage_key,upload_status,verification_status,uploaded_at,verified_at,last_error,created_by_batch_id,last_seen_batch_id'),
    fetchAll(client, 'dp_qb_question_sources', 'id,provider,source_question_id,question_id,created_by_batch_id,last_seen_batch_id'),
    fetchAll(client, 'dp_qb_variant_sources', 'id,provider,source_question_id,source_course,source_topic,variant_id,created_by_batch_id,last_seen_batch_id'),
    fetchAll(
      client,
      'dp_qb_course_papers',
      'course_id,paper_id',
      ['course_id', 'paper_id'],
    ),
    fetchAll(
      client,
      'dp_qb_question_subtopics',
      'variant_id,subtopic_id,created_by_batch_id,last_seen_batch_id',
      ['variant_id', 'subtopic_id'],
    ),
    fetchAll(
      client,
      'dp_qb_variant_papers',
      'variant_id,paper_id,created_by_batch_id,last_seen_batch_id',
      ['variant_id', 'paper_id'],
    ),
    fetchAll(client, 'dp_qb_asset_sources', 'id,asset_id,source_key,source_question_id,created_by_batch_id,last_seen_batch_id', 'id'),
    fetchAll(
      client,
      'dp_qb_variant_assets',
      'variant_id,asset_id,source_file_id,role,sort_order,alt_text,created_by_batch_id,last_seen_batch_id',
      ['variant_id', 'asset_id', 'role'],
    ),
  ]);

  const findings = [...normalized.findings];
  const rows = {
    subjects: [],
    courses: [],
    datasets: [],
    topics: [],
    subtopics: [],
    papers: [],
    coursePapers: [],
    questions: [],
    questionSources: [],
    variants: [],
    variantSources: [],
    placements: [],
    variantPapers: [],
    assets: [],
    assetSources: [],
    variantAssets: [],
    searchDocuments: [],
    assetUploadCandidates: [],
  };
  const recoveryPlan = {
    questionSourceUpdates: [],
    variantUpdates: [],
    variantSourceUpdates: [],
    assetSourceUpdates: [],
    variantAssetUpdates: [],
    deleteVariants: [],
    deletePlacements: [],
    deleteVariantAssets: [],
    deleteVariantPapers: [],
    deleteCoursePapers: [],
    deletePapers: [],
  };
  const recoveryBatchId = options.recoveryBatchId || null;

  const subjectById = mapBy(existingSubjects, (row) => row.id);
  const courseBySourceKey = mapBy(existingCourses, (row) => row.source_key);
  const datasetByFilename = mapBy(existingDatasets, (row) => row.source_filename);
  const topicByCourseSlug = mapBy(existingTopics, (row) => `${row.course_id}\u0000${row.slug}`);
  const subtopicByTopicSlug = mapBy(existingSubtopics, (row) => `${row.topic_id}\u0000${row.slug}`);
  const existingQuestionById = mapBy(existingQuestions, (row) => row.id);
  const existingQuestionsByHash = groupBy(existingQuestions, (row) => row.content_hash);
  const existingVariantById = mapBy(existingVariants, (row) => row.id);
  const existingVariantByQuestionCourseTopic = groupBy(
    existingVariants,
    (row) => `${row.question_id}\u0000${row.course_id}\u0000${row.topic_id}`,
  );
  const existingVariantTupleCounts = new Map();
  for (const row of existingVariants) {
    const key = `${row.question_id}\u0000${row.dataset_id}\u0000${row.source_index}`;
    existingVariantTupleCounts.set(
      key,
      Math.max(existingVariantTupleCounts.get(key) || 0, Number(row.source_occurrence || 0) + 1),
    );
  }
  const existingPaperByReference = groupBy(existingPapers, (row) => cleanText(row.reference));
  const assetByHash = mapBy(existingAssets, (row) => row.content_hash);
  const questionSourceByKey = mapBy(
    existingQuestionSources,
    (row) => `${row.provider}\u0000${row.source_question_id}`,
  );
  const variantSourceByKey = mapBy(
    existingVariantSources,
    (row) => `${row.provider}\u0000${row.source_question_id}\u0000${row.source_course}\u0000${row.source_topic}`,
  );
  const existingCoursePaperKeys = new Set(
    existingCoursePapers.map((row) => `${row.course_id}\u0000${row.paper_id}`),
  );
  const existingPlacementKeys = new Set(
    existingPlacements.map((row) => `${row.variant_id}\u0000${row.subtopic_id}`),
  );
  const existingVariantPaperKeys = new Set(
    existingVariantPapers.map((row) => `${row.variant_id}\u0000${row.paper_id}`),
  );
  const existingAssetSourceByKey = mapBy(
    existingAssetSources,
    (row) => row.source_key,
  );
  const existingVariantAssetByKey = mapBy(
    existingVariantAssets,
    (row) => `${row.variant_id}\u0000${row.asset_id}\u0000${row.role}`,
  );
  const examMateAssetIds = new Set(
    existingAssetSources
      .filter((row) => String(row.source_key || '').startsWith('exam-mate:'))
      .map((row) => row.asset_id),
  );

  function ensureSubject(descriptor) {
    let subject = subjectById.get(descriptor.subject.id);
    if (!subject) {
      subject = descriptor.subject;
      rows.subjects.push(subject);
      subjectById.set(subject.id, subject);
    }
    return subject;
  }

  function ensureCourse(descriptor) {
    ensureSubject(descriptor);
    let course = courseBySourceKey.get(descriptor.course.source_key);
    if (!course) {
      course = descriptor.course;
      rows.courses.push(course);
      courseBySourceKey.set(course.source_key, course);
    }
    return course;
  }

  let nextTopicOrder = existingTopics.length;
  function ensureTopic(course, sourceTopic) {
    const slug = slugify(sourceTopic);
    const key = `${course.id}\u0000${slug}`;
    let topic = topicByCourseSlug.get(key);
    if (topic) return topic;
    const datasetFilename = `exam-mate/${course.source_key}/${slug}.json`;
    let dataset = datasetByFilename.get(datasetFilename);
    if (!dataset) {
      dataset = {
        id: deterministicUuid(`exam-mate:dataset:${course.id}:${slug}`),
        course_id: course.id,
        source_filename: datasetFilename,
        encoded_filename: datasetFilename,
        chunk_id: 0,
        topic_slug: slug,
        expected_question_count: 0,
        expected_subtopic_count: 1,
        source_metadata: {
          provider: 'Exam-Mate',
          sourceTopic,
        },
      };
      rows.datasets.push(dataset);
      datasetByFilename.set(datasetFilename, dataset);
    }
    topic = {
      id: deterministicUuid(`exam-mate:topic:${course.id}:${slug}`),
      dataset_id: dataset.id,
      course_id: course.id,
      slug,
      name: sourceTopic === 'Uncategorized' ? 'Uncategorized' : sourceTopic,
      sort_order: nextTopicOrder++,
    };
    rows.topics.push(topic);
    topicByCourseSlug.set(key, topic);
    return topic;
  }

  function ensureSubtopic(course, topic) {
    const key = `${topic.id}\u0000${topic.slug}`;
    let subtopic = subtopicByTopicSlug.get(key);
    if (subtopic) return subtopic;
    subtopic = {
      id: deterministicUuid(`exam-mate:subtopic:${topic.id}:${topic.slug}`),
      topic_id: topic.id,
      course_id: course.id,
      slug: topic.slug,
      name: topic.name,
      code: '',
      description: '',
      sort_order: 0,
    };
    rows.subtopics.push(subtopic);
    subtopicByTopicSlug.set(key, subtopic);
    return subtopic;
  }

  const canonicalQuestionBySourceId = new Map();
  const sourceQuestionData = new Map();
  const resolvedQuestionSourceIds = new Set();
  const resolvedQuestionSourceQuestionIds = new Map();
  const expectedQuestionCoreHashes = new Map();
  for (const sourceQuestion of normalized.source.importableQuestions) {
    const sourceId = String(sourceQuestion.sourceQuestionId);
    const sourceKey = `exam_mate\u0000${sourceId}`;
    const parts = referenceParts(sourceQuestion);
    const descriptor = courseDescriptor(sourceQuestion.subject, parts.level);
    const content = questionMarkdown(sourceQuestion);
    const markScheme = answerMarkdown(sourceQuestion);
    const candidate = {
      id: deterministicUuid(`exam-mate:question:${sourceQuestion.sourceQuestionId}`),
      reference: cleanText(sourceQuestion.reference),
      content,
      mark_scheme: markScheme,
      examiner_report: '',
      maximum_mark: 0,
      source_status: 'exam_mate_import_ready',
      content_hash: sourceQuestionSignature(sourceQuestion),
      source_metadata: {
        provider: 'Exam-Mate',
        providerSubject: sourceQuestion.subject,
        sourceQuestionId: String(sourceQuestion.sourceQuestionId),
        referenceParts: parts,
        sourceTopic: topicLabel(sourceQuestion),
        mcqAnswerRaw: sourceQuestion.mcqAnswer || null,
        sourceUrl: sourceQuestion.sourceUrl,
      },
    };

    let canonical = null;
    const exact = existingQuestionsByHash.get(candidate.content_hash) || [];
    if (exact.length) {
      canonical = [...exact].sort((a, b) => a.id.localeCompare(b.id))[0];
    }

    if (!canonical) {
      const idCollision = existingQuestionById.get(candidate.id);
      if (idCollision) {
        findings.push(
          finding(
            'critical',
            'exam_mate_question_id_content_conflict',
            {
              sourceQuestionId: sourceQuestion.sourceQuestionId,
              candidateQuestionId: candidate.id,
              candidateContentHash: candidate.content_hash,
              existingContentHash: idCollision.content_hash,
            },
            sourceQuestion,
          ),
        );
        canonical = idCollision;
      } else {
        canonical = candidate;
        rows.questions.push(candidate);
        existingQuestionById.set(candidate.id, candidate);
        if (!existingQuestionsByHash.has(candidate.content_hash)) {
          existingQuestionsByHash.set(candidate.content_hash, []);
        }
        existingQuestionsByHash.get(candidate.content_hash).push(candidate);
      }
    }

    const priorExpectedHash = expectedQuestionCoreHashes.get(canonical.id);
    if (
      priorExpectedHash &&
      priorExpectedHash !== candidate.content_hash
    ) {
      findings.push(
        finding(
          'critical',
          'exam_mate_question_core_has_divergent_source_content',
          {
            sourceQuestionId: sourceQuestion.sourceQuestionId,
            canonicalQuestionId: canonical.id,
            priorExpectedHash,
            candidateContentHash: candidate.content_hash,
          },
          sourceQuestion,
        ),
      );
    }
    expectedQuestionCoreHashes.set(canonical.id, candidate.content_hash);
    canonicalQuestionBySourceId.set(sourceId, canonical.id);
    sourceQuestionData.set(sourceId, { sourceQuestion, descriptor, content, markScheme });

    const desiredQuestionSource = {
      id: deterministicUuid(`exam-mate:question-source:${sourceId}`),
      question_id: canonical.id,
      provider: 'exam_mate',
      source_question_id: sourceId,
      source_subject_id: String(sourceQuestion.subjectId || ''),
      source_reference: sourceQuestion.reference,
      source_url: sourceQuestion.sourceUrl || null,
      source_metadata: {
        curriculum: sourceQuestion.curriculum,
        subject: sourceQuestion.subject,
        topic: topicLabel(sourceQuestion),
        referenceParts: parts,
        sourcePage: sourceQuestion.page,
        sourceEventKey: sourceQuestion.eventKey,
      },
    };
    const existingQuestionSource = questionSourceByKey.get(sourceKey);
    if (!existingQuestionSource) {
      rows.questionSources.push(desiredQuestionSource);
      questionSourceByKey.set(sourceKey, desiredQuestionSource);
    } else if (existingQuestionSource.question_id !== canonical.id) {
      if (
        !canRepairExamMatePartialRow(
          existingQuestionSource,
          recoveryBatchId,
        )
      ) {
        findings.push(
          finding(
            'critical',
            'exam_mate_question_source_repair_not_owned_by_failed_batch',
            {
              sourceQuestionId: sourceId,
              questionSourceId: existingQuestionSource.id,
              currentQuestionId: existingQuestionSource.question_id,
              expectedQuestionId: canonical.id,
            },
            sourceQuestion,
          ),
        );
      } else {
        const repair = {
          ...desiredQuestionSource,
          created_by_batch_id: existingQuestionSource.created_by_batch_id,
        };
        recoveryPlan.questionSourceUpdates.push(repair);
        questionSourceByKey.set(sourceKey, repair);
      }
    }
    const resolvedQuestionSource = questionSourceByKey.get(sourceKey);
    resolvedQuestionSourceIds.add(resolvedQuestionSource.id);
    resolvedQuestionSourceQuestionIds.set(
      resolvedQuestionSource.id,
      canonical.id,
    );
  }

  const paperByReference = new Map();
  for (const sourceQuestion of normalized.source.importableQuestions) {
    const descriptor = paperDescriptor(sourceQuestion);
    if (!descriptor || paperByReference.has(descriptor.reference)) continue;
    const existing = existingPaperByReference.get(descriptor.reference) || [];
    const paper = existing.length ? existing[0] : descriptor;
    paperByReference.set(descriptor.reference, paper);
    if (!existing.length) rows.papers.push(paper);
  }

  const variantBySourceQuestion = new Map();
  const placementKeys = new Set(existingPlacementKeys);
  const coursePaperKeys = new Set(existingCoursePaperKeys);
  const variantPaperKeys = new Set(existingVariantPaperKeys);
  const resolvedPlacementKeys = new Set();
  const resolvedCoursePaperKeys = new Set();
  const resolvedVariantPaperKeys = new Set();
  const resolvedVariantSourceIds = new Set();
  const resolvedVariantSourceVariantIds = new Map();
  const resolvedVariantSourceKeys = new Set();
  const searchDocumentCandidates = [];
  let sourceIndex = 0;
  for (const [sourceId, data] of sourceQuestionData) {
    const canonicalQuestionId = canonicalQuestionBySourceId.get(sourceId);
    const course = ensureCourse(data.descriptor);
    const topicName = topicLabel(data.sourceQuestion);
    const topic = ensureTopic(course, topicName);
    const subtopic = ensureSubtopic(course, topic);
    const paper = paperDescriptor(data.sourceQuestion);
    const canonicalPaper = paper ? paperByReference.get(paper.reference) : null;
    const variantKey = `${canonicalQuestionId}\u0000${course.id}\u0000${topic.id}`;
    const variantSourceKey = `exam_mate\u0000${sourceId}\u0000${course.source_key}\u0000${topic.slug}`;
    const existingVariantSource = variantSourceByKey.get(variantSourceKey);
    const sourceBoundVariant = existingVariantSource
      ? existingVariantById.get(existingVariantSource.variant_id)
      : null;
    if (existingVariantSource && !sourceBoundVariant) {
      findings.push(
        finding(
          'critical',
          'exam_mate_variant_source_points_to_missing_variant',
          {
            sourceQuestionId: sourceId,
            variantSourceId: existingVariantSource.id,
            missingVariantId: existingVariantSource.variant_id,
          },
          data.sourceQuestion,
        ),
      );
    }
    const existing = existingVariantByQuestionCourseTopic.get(variantKey) || [];
    let variant;
    if (sourceBoundVariant) {
      const desired = {
        ...sourceBoundVariant,
        question_id: canonicalQuestionId,
        dataset_id: topic.dataset_id,
        course_id: course.id,
        topic_id: topic.id,
        paper_id: canonicalPaper?.id || null,
        source_index: sourceIndex,
        canonical_source_subtopic_id: subtopic.id,
        difficulty_value: null,
        difficulty_label: null,
        section_raw: null,
        section_normalized: null,
        calculator_allowed: null,
        source_metadata: {
          provider: 'Exam-Mate',
          sourceQuestionId: sourceId,
          sourceTopic: topicName,
          sourceCourse: course.source_key,
        },
      };
      const materialColumns = [
        'question_id',
        'dataset_id',
        'course_id',
        'topic_id',
        'paper_id',
        'source_index',
        'canonical_source_subtopic_id',
        'difficulty_value',
        'difficulty_label',
        'section_raw',
        'section_normalized',
        'calculator_allowed',
      ];
      const needsRepair =
        materialColumns.some(
          (column) => sourceBoundVariant[column] !== desired[column],
        ) ||
        JSON.stringify(sourceBoundVariant.source_metadata || {}) !==
          JSON.stringify(desired.source_metadata);
      if (needsRepair) {
        if (!canRepairExamMatePartialRow(sourceBoundVariant, recoveryBatchId)) {
          findings.push(
            finding(
              'critical',
              'exam_mate_source_bound_variant_repair_not_owned_by_failed_batch',
              {
                sourceQuestionId: sourceId,
                variantId: sourceBoundVariant.id,
                currentQuestionId: sourceBoundVariant.question_id,
                expectedQuestionId: canonicalQuestionId,
              },
              data.sourceQuestion,
            ),
          );
          variant = sourceBoundVariant;
        } else {
          variant = desired;
          recoveryPlan.variantUpdates.push(desired);
          existingVariantById.set(desired.id, desired);
        }
      } else {
        variant = sourceBoundVariant;
      }
    } else if (existing.length) {
      variant = [...existing].sort((a, b) => a.id.localeCompare(b.id))[0];
      if (
        variant.paper_id !== (canonicalPaper?.id || null) ||
        variant.canonical_source_subtopic_id !== subtopic.id
      ) {
        if (!canRepairExamMatePartialRow(variant, recoveryBatchId)) {
          findings.push(
            finding(
              'critical',
              'exam_mate_variant_repair_not_owned_by_failed_batch',
              {
                sourceQuestionId: sourceId,
                variantId: variant.id,
                currentPaperId: variant.paper_id,
                expectedPaperId: canonicalPaper?.id || null,
              },
              data.sourceQuestion,
            ),
          );
        } else {
          variant = {
            ...variant,
            paper_id: canonicalPaper?.id || null,
            canonical_source_subtopic_id: subtopic.id,
          };
          recoveryPlan.variantUpdates.push(variant);
          existingVariantByQuestionCourseTopic.set(variantKey, [variant]);
        }
      }
    } else {
      const occurrence = nextFreeOccurrence(
        existingVariantTupleCounts,
        canonicalQuestionId,
        topic.dataset_id,
        sourceIndex,
      );
      variant = {
        id: deterministicUuid(`exam-mate:variant:${canonicalQuestionId}:${course.source_key}:${topic.slug}`),
        question_id: canonicalQuestionId,
        dataset_id: topic.dataset_id,
        course_id: course.id,
        topic_id: topic.id,
        paper_id: canonicalPaper?.id || null,
        source_index: sourceIndex,
        source_occurrence: occurrence,
        canonical_source_subtopic_id: subtopic.id,
        difficulty_value: null,
        difficulty_label: null,
        section_raw: null,
        section_normalized: null,
        calculator_allowed: null,
        source_metadata: {
          provider: 'Exam-Mate',
          sourceQuestionId: sourceId,
          sourceTopic: topicName,
          sourceCourse: course.source_key,
        },
      };
      rows.variants.push(variant);
      if (!existingVariantByQuestionCourseTopic.has(variantKey)) {
        existingVariantByQuestionCourseTopic.set(variantKey, []);
      }
      existingVariantByQuestionCourseTopic.get(variantKey).push(variant);
    }
    variantBySourceQuestion.set(sourceId, variant);

    resolvedVariantSourceKeys.add(
      `${sourceId}:${course.source_key}:${topic.slug}`,
    );
    const desiredVariantSource = {
      id: deterministicUuid(`exam-mate:variant-source:${sourceId}:${course.source_key}:${topic.slug}`),
      variant_id: variant.id,
      provider: 'exam_mate',
      source_question_id: sourceId,
      source_course: course.source_key,
      source_topic: topic.slug,
      source_index: sourceIndex,
      source_metadata: {
        curriculum: data.sourceQuestion.curriculum,
        subject: data.sourceQuestion.subject,
        sourceTopic: topicName,
        sourceUrl: data.sourceQuestion.sourceUrl,
      },
    };
    if (!existingVariantSource) {
      rows.variantSources.push(desiredVariantSource);
      variantSourceByKey.set(variantSourceKey, desiredVariantSource);
    } else if (existingVariantSource.variant_id !== variant.id) {
      if (
        !canRepairExamMatePartialRow(existingVariantSource, recoveryBatchId)
      ) {
        findings.push(
          finding(
            'critical',
            'exam_mate_variant_source_repair_not_owned_by_failed_batch',
            {
              sourceQuestionId: sourceId,
              variantSourceId: existingVariantSource.id,
              currentVariantId: existingVariantSource.variant_id,
              expectedVariantId: variant.id,
            },
            data.sourceQuestion,
          ),
        );
      } else {
        const repair = {
          ...desiredVariantSource,
          created_by_batch_id: existingVariantSource.created_by_batch_id,
        };
        recoveryPlan.variantSourceUpdates.push(repair);
        variantSourceByKey.set(variantSourceKey, repair);
      }
    }
    const resolvedVariantSource = variantSourceByKey.get(variantSourceKey);
    resolvedVariantSourceIds.add(resolvedVariantSource.id);
    resolvedVariantSourceVariantIds.set(
      resolvedVariantSource.id,
      variant.id,
    );

    const placementKey = `${variant.id}\u0000${subtopic.id}`;
    resolvedPlacementKeys.add(placementKey);
    if (!placementKeys.has(placementKey)) {
      placementKeys.add(placementKey);
      rows.placements.push({
        variant_id: variant.id,
        subtopic_id: subtopic.id,
        placement_order: 0,
        placement_difficulty: null,
        is_fallback: topicName === 'Uncategorized',
        fallback_reason:
          topicName === 'Uncategorized' ? 'exam_mate_uncategorized' : null,
      });
    }

    if (canonicalPaper) {
      const coursePaperKey = `${course.id}\u0000${canonicalPaper.id}`;
      resolvedCoursePaperKeys.add(coursePaperKey);
      if (!coursePaperKeys.has(coursePaperKey)) {
        coursePaperKeys.add(coursePaperKey);
        rows.coursePapers.push({ course_id: course.id, paper_id: canonicalPaper.id });
      }
      const variantPaperKey = `${variant.id}\u0000${canonicalPaper.id}`;
      resolvedVariantPaperKeys.add(variantPaperKey);
      if (!variantPaperKeys.has(variantPaperKey)) {
        variantPaperKeys.add(variantPaperKey);
        rows.variantPapers.push({
          variant_id: variant.id,
          paper_id: canonicalPaper.id,
          is_primary: true,
          sort_order: 0,
        });
      }
    }

    searchDocumentCandidates.push({
      variant_id: variant.id,
      source_question_id: sourceId,
      material_signature: sourceVariantMaterialSignature({
        sourceQuestion: data.sourceQuestion,
        course,
        topic,
        paper: canonicalPaper,
        verifiedAssetByUrl: normalized.source.verifiedAssetByUrl,
      }),
      search_text: [
        data.sourceQuestion.reference,
        data.sourceQuestion.subject,
        course.name,
        topicName,
        cleanText(data.sourceQuestion.questionText),
        cleanText(data.sourceQuestion.answerText),
      ].filter(Boolean).join(' '),
    });
    sourceIndex += 1;
  }

  const normalizedSearchDocuments = normalizeExamMateSearchDocuments(
    searchDocumentCandidates,
  );
  rows.searchDocuments = normalizedSearchDocuments.rows;
  findings.push(...normalizedSearchDocuments.findings);

  for (const dataset of rows.datasets) {
    dataset.expected_question_count = rows.variants.filter(
      (variant) => variant.dataset_id === dataset.id,
    ).length;
    const topic = rows.topics.find((candidate) => candidate.dataset_id === dataset.id);
    dataset.expected_subtopic_count = topic
      ? rows.subtopics.filter((subtopic) => subtopic.topic_id === topic.id).length
      : 0;
  }

  const storageProvider = options.storageProvider || 'r2';
  const storageBucket = String(options.storageBucket || '').trim();
  if (!storageBucket) {
    throw new Error(
      'A dedicated Question Bank storage bucket is required for production resolution.',
    );
  }
  const resolvedAssetByHash = new Map();
  const assetUpdateIds = new Set();
  const newAssetIds = new Set();
  const existingAssetIdsSeen = new Set();
  let newAssetRows = 0;
  let retargetedAssetRows = 0;
  const usedManifestRows = [...normalized.source.usedAssetUrls]
    .map((url) => normalized.source.verifiedAssetByUrl.get(url))
    .filter(Boolean);

  for (const manifestRow of usedManifestRows) {
    const hash = manifestRow.sha256;
    const extension = path.extname(manifestRow.path || '') || '.png';
    const desiredOriginalFilename =
      path.basename(new URL(manifestRow.url).pathname) ||
      `${hash}${extension}`;
    const desiredContentType = manifestRow.contentType || 'image/png';
    const desiredByteSize = Number(manifestRow.bytes || 0);
    const desiredStorageKey =
      `question-bank/assets/sha256/${hash.slice(0, 2)}/${hash}${extension}`;
    let asset = assetByHash.get(hash);
    if (!asset) {
      asset = {
        id: deterministicUuid(`asset:${hash}`),
        content_hash: hash,
        canonical_source_path: manifestRow.path,
        original_filename: desiredOriginalFilename,
        file_extension: extension,
        content_type: desiredContentType,
        byte_size: desiredByteSize,
        storage_provider: storageProvider,
        storage_bucket: storageBucket,
        storage_key: `question-bank/assets/sha256/${hash.slice(0, 2)}/${hash}${extension}`,
        upload_status: 'pending',
        verification_status: 'pending',
        uploaded_at: null,
        verified_at: null,
        last_error: null,
        local_path: localAssetPath(normalized.source.assetRoot, manifestRow),
      };
      rows.assets.push(asset);
      rows.assetUploadCandidates.push(asset);
      assetByHash.set(hash, asset);
      assetUpdateIds.add(asset.id);
      newAssetIds.add(asset.id);
      newAssetRows += 1;
    } else {
      if (!newAssetIds.has(asset.id)) existingAssetIdsSeen.add(asset.id);
      const desiredLocation =
        asset.storage_provider === storageProvider &&
        asset.storage_bucket === storageBucket &&
        asset.storage_key === desiredStorageKey;
      const desiredMetadata =
        asset.canonical_source_path === manifestRow.path &&
        asset.file_extension === extension &&
        asset.content_type === desiredContentType &&
        Number(asset.byte_size) === desiredByteSize;
      if (!desiredLocation || !desiredMetadata) {
        const safePartialExamMateAsset = canRetargetExamMatePartialAsset(
          asset,
          examMateAssetIds,
          options.recoveryBatchId,
        );
        if (!safePartialExamMateAsset) {
          findings.push(
            finding('critical', 'exam_mate_existing_asset_recovery_conflict', {
              assetId: asset.id,
              contentHash: hash,
              currentProvider: asset.storage_provider,
              currentBucket: asset.storage_bucket,
              currentKey: asset.storage_key,
              desiredProvider: storageProvider,
              desiredBucket: storageBucket,
              desiredKey: desiredStorageKey,
              currentContentType: asset.content_type,
              desiredContentType,
              currentByteSize: Number(asset.byte_size),
              desiredByteSize,
              uploadStatus: asset.upload_status,
              verificationStatus: asset.verification_status,
            }),
          );
        } else {
          asset = {
            ...asset,
            canonical_source_path: manifestRow.path,
            original_filename: desiredOriginalFilename,
            file_extension: extension,
            content_type: desiredContentType,
            byte_size: desiredByteSize,
            storage_provider: storageProvider,
            storage_bucket: storageBucket,
            storage_key: desiredStorageKey,
            upload_status: 'pending',
            verification_status: 'pending',
            uploaded_at: null,
            verified_at: null,
            last_error: null,
          };
          if (!assetUpdateIds.has(asset.id)) {
            rows.assets.push(asset);
            assetUpdateIds.add(asset.id);
            retargetedAssetRows += 1;
          }
          assetByHash.set(hash, asset);
        }
      }
    }
    if (asset.verification_status !== 'verified') {
      const localPath = localAssetPath(normalized.source.assetRoot, manifestRow);
      const uploadCandidate = {
        ...asset,
        local_path: localPath,
      };
      if (!rows.assetUploadCandidates.some((candidate) => candidate.id === asset.id)) {
        rows.assetUploadCandidates.push(uploadCandidate);
      }
    }
    resolvedAssetByHash.set(hash, asset);
  }
  if (retargetedAssetRows) {
    findings.push(
      finding('info', 'exam_mate_partial_assets_retargeted', {
        count: retargetedAssetRows,
        storageProvider,
        storageBucket,
        rule: 'exam-mate-provenance-and-unverified-pending-state',
      }),
    );
  }

  const assetSourceByKey = new Map(existingAssetSourceByKey);
  const variantAssetByKey = new Map(existingVariantAssetByKey);
  const resolvedAssetSourceIds = new Set();
  const resolvedAssetSourceQuestionIds = new Map();
  const resolvedVariantAssetKeys = new Set();
  const expectedVariantAssetDetails = new Map();
  for (const [sourceId, data] of sourceQuestionData) {
    const variant = variantBySourceQuestion.get(sourceId);
    const canonicalQuestionId = canonicalQuestionBySourceId.get(sourceId);
    for (const [role, urls] of [
      ['question', data.sourceQuestion.questionImages || []],
      ['markscheme', data.sourceQuestion.answerImages || []],
    ]) {
      for (const [ordinal, url] of urls.entries()) {
        const manifestRow = normalized.source.verifiedAssetByUrl.get(url);
        if (!manifestRow) continue;
        const asset = resolvedAssetByHash.get(manifestRow.sha256) || assetByHash.get(manifestRow.sha256);
        if (!asset) continue;
        const fileId = sourceFileId(data.sourceQuestion, role, ordinal, url);
        const sourceKey = `exam-mate:${sourceId}:${role}:${ordinal}:${url}`;
        const desiredAssetSource = {
          id: deterministicUuid(`exam-mate:asset-source-row:${sourceKey}`),
          asset_id: asset.id,
          source_key: sourceKey,
          source_file_id: fileId,
          source_question_id: canonicalQuestionId,
          original_filename: path.basename(new URL(url).pathname),
          original_source_path: new URL(url).pathname,
          original_source_url: url,
          canonical_normalized_source_path: manifestRow.path,
          source_created_at: null,
          source_updated_at: null,
          source_uploaded_at: manifestRow.capturedAt || null,
        };
        const existingAssetSource = assetSourceByKey.get(sourceKey);
        if (!existingAssetSource) {
          rows.assetSources.push(desiredAssetSource);
          assetSourceByKey.set(sourceKey, desiredAssetSource);
        } else if (
          existingAssetSource.asset_id !== asset.id ||
          existingAssetSource.source_question_id !== canonicalQuestionId
        ) {
          if (
            !canRepairExamMatePartialRow(
              existingAssetSource,
              recoveryBatchId,
            )
          ) {
            findings.push(
              finding(
                'critical',
                'exam_mate_asset_source_repair_not_owned_by_failed_batch',
                {
                  sourceQuestionId: sourceId,
                  assetSourceId: existingAssetSource.id,
                  currentAssetId: existingAssetSource.asset_id,
                  expectedAssetId: asset.id,
                  currentQuestionId:
                    existingAssetSource.source_question_id,
                  expectedQuestionId: canonicalQuestionId,
                },
                data.sourceQuestion,
              ),
            );
          } else {
            const repair = {
              ...desiredAssetSource,
              created_by_batch_id:
                existingAssetSource.created_by_batch_id,
            };
            recoveryPlan.assetSourceUpdates.push(repair);
            assetSourceByKey.set(sourceKey, repair);
          }
        }
        const resolvedAssetSource = assetSourceByKey.get(sourceKey);
        resolvedAssetSourceIds.add(resolvedAssetSource.id);
        resolvedAssetSourceQuestionIds.set(
          resolvedAssetSource.id,
          canonicalQuestionId,
        );
        const variantAssetKey = `${variant.id}\u0000${asset.id}\u0000${role}`;
        resolvedVariantAssetKeys.add(variantAssetKey);
        const desiredVariantAsset = {
          variant_id: variant.id,
          asset_id: asset.id,
          source_file_id: fileId,
          role,
          sort_order: ordinal,
          alt_text:
            role === 'question' ? 'Question image' : 'Markscheme image',
        };
        expectedVariantAssetDetails.set(variantAssetKey, {
          sourceFileId: fileId,
          sortOrder: ordinal,
          altText: desiredVariantAsset.alt_text,
        });
        const existingVariantAsset = variantAssetByKey.get(variantAssetKey);
        if (!existingVariantAsset) {
          variantAssetByKey.set(variantAssetKey, desiredVariantAsset);
          rows.variantAssets.push(desiredVariantAsset);
        } else if (
          existingVariantAsset.source_file_id !== fileId ||
          Number(existingVariantAsset.sort_order) !== ordinal ||
          cleanText(existingVariantAsset.alt_text) !==
            desiredVariantAsset.alt_text
        ) {
          if (
            !canRepairExamMatePartialRow(
              existingVariantAsset,
              recoveryBatchId,
            )
          ) {
            findings.push(
              finding(
                'critical',
                'exam_mate_variant_asset_repair_not_owned_by_failed_batch',
                {
                  sourceQuestionId: sourceId,
                  variantId: variant.id,
                  assetId: asset.id,
                  role,
                  ordinal,
                },
                data.sourceQuestion,
              ),
            );
          } else {
            const repair = {
              ...desiredVariantAsset,
              created_by_batch_id:
                existingVariantAsset.created_by_batch_id,
            };
            recoveryPlan.variantAssetUpdates.push(repair);
            variantAssetByKey.set(variantAssetKey, repair);
          }
        }
      }
    }
  }

  const expectedPaperIds = new Set(
    [...paperByReference.values()].map((row) => row.id),
  );
  const resolvedVariantIds = new Set(
    [...variantBySourceQuestion.values()].map((row) => row.id),
  );
  const repairedVariantIds = new Set(
    recoveryPlan.variantUpdates.map((row) => row.id),
  );
  const nonExamMateVariantIds = new Set(
    existingVariantSources
      .filter((row) => row.provider !== 'exam_mate')
      .map((row) => row.variant_id),
  );
  const blockedStaleVariants = existingVariants.filter(
    (row) =>
      canRepairExamMatePartialRow(row, recoveryBatchId) &&
      !resolvedVariantIds.has(row.id) &&
      nonExamMateVariantIds.has(row.id),
  );
  const staleVariants = existingVariants.filter(
    (row) =>
      canRepairExamMatePartialRow(row, recoveryBatchId) &&
      !resolvedVariantIds.has(row.id) &&
      !nonExamMateVariantIds.has(row.id),
  );
  const staleVariantIds = new Set(staleVariants.map((row) => row.id));
  if (blockedStaleVariants.length) {
    findings.push(
      finding('critical', 'exam_mate_stale_variant_has_external_provenance', {
        staleVariantCount: staleVariants.length,
        blockingVariantCount: blockedStaleVariants.length,
      }),
    );
  } else {
    recoveryPlan.deleteVariants = staleVariants.map((row) => ({
      id: row.id,
      created_by_batch_id: row.created_by_batch_id,
    }));
  }

  const stalePapers = existingPapers.filter(
    (row) =>
      canRepairExamMatePartialRow(row, recoveryBatchId) &&
      !expectedPaperIds.has(row.id),
  );
  const stalePaperIds = new Set(stalePapers.map((row) => row.id));
  const blockedStalePaperVariants = existingVariants.filter(
    (row) =>
      stalePaperIds.has(row.paper_id) &&
      !repairedVariantIds.has(row.id) &&
      !staleVariantIds.has(row.id),
  );
  const blockedStaleVariantPapers = existingVariantPapers.filter(
    (row) =>
      stalePaperIds.has(row.paper_id) &&
      !staleVariantIds.has(row.variant_id) &&
      !canRepairExamMatePartialRow(row, recoveryBatchId),
  );
  const batchPaperIds = new Set(
    existingPapers
      .filter((row) => canRepairExamMatePartialRow(row, recoveryBatchId))
      .map((row) => row.id),
  );
  const unexpectedCoursePapers = existingCoursePapers.filter(
    (row) =>
      batchPaperIds.has(row.paper_id) &&
      !resolvedCoursePaperKeys.has(`${row.course_id}\u0000${row.paper_id}`),
  );
  const blockedUnexpectedCoursePapers = unexpectedCoursePapers.filter(
    (row) =>
      existingVariants.some(
        (variant) =>
          !staleVariantIds.has(variant.id) &&
          !repairedVariantIds.has(variant.id) &&
          variant.course_id === row.course_id &&
          variant.paper_id === row.paper_id,
      ),
  );
  if (
    blockedStalePaperVariants.length ||
    blockedStaleVariantPapers.length ||
    blockedUnexpectedCoursePapers.length
  ) {
    findings.push(
      finding('critical', 'exam_mate_stale_paper_has_unowned_references', {
        stalePaperCount: stalePapers.length,
        blockingVariantCount: blockedStalePaperVariants.length,
        blockingVariantPaperCount: blockedStaleVariantPapers.length,
        blockingCoursePaperCount: blockedUnexpectedCoursePapers.length,
      }),
    );
  } else {
    recoveryPlan.deletePlacements = existingPlacements
      .filter(
        (row) =>
          !staleVariantIds.has(row.variant_id) &&
          canRepairExamMatePartialRow(row, recoveryBatchId) &&
          !resolvedPlacementKeys.has(
            `${row.variant_id}\u0000${row.subtopic_id}`,
          ),
      )
      .map((row) => ({
        variant_id: row.variant_id,
        subtopic_id: row.subtopic_id,
        created_by_batch_id: row.created_by_batch_id,
      }));
    recoveryPlan.deleteVariantAssets = existingVariantAssets
      .filter(
        (row) =>
          !staleVariantIds.has(row.variant_id) &&
          canRepairExamMatePartialRow(row, recoveryBatchId) &&
          !resolvedVariantAssetKeys.has(
            `${row.variant_id}\u0000${row.asset_id}\u0000${row.role}`,
          ),
      )
      .map((row) => ({
        variant_id: row.variant_id,
        asset_id: row.asset_id,
        role: row.role,
        created_by_batch_id: row.created_by_batch_id,
      }));
    recoveryPlan.deleteVariantPapers = existingVariantPapers
      .filter(
        (row) =>
          !staleVariantIds.has(row.variant_id) &&
          canRepairExamMatePartialRow(row, recoveryBatchId) &&
          !resolvedVariantPaperKeys.has(
            `${row.variant_id}\u0000${row.paper_id}`,
          ),
      )
      .map((row) => ({
        variant_id: row.variant_id,
        paper_id: row.paper_id,
        created_by_batch_id: row.created_by_batch_id,
      }));
    recoveryPlan.deleteCoursePapers = existingCoursePapers
      .filter(
        (row) =>
          stalePaperIds.has(row.paper_id) ||
          unexpectedCoursePapers.some(
            (unexpected) =>
              unexpected.course_id === row.course_id &&
              unexpected.paper_id === row.paper_id,
          ),
      )
      .map((row) => ({
        course_id: row.course_id,
        paper_id: row.paper_id,
      }));
    recoveryPlan.deletePapers = stalePapers.map((row) => ({
      id: row.id,
      created_by_batch_id: row.created_by_batch_id,
    }));
  }
  const recoveryOperationCount = Object.values(recoveryPlan).reduce(
    (total, values) => total + values.length,
    0,
  );
  if (recoveryOperationCount) {
    findings.push(
      finding('info', 'exam_mate_partial_batch_reconciliation_planned', {
        recoveryBatchId,
        questionSourceUpdates:
          recoveryPlan.questionSourceUpdates.length,
        variantUpdates: recoveryPlan.variantUpdates.length,
        variantSourceUpdates: recoveryPlan.variantSourceUpdates.length,
        assetSourceUpdates: recoveryPlan.assetSourceUpdates.length,
        variantAssetUpdates:
          recoveryPlan.variantAssetUpdates.length,
        deleteVariants: recoveryPlan.deleteVariants.length,
        deletePlacements: recoveryPlan.deletePlacements.length,
        deleteVariantAssets:
          recoveryPlan.deleteVariantAssets.length,
        deleteVariantPapers:
          recoveryPlan.deleteVariantPapers.length,
        deleteCoursePapers:
          recoveryPlan.deleteCoursePapers.length,
        deletePapers: recoveryPlan.deletePapers.length,
      }),
    );
  }

  const uniqueness = normalizedRowUniqueness(rows);
  findings.push(...uniqueness.findings);
  const resolvedQuestionIds = new Set(canonicalQuestionBySourceId.values());

  const actualCounts = {
    ...normalized.actualCounts,
    newQuestionCores: rows.questions.length,
    reusedQuestionCores: resolvedQuestionIds.size - rows.questions.length,
    resolvedQuestionCores: resolvedQuestionIds.size,
    questionSources: rows.questionSources.length,
    repairedQuestionSources:
      recoveryPlan.questionSourceUpdates.length,
    existingQuestionSources:
      normalized.source.importableQuestions.length - rows.questionSources.length,
    resolvedQuestionSources: normalized.source.importableQuestions.length,
    variants: rows.variants.length,
    repairedVariants: recoveryPlan.variantUpdates.length,
    existingVariants: resolvedVariantIds.size - rows.variants.length,
    resolvedVariants: resolvedVariantIds.size,
    uniqueVariantIds: resolvedVariantIds.size,
    variantSources: rows.variantSources.length,
    repairedVariantSources:
      recoveryPlan.variantSourceUpdates.length,
    existingVariantSources:
      normalized.source.importableQuestions.length - rows.variantSources.length,
    resolvedVariantSources: normalized.source.importableQuestions.length,
    placements: rows.placements.length,
    papers: rows.papers.length,
    assetRows: rows.assets.length,
    newAssetRows,
    existingAssetRows: existingAssetIdsSeen.size,
    retargetedAssetRows,
    resolvedPhysicalAssets: resolvedAssetByHash.size,
    assetSources: rows.assetSources.length,
    repairedAssetSources: recoveryPlan.assetSourceUpdates.length,
    existingAssetSources:
      resolvedAssetSourceIds.size - rows.assetSources.length,
    resolvedAssetSources: resolvedAssetSourceIds.size,
    variantAssets: rows.variantAssets.length,
    repairedVariantAssets:
      recoveryPlan.variantAssetUpdates.length,
    existingVariantAssets:
      resolvedVariantAssetKeys.size - rows.variantAssets.length,
    resolvedVariantAssets: resolvedVariantAssetKeys.size,
    assetUploadCandidates: rows.assetUploadCandidates.length,
    searchDocumentCandidates: normalizedSearchDocuments.counts.inputRows,
    searchDocuments: normalizedSearchDocuments.counts.outputRows,
    searchDocumentsDeduplicated:
      normalizedSearchDocuments.counts.duplicateCandidates,
    searchDocumentExactDuplicates:
      normalizedSearchDocuments.counts.exactDuplicateCandidates,
    searchDocumentMergedDuplicates:
      normalizedSearchDocuments.counts.mergedSearchCandidates,
    searchDocumentMateriallyDivergentGroups:
      normalizedSearchDocuments.counts.materiallyDivergentGroups,
    recoveryDeletedVariants:
      recoveryPlan.deleteVariants.length,
    recoveryDeletedPlacements:
      recoveryPlan.deletePlacements.length,
    recoveryDeletedVariantAssets:
      recoveryPlan.deleteVariantAssets.length,
    recoveryDeletedVariantPapers:
      recoveryPlan.deleteVariantPapers.length,
    recoveryDeletedCoursePapers:
      recoveryPlan.deleteCoursePapers.length,
    recoveryDeletedPapers: recoveryPlan.deletePapers.length,
    normalizedUniqueness: uniqueness.counts,
  };

  const critical = findings.filter((row) => row.severity === 'critical');
  return {
    ...normalized,
    processedAt: new Date().toISOString(),
    actualCounts,
    verificationStatus: critical.length ? 'failed' : 'passed',
    findings,
    rows,
    recoveryPlan,
    productionExpectations: {
      questionSourceIds: [...resolvedQuestionSourceIds].sort(),
      questionSourceQuestionIds: Object.fromEntries(
        [...resolvedQuestionSourceQuestionIds.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      ),
      questionCoreContentHashes: Object.fromEntries(
        [...expectedQuestionCoreHashes.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      ),
      variantSourceIds: [...resolvedVariantSourceIds].sort(),
      variantSourceVariantIds: Object.fromEntries(
        [...resolvedVariantSourceVariantIds.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      ),
      variantSourceKeys: [...resolvedVariantSourceKeys].sort(),
      variantIds: [...resolvedVariantIds].sort(),
      variantQuestionIds: Object.fromEntries(
        [...new Map(
          [...variantBySourceQuestion.values()].map((row) => [
            row.id,
            row.question_id,
          ]),
        ).entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      variantPaperIds: Object.fromEntries(
        [...new Map(
          [...variantBySourceQuestion.values()].map((row) => [
            row.id,
            row.paper_id || null,
          ]),
        ).entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      variantDetails: Object.fromEntries(
        [...variantBySourceQuestion.values()]
          .map((row) => [
            row.id,
            {
              questionId: row.question_id,
              datasetId: row.dataset_id,
              courseId: row.course_id,
              topicId: row.topic_id,
              paperId: row.paper_id || null,
              sourceIndex: Number(row.source_index),
              sourceOccurrence: Number(row.source_occurrence || 0),
              canonicalSourceSubtopicId:
                row.canonical_source_subtopic_id || null,
            },
          ])
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
      placementKeys: [...resolvedPlacementKeys].sort(),
      coursePaperKeys: [...resolvedCoursePaperKeys].sort(),
      variantPaperKeys: [...resolvedVariantPaperKeys].sort(),
      paperIds: [...expectedPaperIds].sort(),
      assetIds: [...new Set(
        [...resolvedAssetByHash.values()].map((row) => row.id),
      )].sort(),
      assetSourceIds: [...resolvedAssetSourceIds].sort(),
      assetSourceQuestionIds: Object.fromEntries(
        [...resolvedAssetSourceQuestionIds.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      ),
      variantAssetKeys: [...resolvedVariantAssetKeys].sort(),
      variantAssetDetails: Object.fromEntries(
        [...expectedVariantAssetDetails.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      ),
    },
  };
}

export function publicExamMateReport(normalized) {
  return {
    importerVersion: normalized.importerVersion,
    archiveIdentifier: normalized.archiveIdentifier,
    archiveSha256: normalized.archiveSha256,
    sourceArchiveSha256: normalized.sourceArchiveSha256,
    sourceChecksumsSha256: normalized.sourceChecksumsSha256,
    optimizationAuditSha256: normalized.optimizationAuditSha256,
    optimizationChecksumsSha256: normalized.optimizationChecksumsSha256,
    optimizationPlanSha256: normalized.optimizationPlanSha256,
    optimizationRowsSha256: normalized.optimizationRowsSha256,
    expectedCounts: normalized.expectedCounts,
    actualCounts: normalized.actualCounts,
    verificationStatus: normalized.verificationStatus,
    findingsBySeverity: normalized.findings.reduce((output, row) => {
      output[row.severity] = (output[row.severity] || 0) + 1;
      return output;
    }, {}),
    findings: normalized.findings.map((row) => ({
      ...row,
      source_reference: null,
      sourceReferenceSha256: row.source_reference
        ? sha256(cleanText(row.source_reference))
        : null,
    })),
    quarantineSample: normalized.source.quarantinedQuestions.slice(0, 20).map((row) => ({
      sourceQuestionId: row.sourceQuestionId,
      referenceSha256: sha256(cleanText(row.reference)),
      subject: row.subject,
      reasons: row.quarantineReasons,
      missingAssetCount: row.missingAssetUrls.length,
    })),
  };
}
