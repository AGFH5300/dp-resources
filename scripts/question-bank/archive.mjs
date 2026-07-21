import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  mkdtemp,
  opendir,
  readFile,
  readdir,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

export const IMPORTER_VERSION = '1.0.0';

export const EXPECTED_ARCHIVE_COUNTS = Object.freeze({
  datasets: 177,
  questionOccurrences: 12_212,
  questionCores: 5_135,
  variants: 12_212,
  topics: 177,
  subtopics: 706,
  authoritativePlacements: 12_895,
  missingLocalPlacements: 2,
  imageManifestRows: 4_769,
  physicalImagePaths: 4_663,
  vimeoUrls: 6_103,
  formulaBookletUrls: 18,
  crossDatasetCanonicalSubtopics: 596,
  blankQuestionOccurrences: 4,
});

const SUBJECTS = {
  biology: 'Biology',
  math: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  business: 'Business Management',
  psychology: 'Psychology',
  economics: 'Economics',
  ess: 'Environmental Systems and Societies',
};

const IMAGE_MIME_TYPES = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function deterministicUuid(value) {
  const bytes = createHash('sha256').update(String(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function titleCaseSlug(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) =>
      ['and', 'of', 'the', 'to'].includes(part.toLowerCase())
        ? part.toLowerCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join(' ');
}

export function courseDescriptor(subjectKey, sourceCourse) {
  const subjectName = SUBJECTS[subjectKey] || titleCaseSlug(subjectKey);
  const level = /(^|-)hl($|-)/i.test(sourceCourse) ? 'HL' : 'SL';
  const syllabus2025 = /-2025$/i.test(sourceCourse);
  let name;

  if (subjectKey === 'math') {
    const track = sourceCourse.replace(/-(?:sl|hl)(?:-2025)?$/i, '');
    name = `${titleCaseSlug(track)} ${level}`;
  } else {
    name = `${subjectName} ${level}`;
  }

  return {
    subject: {
      id: subjectKey,
      slug: subjectKey === 'math' ? 'mathematics' : subjectKey,
      name: subjectName,
    },
    course: {
      id: deterministicUuid(`course:${subjectKey}:${sourceCourse}`),
      source_key: `${subjectKey}:${sourceCourse}`,
      slug: sourceCourse,
      name,
      level,
      syllabus_label: syllabus2025 ? 'First assessment 2025' : 'Legacy syllabus',
    },
  };
}

function safelyDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function canonicalizeSourcePath(value) {
  let candidate = String(value || '').trim().replaceAll('\\', '/');
  try {
    if (/^https?:\/\//i.test(candidate)) candidate = new URL(candidate).pathname;
  } catch {}
  candidate = candidate.split('?')[0].split('#')[0];
  candidate = candidate
    .split('/')
    .map((segment) => safelyDecode(segment))
    .join('/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
  candidate = candidate.replace(
    /^assets\/assets\.revision(?:village|town)\.com\//i,
    '',
  );
  return candidate;
}

export function normalizeSection(value) {
  if (value === null || value === undefined || String(value).trim() === '')
    return null;
  return String(value).trim().replace(/\s+/g, ' ').toUpperCase();
}

function contentHash(question) {
  return sha256(
    JSON.stringify({
      reference: question.reference || '',
      content: question.content || '',
      markScheme: question.markScheme || '',
      maximumMark: Number(question.maximumMark || 0),
      sourceStatus: question.status || '',
    }),
  );
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function* walkFiles(directory) {
  const handle = await opendir(directory);
  for await (const entry of handle) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walkFiles(fullPath);
    else if (entry.isFile() && entry.name !== '.DS_Store') yield fullPath;
  }
}

export async function* readNdjson(filePath) {
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

async function hashFile(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function mapLimit(values, workerCount, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(workerCount, values.length || 1)) }, run),
  );
  return results;
}

async function archiveRootFromExtracted(directory) {
  if (await exists(path.join(directory, 'dataset-catalog.json'))) return directory;
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(directory, entry.name);
    if (await exists(path.join(nested, 'dataset-catalog.json')))
      candidates.push(nested);
  }
  if (candidates.length === 1) return candidates[0];
  return directory;
}

export async function resolveArchiveInput(inputPath) {
  const resolved = path.resolve(inputPath);
  const inputStat = await stat(resolved);
  if (inputStat.isDirectory()) {
    return {
      root: await archiveRootFromExtracted(resolved),
      cleanup: async () => {},
      sourcePath: resolved,
    };
  }
  if (!resolved.toLowerCase().endsWith('.zip'))
    throw new Error('Archive input must be a ZIP file or extracted directory.');

  const destination = await mkdtemp(path.join(tmpdir(), 'dp-qb-archive-'));
  const result = spawnSync('unzip', ['-q', resolved, '-d', destination], {
    encoding: 'utf8',
  });
  if (result.status !== 0)
    throw new Error(`Unable to extract archive: ${result.stderr || result.stdout}`);
  const { rm } = await import('node:fs/promises');
  return {
    root: await archiveRootFromExtracted(destination),
    cleanup: () => rm(destination, { recursive: true, force: true }),
    sourcePath: resolved,
  };
}

async function archiveFingerprint(root) {
  const hash = createHash('sha256');
  for (const name of [
    'summary.json',
    'dataset-catalog.json',
    'all-questions.ndjson',
    'all-topics.ndjson',
    'image-manifest.json',
  ]) {
    const stream = createReadStream(path.join(root, name));
    hash.update(`${name}\0`);
    for await (const chunk of stream) hash.update(chunk);
  }
  return hash.digest('hex');
}

function finding(severity, code, details = {}, source = {}) {
  return {
    id: deterministicUuid(
      `finding:${severity}:${code}:${source.sourceDataset || ''}:${source.sourceQuestionId || ''}:${JSON.stringify(details)}`,
    ),
    severity,
    code,
    source_dataset: source.sourceDataset || null,
    source_question_id: source.sourceQuestionId || null,
    source_reference: source.sourceReference || null,
    details,
  };
}

function imageReferences(source) {
  const references = [];
  const pattern = /!\[([^\]]*)\]\(question:([0-9a-f-]{36})\)/gi;
  let match;
  while ((match = pattern.exec(String(source || '')))) {
    references.push({ fileId: match[2].toLowerCase(), alt: match[1] || null });
  }
  return references;
}

function vimeoVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'player.vimeo.com') return null;
    return parsed.pathname.match(/^\/video\/(\d+)/)?.[1] || null;
  } catch {
    return null;
  }
}

function formulaBooklet(paper) {
  if (!paper?.formulaBooklet) return null;
  if (typeof paper.formulaBooklet === 'string')
    return { url: paper.formulaBooklet, filename: null };
  return {
    url:
      paper.formulaBooklet.url ||
      paper.formulaBooklet.path ||
      paper.formulaBooklet.sourceUrl ||
      null,
    filename: paper.formulaBooklet.filename || null,
  };
}

function expectedFiles(root) {
  return [
    'summary.json',
    'dataset-catalog.json',
    'all-questions.ndjson',
    'all-topics.ndjson',
    'image-manifest.json',
    'image-urls.json',
    'chunk-map.json',
  ].map((name) => path.join(root, name));
}

export async function normalizeArchive(root, options = {}) {
  const workerCount = Math.max(1, Number(options.workers || 6));
  const expectedCounts = options.expectedCounts || EXPECTED_ARCHIVE_COUNTS;
  for (const filePath of expectedFiles(root)) {
    if (!(await exists(filePath)))
      throw new Error(`Archive is missing required file: ${path.basename(filePath)}`);
  }

  const [summary, catalog, imageManifest] = await Promise.all([
    readFile(path.join(root, 'summary.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'dataset-catalog.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'image-manifest.json'), 'utf8').then(JSON.parse),
  ]);
  if (!Array.isArray(catalog) || !Array.isArray(imageManifest))
    throw new Error('Dataset catalog and image manifest must be arrays.');

  const findings = [];
  const subjects = new Map();
  const courses = new Map();
  const datasets = new Map();
  const datasetByFilename = new Map();
  const topics = new Map();
  const subtopics = new Map();
  const questions = new Map();
  const variants = new Map();
  const variantsByQuestion = new Map();
  const variantByDatasetAndQuestion = new Map();
  const occurrenceCountByDatasetQuestionIndex = new Map();
  const papers = new Map();
  const coursePapers = new Map();
  const videos = new Map();
  const variantVideos = new Map();
  const questionRows = [];
  const coreContentHashes = new Map();
  const formulaUrls = new Set();

  for (let index = 0; index < catalog.length; index += 1) {
    const source = catalog[index];
    const descriptor = courseDescriptor(source.subject, source.course);
    subjects.set(descriptor.subject.id, {
      ...descriptor.subject,
      sort_order: Object.keys(SUBJECTS).indexOf(source.subject),
    });
    courses.set(descriptor.course.id, {
      ...descriptor.course,
      subject_id: descriptor.subject.id,
      sort_order: descriptor.course.level === 'SL' ? 0 : 1,
    });
    const dataset = {
      id: deterministicUuid(`dataset:${source.sourceFilename}`),
      course_id: descriptor.course.id,
      source_filename: source.sourceFilename,
      encoded_filename: source.encodedFilename,
      chunk_id: source.chunkId,
      topic_slug: source.topic,
      expected_question_count: source.questionCount,
      expected_subtopic_count: source.subtopicCount,
      source_metadata: { decryptedPath: source.decryptedPath },
      catalog_order: index,
    };
    datasets.set(dataset.id, dataset);
    datasetByFilename.set(source.sourceFilename, dataset);
  }

  let questionOccurrences = 0;
  for await (const row of readNdjson(path.join(root, 'all-questions.ndjson'))) {
    questionOccurrences += 1;
    const dataset = datasetByFilename.get(row._dataset?.sourceFilename);
    if (!dataset)
      throw new Error(`Question references unknown dataset ${row._dataset?.sourceFilename}`);
    const questionId = String(row.id).toLowerCase();
    const hash = contentHash(row);
    const duplicateContentHash = sha256(String(row.content || ''));
    const existing = questions.get(questionId);
    const core = {
      id: questionId,
      reference: String(row.reference || ''),
      content: String(row.content || ''),
      mark_scheme: String(row.markScheme || ''),
      maximum_mark: Number(row.maximumMark || 0),
      source_status: String(row.status || 'unknown'),
      content_hash: hash,
      source_metadata: {},
    };
    if (!existing) questions.set(questionId, core);
    else if (
      existing.content !== core.content ||
      existing.mark_scheme !== core.mark_scheme ||
      existing.maximum_mark !== core.maximum_mark ||
      existing.reference !== core.reference
    ) {
      findings.push(
        finding(
          'warning',
          'repeated_question_core_mismatch',
          { firstHash: existing.content_hash, occurrenceHash: hash },
          {
            sourceDataset: dataset.source_filename,
            sourceQuestionId: questionId,
            sourceReference: core.reference,
          },
        ),
      );
    }

    if (!core.content.trim() && !core.mark_scheme.trim()) {
      findings.push(
        finding(
          'warning',
          'blank_question_occurrence',
          {},
          {
            sourceDataset: dataset.source_filename,
            sourceQuestionId: questionId,
            sourceReference: core.reference,
          },
        ),
      );
    }

    if (!coreContentHashes.has(duplicateContentHash))
      coreContentHashes.set(duplicateContentHash, new Set());
    coreContentHashes.get(duplicateContentHash).add(questionId);

    const paper = row.paper || null;
    if (paper?.id) {
      const booklet = formulaBooklet(paper);
      if (booklet?.url) formulaUrls.add(booklet.url);
      papers.set(String(paper.id).toLowerCase(), {
        id: String(paper.id).toLowerCase(),
        reference: String(paper.reference || ''),
        calculator_allowed:
          typeof paper.calculatorAllowed === 'boolean'
            ? paper.calculatorAllowed
            : null,
        formula_booklet_source_url: booklet?.url || null,
        formula_booklet_filename: booklet?.filename || null,
        formula_booklet_storage_provider: null,
        formula_booklet_storage_bucket: null,
        formula_booklet_storage_key: null,
      });
      const relationKey = `${dataset.course_id}:${paper.id}`;
      coursePapers.set(relationKey, {
        course_id: dataset.course_id,
        paper_id: String(paper.id).toLowerCase(),
      });
    }

    const sectionRaw = row.section === null ? null : String(row.section);
    const sectionNormalized = normalizeSection(row.section);
    if (sectionNormalized && !['A', 'B'].includes(sectionNormalized)) {
      findings.push(
        finding(
          'warning',
          'unusual_section_value',
          { value: sectionRaw },
          {
            sourceDataset: dataset.source_filename,
            sourceQuestionId: questionId,
            sourceReference: core.reference,
          },
        ),
      );
    }

    const occurrenceKey = `${dataset.id}:${questionId}:${Number(row.index || 0)}`;
    const occurrenceNumber = occurrenceCountByDatasetQuestionIndex.get(occurrenceKey) || 0;
    occurrenceCountByDatasetQuestionIndex.set(occurrenceKey, occurrenceNumber + 1);
    const variantId = deterministicUuid(
      `variant:${questionId}:${dataset.source_filename}:${Number(row.index || 0)}:${occurrenceNumber}`,
    );
    const variant = {
      id: variantId,
      question_id: questionId,
      dataset_id: dataset.id,
      course_id: dataset.course_id,
      topic_id: null,
      paper_id: paper?.id ? String(paper.id).toLowerCase() : null,
      source_index: Number(row.index || 0),
      source_occurrence: occurrenceNumber,
      canonical_source_subtopic_id: row.subtopicId
        ? String(row.subtopicId).toLowerCase()
        : null,
      difficulty_value:
        row.difficulty?.value === null || row.difficulty?.value === undefined
          ? null
          : Number(row.difficulty.value),
      difficulty_label: row.difficulty?.difficultyLevel
        ? String(row.difficulty.difficultyLevel).toLowerCase()
        : null,
      section_raw: sectionRaw,
      section_normalized: sectionNormalized,
      calculator_allowed:
        typeof paper?.calculatorAllowed === 'boolean'
          ? paper.calculatorAllowed
          : null,
      source_metadata: {
        sourceFilename: dataset.source_filename,
        canonicalSubtopicId: row.subtopicId || null,
      },
    };
    variants.set(variantId, variant);
    if (!variantsByQuestion.has(questionId)) variantsByQuestion.set(questionId, []);
    variantsByQuestion.get(questionId).push(variant);
    const datasetQuestionKey = `${dataset.id}:${questionId}`;
    if (!variantByDatasetAndQuestion.has(datasetQuestionKey))
      variantByDatasetAndQuestion.set(datasetQuestionKey, []);
    variantByDatasetAndQuestion.get(datasetQuestionKey).push(variant);
    questionRows.push({ row, dataset, variant });

    for (const [solutionIndex, solution] of (row.solutions || []).entries()) {
      const url = String(solution.url || '').trim();
      if (!url) continue;
      const videoId = deterministicUuid(`video:${url}`);
      videos.set(videoId, {
        id: videoId,
        vimeo_url: url,
        vimeo_video_id: vimeoVideoId(url),
        source_hash: solution.hash || null,
      });
      const relationKey = `${variantId}:${videoId}:${solution.name || ''}`;
      variantVideos.set(relationKey, {
        variant_id: variantId,
        video_id: videoId,
        source_file_id: solution.file_id || null,
        part_name: String(solution.name || ''),
        sort_order: solutionIndex,
      });
    }
  }

  for (const [hash, ids] of coreContentHashes) {
    if (ids.size <= 1) continue;
    findings.push(
      finding('info', 'different_source_ids_identical_content', {
        contentHash: hash,
        sourceQuestionIds: [...ids].sort(),
      }),
    );
  }

  const placements = new Map();
  const placedVariantIds = new Set();
  let topicOrder = 0;
  for await (const row of readNdjson(path.join(root, 'all-topics.ndjson'))) {
    const dataset = datasetByFilename.get(row._dataset?.sourceFilename);
    if (!dataset)
      throw new Error(`Topic references unknown dataset ${row._dataset?.sourceFilename}`);
    const topic = {
      id: String(row.id).toLowerCase(),
      dataset_id: dataset.id,
      course_id: dataset.course_id,
      slug: dataset.topic_slug,
      name: titleCaseSlug(dataset.topic_slug),
      sort_order: topicOrder++,
    };
    topics.set(topic.id, topic);

    for (const [subtopicOrder, sourceSubtopic] of (row.subtopics || []).entries()) {
      const subtopic = {
        id: String(sourceSubtopic.id).toLowerCase(),
        topic_id: topic.id,
        course_id: dataset.course_id,
        slug: sourceSubtopic.slug || `subtopic-${subtopicOrder + 1}`,
        name: sourceSubtopic.name || `Subtopic ${subtopicOrder + 1}`,
        code: sourceSubtopic.code || '',
        description: sourceSubtopic.description || '',
        sort_order: Number(sourceSubtopic.index ?? subtopicOrder),
        dataset_id: dataset.id,
      };
      subtopics.set(subtopic.id, subtopic);

      for (const [placementIndex, sourcePlacement] of (
        sourceSubtopic.questions || []
      ).entries()) {
        const variant = variantByDatasetAndQuestion.get(
          `${dataset.id}:${String(sourcePlacement.id).toLowerCase()}`,
        )?.[0];
        if (!variant) {
          findings.push(
            finding(
              'error',
              'placement_question_missing_from_dataset',
              { subtopicId: subtopic.id },
              {
                sourceDataset: dataset.source_filename,
                sourceQuestionId: sourcePlacement.id,
                sourceReference: sourcePlacement.name,
              },
            ),
          );
          continue;
        }
        variant.topic_id = topic.id;
        placedVariantIds.add(variant.id);
        placements.set(`${variant.id}:${subtopic.id}`, {
          variant_id: variant.id,
          subtopic_id: subtopic.id,
          placement_order: Number(sourcePlacement.index ?? placementIndex),
          placement_difficulty:
            sourcePlacement.difficulty === null ||
            sourcePlacement.difficulty === undefined
              ? null
              : Number(sourcePlacement.difficulty),
          is_fallback: false,
          fallback_reason: null,
        });
      }
    }
  }

  let crossDatasetCanonicalSubtopics = 0;
  let fallbackPlacements = 0;
  for (const variant of variants.values()) {
    const datasetTopic = [...topics.values()].find(
      (topic) => topic.dataset_id === variant.dataset_id,
    );
    if (!variant.topic_id) variant.topic_id = datasetTopic?.id || null;
    if (!variant.topic_id)
      throw new Error(`No topic resolved for variant ${variant.id}`);

    const canonicalSubtopic = variant.canonical_source_subtopic_id
      ? subtopics.get(variant.canonical_source_subtopic_id)
      : null;
    if (
      canonicalSubtopic &&
      canonicalSubtopic.dataset_id !== variant.dataset_id
    ) {
      crossDatasetCanonicalSubtopics += 1;
    }
    const missingAllPlacements = !placedVariantIds.has(variant.id);
    const missingLocalCanonicalPlacement = Boolean(
      canonicalSubtopic &&
        canonicalSubtopic.dataset_id === variant.dataset_id &&
        !placements.has(`${variant.id}:${canonicalSubtopic.id}`),
    );
    if (!missingAllPlacements && !missingLocalCanonicalPlacement) continue;
    if (!canonicalSubtopic) {
      findings.push(
        finding('error', 'missing_local_placement_without_canonical_fallback', {
          variantId: variant.id,
          canonicalSubtopicId: variant.canonical_source_subtopic_id,
        }),
      );
      continue;
    }
    fallbackPlacements += 1;
    placements.set(`${variant.id}:${canonicalSubtopic.id}`, {
      variant_id: variant.id,
      subtopic_id: canonicalSubtopic.id,
      placement_order: variant.source_index,
      placement_difficulty: variant.difficulty_value,
      is_fallback: true,
      fallback_reason:
        missingLocalCanonicalPlacement
          ? 'canonical_question_missing_from_local_subtopic_array'
          : 'missing_from_local_subtopic_array_cross_dataset_canonical',
    });
    findings.push(
      finding('warning', 'fallback_placement_created', {
        variantId: variant.id,
        canonicalSubtopicId: canonicalSubtopic.id,
        crossDataset: canonicalSubtopic.dataset_id !== variant.dataset_id,
      }),
    );
  }

  const assetsDirectory = path.join(root, 'assets');
  const physicalPathByCanonical = new Map();
  for await (const filePath of walkFiles(assetsDirectory)) {
    const archiveRelative = path.relative(root, filePath).replaceAll(path.sep, '/');
    physicalPathByCanonical.set(canonicalizeSourcePath(archiveRelative), filePath);
  }

  const physicalEntries = [...physicalPathByCanonical.entries()];
  const hashedPhysical = await mapLimit(
    physicalEntries,
    workerCount,
    async ([canonicalPath, filePath]) => {
      const [hash, fileStat] = await Promise.all([hashFile(filePath), stat(filePath)]);
      const extension = path.extname(filePath).toLowerCase();
      return {
        canonicalPath,
        filePath,
        hash,
        byteSize: fileStat.size,
        extension,
        contentType: IMAGE_MIME_TYPES[extension] || 'image/octet-stream',
      };
    },
  );
  const physicalByCanonical = new Map(
    hashedPhysical.map((entry) => [entry.canonicalPath, entry]),
  );
  const assets = new Map();
  const assetSources = new Map();
  const assetByCanonicalPath = new Map();
  const assetByFileId = new Map();

  for (const manifestRow of imageManifest) {
    const canonicalPath = canonicalizeSourcePath(
      manifestRow.path || manifestRow.url,
    );
    const physical = physicalByCanonical.get(canonicalPath);
    if (!physical) {
      findings.push(
        finding('critical', 'manifest_asset_missing', {
          canonicalPath,
          status: manifestRow.status,
        }),
      );
      continue;
    }
    const assetId = deterministicUuid(`asset:${physical.hash}`);
    const filename = path.basename(physical.filePath);
    const asset = assets.get(assetId) || {
      id: assetId,
      content_hash: physical.hash,
      canonical_source_path: canonicalPath,
      original_filename: filename,
      file_extension: physical.extension || '.bin',
      content_type: physical.contentType,
      byte_size: physical.byteSize,
      storage_provider: options.storageProvider || 'r2',
      storage_bucket: options.storageBucket || 'dp-question-bank',
      storage_key: `question-bank/assets/sha256/${physical.hash.slice(0, 2)}/${physical.hash}${physical.extension}`,
      upload_status: 'pending',
      verification_status: 'pending',
      local_path: physical.filePath,
    };
    assets.set(assetId, asset);
    assetByCanonicalPath.set(canonicalPath, asset);
    const match = canonicalPath.match(
      /^public\/question\/([0-9a-f-]{36})\/images\/([0-9a-f-]{36})\/(.+)$/i,
    );
    const sourceQuestionId = match?.[1]?.toLowerCase() || null;
    const sourceFileId = match?.[2]?.toLowerCase() || null;
    if (sourceFileId) assetByFileId.set(sourceFileId, asset);
    const sourceKey = sha256(
      JSON.stringify({
        url: manifestRow.url || null,
        path: manifestRow.path || null,
        canonicalPath,
      }),
    );
    assetSources.set(sourceKey, {
      id: deterministicUuid(`asset-source:${sourceKey}`),
      asset_id: assetId,
      source_key: sourceKey,
      source_file_id: sourceFileId,
      source_question_id: questions.has(sourceQuestionId)
        ? sourceQuestionId
        : null,
      original_filename: filename,
      original_source_path: String(manifestRow.path || canonicalPath),
      original_source_url: manifestRow.url || null,
      canonical_normalized_source_path: canonicalPath,
      source_created_at: null,
      source_updated_at: null,
      source_uploaded_at: null,
    });
  }

  const variantAssets = new Map();
  const variantAssetPairs = new Set();
  for (const { row, variant } of questionRows) {
    const questionReferences = imageReferences(row.content);
    const markschemeReferences = imageReferences(row.markScheme);
    const referencedFileIds = new Set([
      ...questionReferences.map((entry) => entry.fileId),
      ...markschemeReferences.map((entry) => entry.fileId),
    ]);
    const metadataByFile = new Map(
      (row.images || []).map((image) => [String(image.file_id).toLowerCase(), image]),
    );
    const associations = [
      ...questionReferences.map((reference, index) => ({
        ...reference,
        role: 'question',
        order: index,
      })),
      ...markschemeReferences.map((reference, index) => ({
        ...reference,
        role: 'markscheme',
        order: index,
      })),
    ];
    for (const [index, image] of (row.images || []).entries()) {
      const fileId = String(image.file_id).toLowerCase();
      if (!referencedFileIds.has(fileId))
        associations.push({
          fileId,
          alt: image.filename || row.reference || 'Question image',
          role: 'question',
          order: associations.length + index,
        });
    }

    for (const association of associations) {
      const metadata = metadataByFile.get(association.fileId);
      const metadataAsset = metadata?.path
        ? assetByCanonicalPath.get(canonicalizeSourcePath(metadata.path))
        : null;
      const asset = metadataAsset || assetByFileId.get(association.fileId);
      if (!asset) {
        findings.push(
          finding(
            'error',
            'question_asset_association_missing',
            { fileId: association.fileId, role: association.role },
            {
              sourceDataset: row._dataset?.sourceFilename,
              sourceQuestionId: row.id,
              sourceReference: row.reference,
            },
          ),
        );
        continue;
      }
      const key = `${variant.id}:${asset.id}:${association.role}`;
      if (!variantAssets.has(key))
        variantAssets.set(key, {
          variant_id: variant.id,
          asset_id: asset.id,
          source_file_id: association.fileId,
          role: association.role,
          sort_order: association.order,
          alt_text:
            association.alt || metadata?.filename || `${row.reference} image`,
        });
      variantAssetPairs.add(`${variant.id}:${asset.id}`);
    }
  }

  // Preserve content-discovered files even when source images[] metadata omitted them.
  for (const source of assetSources.values()) {
    if (!source.source_question_id || !source.source_file_id) continue;
    const sourceAsset = assets.get(source.asset_id);
    for (const variant of variantsByQuestion.get(source.source_question_id) || []) {
      if (variantAssetPairs.has(`${variant.id}:${source.asset_id}`)) continue;
      variantAssets.set(`${variant.id}:${source.asset_id}:content_reference`, {
        variant_id: variant.id,
        asset_id: source.asset_id,
        source_file_id: source.source_file_id,
        role: 'content_reference',
        sort_order: 9999,
        alt_text: `${questions.get(source.source_question_id)?.reference || 'Question'} image`,
      });
      variantAssetPairs.add(`${variant.id}:${source.asset_id}`);
    }
  }

  const searchDocuments = [];
  for (const variant of variants.values()) {
    const question = questions.get(variant.question_id);
    const course = courses.get(variant.course_id);
    const subject = subjects.get(course.subject_id);
    const topic = topics.get(variant.topic_id);
    const paper = variant.paper_id ? papers.get(variant.paper_id) : null;
    const placedSubtopics = [...placements.values()]
      .filter((placement) => placement.variant_id === variant.id)
      .map((placement) => subtopics.get(placement.subtopic_id)?.name)
      .filter(Boolean);
    searchDocuments.push({
      variant_id: variant.id,
      search_text: [
        question.reference,
        question.content,
        subject.name,
        course.name,
        course.syllabus_label,
        topic.name,
        ...placedSubtopics,
        paper?.reference,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  const actualCounts = {
    datasets: datasets.size,
    questionOccurrences,
    questionCores: questions.size,
    variants: variants.size,
    topics: topics.size,
    subtopics: subtopics.size,
    authoritativePlacements: [...placements.values()].filter(
      (placement) => !placement.is_fallback,
    ).length,
    fallbackPlacements,
    missingLocalPlacements: fallbackPlacements,
    storedPlacementRows: placements.size,
    imageManifestRows: imageManifest.length,
    physicalImagePaths: physicalEntries.length,
    contentDeduplicatedAssets: assets.size,
    assetSourceAssociations: assetSources.size,
    variantAssetAssociations: variantAssets.size,
    vimeoUrls: videos.size,
    variantVideoAssociations: variantVideos.size,
    formulaBookletUrls: formulaUrls.size,
    crossDatasetCanonicalSubtopics,
    blankQuestionOccurrences: findings.filter(
      (item) => item.code === 'blank_question_occurrence',
    ).length,
  };

  const criticalMismatches = [];
  for (const [key, expected] of Object.entries(expectedCounts)) {
    const actual = actualCounts[key];
    if (actual !== expected)
      criticalMismatches.push({ key, expected, actual: actual ?? null });
  }
  for (const mismatch of criticalMismatches)
    findings.push(finding('critical', 'verified_count_mismatch', mismatch));
  const criticalFindings = findings.filter((item) => item.severity === 'critical');

  return {
    importerVersion: IMPORTER_VERSION,
    archiveIdentifier: path.basename(root),
    archiveSha256: await archiveFingerprint(root),
    processedAt: new Date().toISOString(),
    summary,
    expectedCounts,
    actualCounts,
    verificationStatus: criticalFindings.length ? 'failed' : 'passed',
    findings,
    rows: {
      subjects: [...subjects.values()],
      courses: [...courses.values()],
      datasets: [...datasets.values()].map(({ catalog_order, ...row }) => row),
      topics: [...topics.values()],
      subtopics: [...subtopics.values()].map(({ dataset_id, ...row }) => row),
      papers: [...papers.values()],
      coursePapers: [...coursePapers.values()],
      questions: [...questions.values()],
      variants: [...variants.values()],
      placements: [...placements.values()],
      assets: [...assets.values()],
      assetSources: [...assetSources.values()],
      variantAssets: [...variantAssets.values()],
      videos: [...videos.values()],
      variantVideos: [...variantVideos.values()],
      searchDocuments,
    },
  };
}

export function publicAuditReport(normalized) {
  return {
    importerVersion: normalized.importerVersion,
    archiveIdentifier: normalized.archiveIdentifier,
    archiveSha256: normalized.archiveSha256,
    processedAt: normalized.processedAt,
    expectedCounts: normalized.expectedCounts,
    actualCounts: normalized.actualCounts,
    verificationStatus: normalized.verificationStatus,
    findings: normalized.findings,
  };
}
