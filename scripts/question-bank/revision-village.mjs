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

export const REVISION_VILLAGE_IMPORTER_VERSION = 'revision-village-1.0.0';
export const REVISION_VILLAGE_ARCHIVE_SHA256 =
  'fc93fd8129ba7e945e11249c12fba08c565b2923074413a5835ce8935dafa5e9';

const EXPECTED = Object.freeze({
  uniqueQuestions: 2_369,
  questionOccurrences: 4_957,
  paperDefinitions: 60,
  logicalVariants: 4_308,
  directAssets: 2_121,
  audioAssets: 89,
  solutionVideoAssociations: 2_119,
  warningFindings: 5,
  criticalFindings: 0,
});

const SUBJECTS = Object.freeze({
  'ib-biology': {
    id: 'biology',
    slug: 'biology',
    name: 'Biology',
    sortOrder: 0,
  },
  'ib-math': {
    id: 'math',
    slug: 'mathematics',
    name: 'Mathematics',
    sortOrder: 1,
  },
  'ib-physics': {
    id: 'physics',
    slug: 'physics',
    name: 'Physics',
    sortOrder: 2,
  },
  'ib-chemistry': {
    id: 'chemistry',
    slug: 'chemistry',
    name: 'Chemistry',
    sortOrder: 3,
  },
  'ib-business': {
    id: 'business',
    slug: 'business',
    name: 'Business Management',
    sortOrder: 4,
  },
  'ib-psychology': {
    id: 'psychology',
    slug: 'psychology',
    name: 'Psychology',
    sortOrder: 5,
  },
  'ib-economics': {
    id: 'economics',
    slug: 'economics',
    name: 'Economics',
    sortOrder: 6,
  },
  'ib-ess': {
    id: 'ess',
    slug: 'ess',
    name: 'Environmental Systems and Societies',
    sortOrder: 7,
  },
  'ib-history': {
    id: 'history',
    slug: 'history',
    name: 'History',
    sortOrder: 12,
  },
  'ib-english-b': {
    id: 'english-b',
    slug: 'english-b',
    name: 'English B',
    sortOrder: 14,
  },
  'ib-french-b': {
    id: 'french-b',
    slug: 'french-b',
    name: 'French B',
    sortOrder: 15,
  },
  'ib-spanish-b': {
    id: 'spanish-b',
    slug: 'spanish-b',
    name: 'Spanish B',
    sortOrder: 16,
  },
});

const DIRECT_ROLE_MAP = Object.freeze({
  question: 'question',
  markscheme: 'markscheme',
  source_image: 'source_image',
  question_part: 'question_part',
  audio: 'audio',
  formula_booklet: 'formula_booklet',
  question_external_inline: 'content_reference',
  markscheme_external_inline: 'content_reference',
});

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

async function* walk(directory) {
  const handle = await opendir(directory);
  for await (const entry of handle) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile()) yield fullPath;
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
    throw new Error('Unable to identify the Revision Village archive root.');
  }
  return candidates[0];
}

export async function resolveRevisionVillageArchive(inputPath) {
  const resolved = path.resolve(inputPath);
  const inputStat = await stat(resolved);
  if (inputStat.isDirectory()) {
    return {
      root: await archiveRootFromExtracted(resolved),
      sourcePath: resolved,
      sourceSha256: null,
      cleanup: async () => {},
    };
  }
  if (!resolved.toLowerCase().endsWith('.zip')) {
    throw new Error('Revision Village input must be a ZIP or extracted directory.');
  }
  const digest = await hashFile(resolved);
  if (digest !== REVISION_VILLAGE_ARCHIVE_SHA256) {
    throw new Error(
      `Revision Village archive SHA-256 mismatch: expected ${REVISION_VILLAGE_ARCHIVE_SHA256}, received ${digest}.`,
    );
  }
  const destination = await mkdtemp(path.join(tmpdir(), 'dp-rv-qb-'));
  const result = spawnSync('unzip', ['-q', resolved, '-d', destination], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Unable to extract Revision Village archive: ${result.stderr}`);
  }
  return {
    root: await archiveRootFromExtracted(destination),
    sourcePath: resolved,
    sourceSha256: digest,
    cleanup: () => rm(destination, { recursive: true, force: true }),
  };
}

async function verifyChecksums(root) {
  const checksumPath = path.join(root, 'checksums.sha256');
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
    const filePath = path.join(root, ...row.relative.split('/'));
    if (!(await exists(filePath))) {
      throw new Error(`Checksummed file is missing: ${row.relative}`);
    }
    const digest = await hashFile(filePath);
    if (digest !== row.sha256) {
      throw new Error(`Checksum mismatch for ${row.relative}.`);
    }
    verified += 1;
  }
  return verified;
}

function cleanText(value) {
  return String(value ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function strictQuestionSignature(question) {
  return sha256(
    JSON.stringify({
      reference: cleanText(question.reference),
      content: cleanText(question.content ?? question.markdownContent),
      markScheme: cleanText(question.markScheme ?? question.mark_scheme),
      maximumMark: Number(question.maximumMark ?? question.maximum_mark ?? 0),
    }),
  );
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  );
}

function sourceFileId(value, seed) {
  return validUuid(value) ? String(value).toLowerCase() : deterministicUuid(seed);
}

function titleCaseSlug(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (['and', 'of', 'the', 'to', 'in', 'a', 'an'].includes(lower)) return lower;
      if (['dna', 'rna', 'hl', 'sl', 'ib'].includes(lower)) return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

function normalizedCourseSlug(subjectGroup, sourceCourse) {
  if (
    ['ib-biology', 'ib-chemistry', 'ib-physics'].includes(subjectGroup) &&
    ['sl', 'hl'].includes(sourceCourse)
  ) {
    return `${sourceCourse}-2025`;
  }
  if (subjectGroup === 'ib-ess' && ['sl', 'hl'].includes(sourceCourse)) {
    return `${sourceCourse}-2026`;
  }
  return sourceCourse;
}

function syllabusLabel(subjectGroup, courseSlug) {
  if (/-2028$/i.test(courseSlug)) return 'First assessment 2028';
  if (/-2027$/i.test(courseSlug)) return 'First assessment 2027';
  if (/-2026$/i.test(courseSlug)) return 'First assessment 2026';
  if (/-2025$/i.test(courseSlug)) return 'First assessment 2025';
  if (['ib-english-b', 'ib-french-b', 'ib-spanish-b'].includes(subjectGroup)) {
    return 'Current syllabus';
  }
  return 'Legacy syllabus';
}

export function courseDescriptor(subjectGroup, sourceCourse) {
  const subject = SUBJECTS[subjectGroup];
  if (!subject) throw new Error(`Unsupported Revision Village subject group: ${subjectGroup}`);
  const slug = normalizedCourseSlug(subjectGroup, sourceCourse);
  const level = /(^|-)hl($|-)/i.test(slug) ? 'HL' : 'SL';
  const sourceKey = `${subject.id}:${slug}`;
  let name;
  if (subject.id === 'math') {
    name = `${titleCaseSlug(slug.replace(/-(?:sl|hl)(?:-\d{4})?$/i, ''))} ${level}`;
  } else {
    name = `${subject.name} ${level}`;
  }
  return {
    subject: {
      id: subject.id,
      slug: subject.slug,
      name: subject.name,
      sort_order: subject.sortOrder,
    },
    course: {
      id: deterministicUuid(`course:${subject.id}:${slug}`),
      subject_id: subject.id,
      source_key: sourceKey,
      slug,
      name,
      level,
      syllabus_label: syllabusLabel(subjectGroup, slug),
      sort_order: level === 'SL' ? 0 : 1,
    },
  };
}

function sourceFinding(severity, code, details = {}, source = {}) {
  return {
    id: deterministicUuid(
      `revision-village-finding:${severity}:${code}:${source.questionId || ''}:${JSON.stringify(details)}`,
    ),
    severity,
    code,
    source_dataset: source.dataset || null,
    source_question_id: validUuid(source.questionId)
      ? String(source.questionId).toLowerCase()
      : null,
    source_reference: source.reference || null,
    details,
  };
}

function assetExtension(bundlePath, contentType) {
  const extension = path.extname(bundlePath || '').toLowerCase();
  if (extension) return extension;
  return (
    {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/avif': '.avif',
      'image/x-icon': '.ico',
      'application/pdf': '.pdf',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/mp4': '.m4a',
      'audio/ogg': '.ogg',
    }[contentType] || '.bin'
  );
}

function originalFilename(record) {
  if (record.sourceFilename) return String(record.sourceFilename);
  try {
    const name = decodeURIComponent(new URL(record.url).pathname.split('/').at(-1));
    if (name) return name;
  } catch {}
  return path.basename(record.bundlePath || `asset${assetExtension(record.bundlePath, record.contentType)}`);
}

function buildPhysicalAssets(root, assetManifest, audioManifest) {
  const physicalByHash = new Map();
  const sourceRowsByHash = new Map();
  for (const record of [...assetManifest, ...audioManifest]) {
    const contentHash = String(record.sha256 || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(contentHash)) {
      throw new Error('Asset manifest contains an invalid SHA-256 value.');
    }
    const bundlePath = String(record.bundlePath || '').replaceAll('\\', '/');
    if (!bundlePath.startsWith('assets/sha256/')) {
      throw new Error(`Unsafe asset bundle path: ${bundlePath}`);
    }
    const localPath = path.join(root, ...bundlePath.split('/'));
    const extension = assetExtension(bundlePath, record.contentType);
    const contentType = String(record.contentType || 'application/octet-stream');
    if (!physicalByHash.has(contentHash)) {
      physicalByHash.set(contentHash, {
        sourceHash: contentHash,
        localPath,
        bundlePath,
        extension,
        contentType,
        byteSize: Number(record.bytes || 0),
        originalFilename: originalFilename(record),
      });
    }
    if (!sourceRowsByHash.has(contentHash)) sourceRowsByHash.set(contentHash, []);
    sourceRowsByHash.get(contentHash).push(record);
  }
  return { physicalByHash, sourceRowsByHash };
}

function buildSourceSubtopicLookup(questions) {
  const lookup = new Map();
  for (const question of questions) {
    for (const placement of question.placements || []) {
      if (!placement.subtopic || !placement.subtopicId) continue;
      const descriptor = courseDescriptor(placement.subjectGroup, placement.course);
      lookup.set(
        `${descriptor.course.source_key}\u0000${placement.topic}\u0000${String(placement.subtopicId).toLowerCase()}`,
        placement.subtopic,
      );
    }
  }
  return lookup;
}

function buildLogicalVariantSources(questions) {
  const sourceSubtopicLookup = buildSourceSubtopicLookup(questions);
  const groups = new Map();

  for (const question of questions) {
    for (const placement of question.placements || []) {
      const descriptor = courseDescriptor(placement.subjectGroup, placement.course);
      const key = `${question.id}\u0000${descriptor.course.source_key}\u0000${placement.topic}`;
      if (!groups.has(key)) {
        groups.set(key, {
          sourceQuestionId: String(question.id).toLowerCase(),
          question,
          descriptor,
          sourceCourse: placement.course,
          subjectGroup: placement.subjectGroup,
          topicSlug: placement.topic,
          placements: [],
          subtopicSlugs: new Set(),
          sourceSubtopicIds: new Set(),
        });
      }
      const group = groups.get(key);
      group.placements.push(placement);
      if (placement.subtopic) group.subtopicSlugs.add(placement.subtopic);
      if (placement.subtopicId) group.sourceSubtopicIds.add(String(placement.subtopicId).toLowerCase());
      for (const sourceSubtopicId of placement.allSubtopicsForQuestion || []) {
        const id = String(sourceSubtopicId).toLowerCase();
        group.sourceSubtopicIds.add(id);
        const slug = sourceSubtopicLookup.get(
          `${descriptor.course.source_key}\u0000${placement.topic}\u0000${id}`,
        );
        if (slug) group.subtopicSlugs.add(slug);
      }
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    subtopicSlugs: [...group.subtopicSlugs].sort(),
    sourceSubtopicIds: [...group.sourceSubtopicIds].sort(),
    sourceIndex: Math.min(
      ...group.placements.map((placement) => Number(placement.sourceIndex || 0)),
    ),
  }));
}

export async function normalizeRevisionVillageArchive(root) {
  const required = [
    'summary.json',
    'findings.json',
    'checksums.sha256',
    'asset-manifest.json',
    'audio-manifest.json',
    'question-bank/unique-questions.ndjson',
    'question-bank/question-occurrences.ndjson',
    'question-bank/asset-associations.ndjson',
    'question-bank/solution-videos.ndjson',
    'question-bank/papers.json',
  ];
  for (const relative of required) {
    if (!(await exists(path.join(root, ...relative.split('/'))))) {
      throw new Error(`Revision Village archive is missing ${relative}.`);
    }
  }

  const checksummedFiles = await verifyChecksums(root);
  const [summary, sourceFindings, assetManifest, audioManifest, papers] =
    await Promise.all([
      readFile(path.join(root, 'summary.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'findings.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'asset-manifest.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'audio-manifest.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'question-bank', 'papers.json'), 'utf8').then(JSON.parse),
    ]);
  const [questions, occurrences, associations, solutionVideos] = await Promise.all([
    readAllNdjson(path.join(root, 'question-bank', 'unique-questions.ndjson')),
    readAllNdjson(path.join(root, 'question-bank', 'question-occurrences.ndjson')),
    readAllNdjson(path.join(root, 'question-bank', 'asset-associations.ndjson')),
    readAllNdjson(path.join(root, 'question-bank', 'solution-videos.ndjson')),
  ]);

  const logicalVariants = buildLogicalVariantSources(questions);
  const { physicalByHash, sourceRowsByHash } = buildPhysicalAssets(
    root,
    assetManifest,
    audioManifest,
  );

  const findings = sourceFindings.map((finding) =>
    sourceFinding(
      finding.severity || 'warning',
      finding.code || 'source_finding',
      finding,
      {
        questionId: finding.questionId,
        reference: finding.reference,
      },
    ),
  );

  const actualCounts = {
    uniqueQuestions: questions.length,
    questionOccurrences: occurrences.length,
    paperDefinitions: papers.length,
    logicalVariants: logicalVariants.length,
    directAssets: assetManifest.length,
    audioAssets: audioManifest.length,
    uniquePhysicalAssets: physicalByHash.size,
    assetAssociations: associations.length,
    solutionVideoAssociations: solutionVideos.length,
    warningFindings: findings.filter((finding) => finding.severity === 'warning').length,
    criticalFindings: findings.filter((finding) => finding.severity === 'critical').length,
    checksummedFiles,
  };

  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (actualCounts[key] !== expected) {
      findings.push(
        sourceFinding('critical', 'revision_village_count_mismatch', {
          key,
          expected,
          actual: actualCounts[key],
        }),
      );
    }
  }
  if (summary.verificationStatus !== 'passed') {
    findings.push(
      sourceFinding('critical', 'source_bundle_not_verified', {
        verificationStatus: summary.verificationStatus,
      }),
    );
  }

  for (const physical of physicalByHash.values()) {
    const fileStat = await stat(physical.localPath);
    const digest = await hashFile(physical.localPath);
    if (digest !== physical.sourceHash || fileStat.size !== physical.byteSize) {
      findings.push(
        sourceFinding('critical', 'physical_asset_verification_failed', {
          bundlePath: physical.bundlePath,
          expectedHash: physical.sourceHash,
          actualHash: digest,
          expectedBytes: physical.byteSize,
          actualBytes: fileStat.size,
        }),
      );
    }
  }

  const critical = findings.filter((finding) => finding.severity === 'critical');
  return {
    importerVersion: REVISION_VILLAGE_IMPORTER_VERSION,
    archiveIdentifier: 'revision-village-audited-media-20260727T104233',
    archiveSha256: REVISION_VILLAGE_ARCHIVE_SHA256,
    processedAt: new Date().toISOString(),
    expectedCounts: EXPECTED,
    actualCounts,
    verificationStatus: critical.length ? 'failed' : 'passed',
    findings,
    source: {
      root,
      summary,
      questions,
      occurrences,
      associations,
      solutionVideos,
      papers,
      assetManifest,
      audioManifest,
      logicalVariants,
      physicalByHash,
      sourceRowsByHash,
    },
  };
}

async function fetchAll(client, table, columns, orderColumn = 'id') {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function mapBy(rows, key) {
  return new Map(rows.map((row) => [key(row), row]));
}

function setBy(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!result.has(value)) result.set(value, []);
    result.get(value).push(row);
  }
  return result;
}

function nextFreeOccurrence(existingTupleCounts, questionId, datasetId, sourceIndex) {
  const key = `${questionId}\u0000${datasetId}\u0000${sourceIndex}`;
  const next = existingTupleCounts.get(key) || 0;
  existingTupleCounts.set(key, next + 1);
  return next;
}

function sourceQuestionUrl(question) {
  return Array.isArray(question.routes) && question.routes.length
    ? question.routes[0]
    : question.route || null;
}

function stableQuestionStatus(question) {
  return question.status === 'published'
    ? 'revision_village_import_ready'
    : `revision_village_${String(question.status || 'unknown')}`;
}

function paperSignature(paper) {
  return `${cleanText(paper.reference)}\u0000${String(paper.calculator_allowed)}`;
}

export async function resolveRevisionVillageForProduction(normalized, client, options = {}) {
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
    existingVideos,
    existingQuestionSources,
    existingVariantSources,
  ] = await Promise.all([
    fetchAll(client, 'dp_qb_subjects', 'id,slug,name,sort_order'),
    fetchAll(
      client,
      'dp_qb_courses',
      'id,subject_id,source_key,slug,name,level,syllabus_label,sort_order',
    ),
    fetchAll(
      client,
      'dp_qb_datasets',
      'id,course_id,source_filename,encoded_filename,chunk_id,topic_slug,expected_question_count,expected_subtopic_count,source_metadata',
    ),
    fetchAll(client, 'dp_qb_topics', 'id,dataset_id,course_id,slug,name,sort_order'),
    fetchAll(client, 'dp_qb_subtopics', 'id,topic_id,course_id,slug,name,code,description,sort_order'),
    fetchAll(
      client,
      'dp_qb_questions',
      'id,reference,content,mark_scheme,maximum_mark,source_status,content_hash,source_metadata',
    ),
    fetchAll(
      client,
      'dp_qb_question_variants',
      'id,question_id,dataset_id,course_id,topic_id,paper_id,source_index,source_occurrence,canonical_source_subtopic_id,difficulty_value,difficulty_label,section_raw,section_normalized,calculator_allowed,source_metadata',
    ),
    fetchAll(
      client,
      'dp_qb_papers',
      'id,reference,calculator_allowed,formula_booklet_source_url,formula_booklet_filename,formula_booklet_storage_provider,formula_booklet_storage_bucket,formula_booklet_storage_key,source_metadata',
    ),
    fetchAll(
      client,
      'dp_qb_assets',
      'id,content_hash,canonical_source_path,original_filename,file_extension,content_type,byte_size,storage_provider,storage_bucket,storage_key,upload_status,verification_status',
    ),
    fetchAll(
      client,
      'dp_qb_solution_videos',
      'id,vimeo_url,vimeo_video_id,source_hash,provider,provider_video_id,source_url,source_metadata',
    ),
    fetchAll(client, 'dp_qb_question_sources', 'id,provider,source_question_id,question_id'),
    fetchAll(
      client,
      'dp_qb_variant_sources',
      'id,provider,source_question_id,source_course,source_topic,variant_id',
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
    audioAssets: [],
    paperAssets: [],
    videos: [],
    variantVideos: [],
    searchDocuments: [],
    assetUploadCandidates: [],
  };

  const subjectById = mapBy(existingSubjects, (row) => row.id);
  const courseBySourceKey = mapBy(existingCourses, (row) => row.source_key);
  const datasetById = mapBy(existingDatasets, (row) => row.id);
  const topicByCourseSlug = mapBy(
    existingTopics,
    (row) => `${row.course_id}\u0000${row.slug}`,
  );
  const subtopicByTopicSlug = mapBy(
    existingSubtopics,
    (row) => `${row.topic_id}\u0000${row.slug}`,
  );
  const existingQuestionById = mapBy(existingQuestions, (row) => row.id);
  const existingQuestionsBySignature = setBy(existingQuestions, strictQuestionSignature);
  const existingVariantByQuestionCourseTopic = setBy(
    existingVariants,
    (row) => `${row.question_id}\u0000${row.course_id}\u0000${row.topic_id}`,
  );
  const existingVariantTupleCounts = new Map();
  for (const variant of existingVariants) {
    const key = `${variant.question_id}\u0000${variant.dataset_id}\u0000${variant.source_index}`;
    existingVariantTupleCounts.set(
      key,
      Math.max(existingVariantTupleCounts.get(key) || 0, Number(variant.source_occurrence) + 1),
    );
  }
  const existingPaperById = mapBy(existingPapers, (row) => row.id);
  const assetByHash = mapBy(existingAssets, (row) => row.content_hash);
  const videoByProviderId = mapBy(
    existingVideos.filter((row) => row.provider_video_id),
    (row) => `${row.provider}\u0000${row.provider_video_id}`,
  );
  const questionSourceByKey = mapBy(
    existingQuestionSources,
    (row) => `${row.provider}\u0000${row.source_question_id}`,
  );
  const variantSourceByKey = mapBy(
    existingVariantSources,
    (row) =>
      `${row.provider}\u0000${row.source_question_id}\u0000${row.source_course}\u0000${row.source_topic}`,
  );

  const resolvedCourseBySourceKey = new Map();
  function ensureCourse(descriptor) {
    let subject = subjectById.get(descriptor.subject.id);
    if (!subject) {
      subject = descriptor.subject;
      subjectById.set(subject.id, subject);
      rows.subjects.push(subject);
    }
    let course = courseBySourceKey.get(descriptor.course.source_key);
    if (!course) {
      course = descriptor.course;
      courseBySourceKey.set(course.source_key, course);
      rows.courses.push(course);
    }
    resolvedCourseBySourceKey.set(course.source_key, course);
    return course;
  }

  for (const logical of normalized.source.logicalVariants) ensureCourse(logical.descriptor);

  const topicRowsByKey = new Map();
  let nextTopicOrder = Math.max(-1, ...existingTopics.map((row) => Number(row.sort_order))) + 1;
  function ensureTopic(course, topicSlug) {
    const key = `${course.id}\u0000${topicSlug}`;
    let topic = topicByCourseSlug.get(key) || topicRowsByKey.get(key);
    if (topic) return topic;
    const datasetId = deterministicUuid(
      `revision-village:dataset:${course.source_key}:${topicSlug}`,
    );
    let dataset = datasetById.get(datasetId);
    if (!dataset) {
      dataset = {
        id: datasetId,
        course_id: course.id,
        source_filename: `revision-village:${course.source_key}:${topicSlug}`,
        encoded_filename: encodeURIComponent(`revision-village:${course.source_key}:${topicSlug}`),
        chunk_id: 0,
        topic_slug: topicSlug,
        expected_question_count: 0,
        expected_subtopic_count: 0,
        source_metadata: {
          provider: 'Revision Village',
          sourceCourse: course.source_key,
          sourceTopic: topicSlug,
        },
      };
      datasetById.set(dataset.id, dataset);
      rows.datasets.push(dataset);
    }
    topic = {
      id: deterministicUuid(`revision-village:topic:${course.id}:${topicSlug}`),
      dataset_id: dataset.id,
      course_id: course.id,
      slug: topicSlug,
      name: titleCaseSlug(topicSlug),
      sort_order: nextTopicOrder++,
    };
    topicByCourseSlug.set(key, topic);
    topicRowsByKey.set(key, topic);
    rows.topics.push(topic);
    return topic;
  }

  const createdSubtopicsByKey = new Map();
  function ensureSubtopic(course, topic, subtopicSlug, sortOrder) {
    const key = `${topic.id}\u0000${subtopicSlug}`;
    let subtopic = subtopicByTopicSlug.get(key) || createdSubtopicsByKey.get(key);
    if (subtopic) return subtopic;
    subtopic = {
      id: deterministicUuid(`revision-village:subtopic:${topic.id}:${subtopicSlug}`),
      topic_id: topic.id,
      course_id: course.id,
      slug: subtopicSlug,
      name: subtopicSlug === 'uncategorized' ? 'Uncategorized' : titleCaseSlug(subtopicSlug),
      code: '',
      description: '',
      sort_order: sortOrder,
    };
    subtopicByTopicSlug.set(key, subtopic);
    createdSubtopicsByKey.set(key, subtopic);
    rows.subtopics.push(subtopic);
    return subtopic;
  }

  const canonicalQuestionBySourceId = new Map();
  for (const sourceQuestion of normalized.source.questions) {
    const sourceId = String(sourceQuestion.id).toLowerCase();
    const signature = strictQuestionSignature(sourceQuestion);
    const sameId = existingQuestionById.get(sourceId);
    let canonicalId;
    if (sameId && strictQuestionSignature(sameId) === signature) {
      canonicalId = sameId.id;
    } else {
      const exactMatches = existingQuestionsBySignature.get(signature) || [];
      if (exactMatches.length) {
        canonicalId = [...exactMatches].sort((a, b) => a.id.localeCompare(b.id))[0].id;
        findings.push(
          sourceFinding('info', 'question_core_reused_by_exact_content', {
            sourceQuestionId: sourceId,
            canonicalQuestionId: canonicalId,
            matchCount: exactMatches.length,
          }, { questionId: sourceId, reference: sourceQuestion.reference }),
        );
      } else if (!sameId) {
        canonicalId = sourceId;
      } else {
        canonicalId = deterministicUuid(`revision-village:question:${sourceId}:${signature}`);
        findings.push(
          sourceFinding('warning', 'source_question_uuid_collision', {
            sourceQuestionId: sourceId,
            existingQuestionId: sameId.id,
            importedQuestionId: canonicalId,
          }, { questionId: sourceId, reference: sourceQuestion.reference }),
        );
      }
    }
    canonicalQuestionBySourceId.set(sourceId, canonicalId);
    if (!existingQuestionById.has(canonicalId)) {
      const row = {
        id: canonicalId,
        reference: cleanText(sourceQuestion.reference),
        content: cleanText(sourceQuestion.content),
        mark_scheme: cleanText(sourceQuestion.markScheme),
        examiner_report: '',
        maximum_mark: Number(sourceQuestion.maximumMark || 0),
        source_status: stableQuestionStatus(sourceQuestion),
        content_hash: signature,
        source_metadata: {
          provider: 'Revision Village',
          sourceQuestionId: sourceId,
          sourceSubjectId: sourceQuestion.subjectId || null,
          sourceType: sourceQuestion.type || null,
          answerParts: sourceQuestion.parts || [],
          noteFileIds: sourceQuestion.noteFileIds || [],
        },
      };
      rows.questions.push(row);
      existingQuestionById.set(canonicalId, row);
      if (!existingQuestionsBySignature.has(signature)) existingQuestionsBySignature.set(signature, []);
      existingQuestionsBySignature.get(signature).push(row);
    }

    const sourceKey = `revision_village\u0000${sourceId}`;
    if (!questionSourceByKey.has(sourceKey)) {
      rows.questionSources.push({
        id: deterministicUuid(`revision-village:question-source:${sourceId}`),
        question_id: canonicalId,
        provider: 'revision_village',
        source_question_id: sourceId,
        source_subject_id: sourceQuestion.subjectId || null,
        source_reference: cleanText(sourceQuestion.reference),
        source_url: sourceQuestionUrl(sourceQuestion),
        source_metadata: {
          subjectGroup: sourceQuestion.subjectGroup,
          course: sourceQuestion.course,
          topic: sourceQuestion.topic,
          subtopic: sourceQuestion.subtopic,
          routes: sourceQuestion.routes || [],
          status: sourceQuestion.status,
          type: sourceQuestion.type,
          sourcePaperIds: sourceQuestion.paperIds || [],
        },
      });
      questionSourceByKey.set(sourceKey, rows.questionSources.at(-1));
    }
  }

  const canonicalPaperBySourceId = new Map();
  for (const sourcePaper of normalized.source.papers) {
    const sourceId = String(sourcePaper.id).toLowerCase();
    const rowCandidate = {
      id: sourceId,
      reference: cleanText(sourcePaper.reference),
      calculator_allowed:
        typeof sourcePaper.calculator_allowed === 'boolean'
          ? sourcePaper.calculator_allowed
          : null,
      formula_booklet_source_url: sourcePaper.formula_booklet?.url || null,
      formula_booklet_filename: sourcePaper.formula_booklet?.filename || null,
      formula_booklet_storage_provider: null,
      formula_booklet_storage_bucket: null,
      formula_booklet_storage_key: null,
      source_metadata: {
        provider: 'Revision Village',
        sourcePaperId: sourceId,
        sourceSubjectId: sourcePaper.subject_id || null,
        responseType: sourcePaper.response_type || null,
        type: sourcePaper.type || null,
        resetQuestionNumberingPerSection:
          sourcePaper.reset_question_numbering_per_section ?? null,
        sourceIndex: sourcePaper.index ?? null,
      },
    };
    const sameId = existingPaperById.get(sourceId);
    let canonicalId;
    if (!sameId || paperSignature(sameId) === paperSignature(rowCandidate)) {
      canonicalId = sourceId;
    } else {
      canonicalId = deterministicUuid(`revision-village:paper:${sourceId}`);
      findings.push(
        sourceFinding('warning', 'source_paper_uuid_collision', {
          sourcePaperId: sourceId,
          existingPaperId: sameId.id,
          importedPaperId: canonicalId,
        }),
      );
    }
    canonicalPaperBySourceId.set(sourceId, canonicalId);
    if (!existingPaperById.has(canonicalId)) {
      const row = { ...rowCandidate, id: canonicalId };
      rows.papers.push(row);
      existingPaperById.set(canonicalId, row);
    }
  }

  const variantsBySourceQuestion = new Map();
  const touchedVariantIds = new Set();
  const variantRowsById = mapBy(existingVariants, (row) => row.id);
  const coursePaperKeys = new Set();
  const placementKeys = new Set();
  const variantPaperKeys = new Set();

  for (const logical of normalized.source.logicalVariants) {
    const sourceQuestionId = logical.sourceQuestionId;
    const canonicalQuestionId = canonicalQuestionBySourceId.get(sourceQuestionId);
    const course = ensureCourse(logical.descriptor);
    const topic = ensureTopic(course, logical.topicSlug);
    const variantMatchKey = `${canonicalQuestionId}\u0000${course.id}\u0000${topic.id}`;
    const existingMatches = existingVariantByQuestionCourseTopic.get(variantMatchKey) || [];
    let variant;
    if (existingMatches.length) {
      variant = [...existingMatches].sort((a, b) => a.id.localeCompare(b.id))[0];
    } else {
      const sourceOccurrence = nextFreeOccurrence(
        existingVariantTupleCounts,
        canonicalQuestionId,
        topic.dataset_id,
        logical.sourceIndex,
      );
      const firstPaperId = (logical.question.paperIds || [])
        .map((paperId) => canonicalPaperBySourceId.get(String(paperId).toLowerCase()))
        .find(Boolean) || null;
      variant = {
        id: deterministicUuid(
          `revision-village:variant:${canonicalQuestionId}:${course.source_key}:${logical.topicSlug}`,
        ),
        question_id: canonicalQuestionId,
        dataset_id: topic.dataset_id,
        course_id: course.id,
        topic_id: topic.id,
        paper_id: firstPaperId,
        source_index: logical.sourceIndex,
        source_occurrence: sourceOccurrence,
        canonical_source_subtopic_id: null,
        difficulty_value:
          logical.question.difficulty?.value == null
            ? null
            : Number(logical.question.difficulty.value),
        difficulty_label: logical.question.difficulty?.difficultyLevel
          ? String(logical.question.difficulty.difficultyLevel).toLowerCase()
          : null,
        section_raw: null,
        section_normalized: null,
        calculator_allowed:
          typeof logical.question.calculatorAllowed === 'boolean'
            ? logical.question.calculatorAllowed
            : null,
        source_metadata: {
          provider: 'Revision Village',
          sourceQuestionId,
          sourceCourse: logical.sourceCourse,
          normalizedCourse: course.source_key,
          sourceTopic: logical.topicSlug,
        },
      };
      rows.variants.push(variant);
      variantRowsById.set(variant.id, variant);
      if (!existingVariantByQuestionCourseTopic.has(variantMatchKey)) {
        existingVariantByQuestionCourseTopic.set(variantMatchKey, []);
      }
      existingVariantByQuestionCourseTopic.get(variantMatchKey).push(variant);
    }
    touchedVariantIds.add(variant.id);
    if (!variantsBySourceQuestion.has(sourceQuestionId)) {
      variantsBySourceQuestion.set(sourceQuestionId, []);
    }
    variantsBySourceQuestion.get(sourceQuestionId).push(variant);

    const variantSourceKey = `revision_village\u0000${sourceQuestionId}\u0000${logical.sourceCourse}\u0000${logical.topicSlug}`;
    if (!variantSourceByKey.has(variantSourceKey)) {
      const sourceRow = {
        id: deterministicUuid(
          `revision-village:variant-source:${sourceQuestionId}:${logical.sourceCourse}:${logical.topicSlug}`,
        ),
        variant_id: variant.id,
        provider: 'revision_village',
        source_question_id: sourceQuestionId,
        source_course: logical.sourceCourse,
        source_topic: logical.topicSlug,
        source_index: logical.sourceIndex,
        source_metadata: {
          subjectGroup: logical.subjectGroup,
          normalizedCourse: course.source_key,
          routes: logical.placements.map((placement) => placement.route),
          sourceSubtopicIds: logical.sourceSubtopicIds,
        },
      };
      rows.variantSources.push(sourceRow);
      variantSourceByKey.set(variantSourceKey, sourceRow);
    }

    const subtopicSlugs = logical.subtopicSlugs.length
      ? logical.subtopicSlugs
      : ['uncategorized'];
    const subtopicRows = subtopicSlugs.map((slug, index) =>
      ensureSubtopic(course, topic, slug, index),
    );
    if (!variant.canonical_source_subtopic_id && subtopicRows.length) {
      variant.canonical_source_subtopic_id = subtopicRows[0].id;
    }
    for (const [index, subtopic] of subtopicRows.entries()) {
      const key = `${variant.id}\u0000${subtopic.id}`;
      if (placementKeys.has(key)) continue;
      placementKeys.add(key);
      rows.placements.push({
        variant_id: variant.id,
        subtopic_id: subtopic.id,
        placement_order: index,
        placement_difficulty:
          logical.question.difficulty?.value == null
            ? null
            : Number(logical.question.difficulty.value),
        is_fallback: logical.subtopicSlugs.length === 0,
        fallback_reason:
          logical.subtopicSlugs.length === 0
            ? 'revision_village_topic_only_uncategorized'
            : null,
      });
    }

    for (const [paperOrder, sourcePaperId] of (logical.question.paperIds || []).entries()) {
      const paperId = canonicalPaperBySourceId.get(String(sourcePaperId).toLowerCase());
      if (!paperId) continue;
      const coursePaperKey = `${course.id}\u0000${paperId}`;
      if (!coursePaperKeys.has(coursePaperKey)) {
        coursePaperKeys.add(coursePaperKey);
        rows.coursePapers.push({ course_id: course.id, paper_id: paperId });
      }
      const variantPaperKey = `${variant.id}\u0000${paperId}`;
      if (!variantPaperKeys.has(variantPaperKey)) {
        variantPaperKeys.add(variantPaperKey);
        rows.variantPapers.push({
          variant_id: variant.id,
          paper_id: paperId,
          is_primary: paperOrder === 0,
          sort_order: paperOrder,
        });
      }
    }
  }

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
  const storageBucket = options.storageBucket || 'dp-pdf-previews';
  const resolvedAssetByHash = new Map();
  for (const physical of normalized.source.physicalByHash.values()) {
    let asset = assetByHash.get(physical.sourceHash);
    if (!asset) {
      const assetId = deterministicUuid(`asset:${physical.sourceHash}`);
      asset = {
        id: assetId,
        content_hash: physical.sourceHash,
        canonical_source_path: physical.bundlePath,
        original_filename: physical.originalFilename,
        file_extension: physical.extension,
        content_type: physical.contentType,
        byte_size: physical.byteSize,
        storage_provider: storageProvider,
        storage_bucket: storageBucket,
        storage_key: `question-bank/assets/sha256/${physical.sourceHash.slice(0, 2)}/${physical.sourceHash}${physical.extension}`,
        upload_status: 'pending',
        verification_status: 'pending',
        local_path: physical.localPath,
      };
      rows.assets.push(asset);
      assetByHash.set(physical.sourceHash, asset);
    }
    const uploadCandidate = {
      ...asset,
      content_hash: asset.content_hash || physical.sourceHash,
      file_extension: asset.file_extension || physical.extension,
      content_type: asset.content_type || physical.contentType,
      byte_size: Number(asset.byte_size ?? physical.byteSize),
      storage_provider: asset.storage_provider || storageProvider,
      storage_bucket: asset.storage_bucket || storageBucket,
      storage_key:
        asset.storage_key ||
        `question-bank/assets/sha256/${physical.sourceHash.slice(0, 2)}/${physical.sourceHash}${physical.extension}`,
      local_path: physical.localPath,
    };
    resolvedAssetByHash.set(physical.sourceHash, uploadCandidate);
    rows.assetUploadCandidates.push(uploadCandidate);
  }

  const associationByQuestion = new Map();
  const assetSourceKeys = new Set();
  const variantAssetKeys = new Set();
  const paperAssetKeys = new Set();
  let associationOrdinal = 0;
  for (const association of normalized.source.associations) {
    associationOrdinal += 1;
    // The media-normalized archive replaces the original HLS playlist hashes
    // with verified M4A/MP3/WAV objects in audio-manifest.json.
    if (association.role === 'audio') continue;
    if (association.unavailable || !association.sha256) continue;
    const hash = String(association.sha256).toLowerCase();
    const asset = resolvedAssetByHash.get(hash);
    if (!asset) {
      findings.push(
        sourceFinding('critical', 'associated_asset_hash_missing', {
          hash,
          association,
        }, { questionId: association.questionId }),
      );
      continue;
    }
    const sourceQuestionId = association.questionId
      ? String(association.questionId).toLowerCase()
      : null;
    const canonicalQuestionId = sourceQuestionId
      ? canonicalQuestionBySourceId.get(sourceQuestionId)
      : null;
    const role = DIRECT_ROLE_MAP[association.role] || 'content_reference';
    const sourceId = sourceFileId(
      association.fileId,
      `revision-village:asset-source-file:${sourceQuestionId || association.paperId || 'global'}:${association.role}:${associationOrdinal}`,
    );
    const sourceKey = sha256(
      `revision-village\u0000${sourceQuestionId || ''}\u0000${association.paperId || ''}\u0000${sourceId}\u0000${association.role}\u0000${hash}`,
    );
    if (!assetSourceKeys.has(sourceKey)) {
      assetSourceKeys.add(sourceKey);
      rows.assetSources.push({
        id: deterministicUuid(`asset-source:${sourceKey}`),
        asset_id: asset.id,
        source_key: sourceKey,
        source_file_id: sourceId,
        source_question_id: canonicalQuestionId || null,
        original_filename:
          association.sourceFilename || asset.original_filename || path.basename(asset.canonical_source_path),
        original_source_path:
          association.url || association.bundlePath || asset.canonical_source_path,
        original_source_url: association.url || null,
        canonical_normalized_source_path: asset.canonical_source_path,
        source_created_at: null,
        source_updated_at: null,
        source_uploaded_at: null,
      });
    }

    if (sourceQuestionId) {
      if (!associationByQuestion.has(sourceQuestionId)) associationByQuestion.set(sourceQuestionId, []);
      associationByQuestion.get(sourceQuestionId).push({ association, asset, sourceId, role });
      for (const variant of variantsBySourceQuestion.get(sourceQuestionId) || []) {
        const key = `${variant.id}\u0000${asset.id}\u0000${role}`;
        if (variantAssetKeys.has(key)) continue;
        variantAssetKeys.add(key);
        rows.variantAssets.push({
          variant_id: variant.id,
          asset_id: asset.id,
          source_file_id: sourceId,
          role,
          sort_order: associationOrdinal,
          alt_text:
            association.sourceFilename ||
            `${existingQuestionById.get(variant.question_id)?.reference || 'Question'} ${role.replaceAll('_', ' ')}`,
        });
      }
    }

    if (association.paperId) {
      const canonicalPaperId = canonicalPaperBySourceId.get(
        String(association.paperId).toLowerCase(),
      );
      if (canonicalPaperId) {
        const key = `${canonicalPaperId}\u0000${asset.id}\u0000formula_booklet`;
        if (!paperAssetKeys.has(key)) {
          paperAssetKeys.add(key);
          rows.paperAssets.push({
            paper_id: canonicalPaperId,
            asset_id: asset.id,
            role: 'formula_booklet',
            sort_order: 0,
          });
        }
      }
    }
  }

  for (const audio of normalized.source.audioManifest) {
    const hash = String(audio.sha256).toLowerCase();
    const asset = resolvedAssetByHash.get(hash);
    if (!asset) {
      findings.push(
        sourceFinding('critical', 'audio_asset_hash_missing', { hash, audio }, {
          questionId: audio.questionId,
        }),
      );
      continue;
    }
    const sourceQuestionId = String(audio.questionId || '').toLowerCase();
    const canonicalQuestionId = canonicalQuestionBySourceId.get(sourceQuestionId);
    const audioId = String(audio.audioId || '');
    const audioSourceFileId = sourceFileId(
      audioId,
      `revision-village:audio-source-file:${sourceQuestionId}:${hash}`,
    );
    const audioSourceKey = sha256(
      `revision-village\u0000${sourceQuestionId}\u0000${audioSourceFileId}\u0000audio\u0000${hash}`,
    );
    if (!assetSourceKeys.has(audioSourceKey)) {
      assetSourceKeys.add(audioSourceKey);
      rows.assetSources.push({
        id: deterministicUuid(`asset-source:${audioSourceKey}`),
        asset_id: asset.id,
        source_key: audioSourceKey,
        source_file_id: audioSourceFileId,
        source_question_id: canonicalQuestionId || null,
        original_filename: audio.label || asset.original_filename,
        original_source_path: audio.bundlePath || asset.canonical_source_path,
        original_source_url: null,
        canonical_normalized_source_path: asset.canonical_source_path,
        source_created_at: null,
        source_updated_at: null,
        source_uploaded_at: null,
      });
    }
    for (const variant of variantsBySourceQuestion.get(sourceQuestionId) || []) {
      const relationKey = `${variant.id}\u0000${asset.id}\u0000audio`;
      if (variantAssetKeys.has(relationKey)) continue;
      variantAssetKeys.add(relationKey);
      rows.variantAssets.push({
        variant_id: variant.id,
        asset_id: asset.id,
        source_file_id: audioSourceFileId,
        role: 'audio',
        sort_order: 0,
        alt_text: audio.label || 'Question audio',
      });
    }
    rows.audioAssets.push({
      asset_id: asset.id,
      provider: 'revision_village',
      source_audio_id: audio.audioId || null,
      transcript_id: audio.transcriptId || null,
      transcript: audio.transcript || null,
      duration_seconds:
        audio.durationSeconds == null ? null : Number(audio.durationSeconds),
      source_metadata: {
        questionId: audio.questionId || null,
        label: audio.label || null,
        source: audio.source || null,
        sourceUrlHash: audio.sourceUrlHash || null,
        sourceFormat: audio.sourceFormat || null,
        normalization: audio.normalization || null,
      },
    });
  }

  const videoRowsByProviderId = new Map(videoByProviderId);
  const variantVideoKeys = new Set();
  for (const sourceVideo of normalized.source.solutionVideos) {
    const providerVideoId = String(sourceVideo.videoId || '').toLowerCase();
    const key = `revision_village\u0000${providerVideoId}`;
    let video = videoRowsByProviderId.get(key);
    if (!video) {
      video = {
        id: deterministicUuid(`revision-village:solution-video:${providerVideoId}`),
        vimeo_url: null,
        vimeo_video_id: null,
        source_hash: sha256(providerVideoId),
        provider: 'revision_village',
        provider_video_id: providerVideoId,
        source_url: null,
        source_metadata: {
          provider: 'Revision Village',
          sourceVideoId: providerVideoId,
        },
      };
      rows.videos.push(video);
      videoRowsByProviderId.set(key, video);
    }
    const sourceQuestionId = String(sourceVideo.questionId).toLowerCase();
    for (const variant of variantsBySourceQuestion.get(sourceQuestionId) || []) {
      const relationKey = `${variant.id}\u0000${video.id}\u0000${sourceVideo.partName || ''}`;
      if (variantVideoKeys.has(relationKey)) continue;
      variantVideoKeys.add(relationKey);
      rows.variantVideos.push({
        variant_id: variant.id,
        video_id: video.id,
        source_file_id: sourceFileId(
          sourceVideo.partId,
          `revision-village:video-part:${sourceQuestionId}:${providerVideoId}`,
        ),
        part_name: String(sourceVideo.partName || ''),
        sort_order: Number(sourceVideo.partIndex || 0),
      });
    }
  }

  const searchRowByVariantId = new Map();
  for (const variantId of touchedVariantIds) {
    const variant = variantRowsById.get(variantId);
    if (!variant) continue;
    const question = existingQuestionById.get(variant.question_id);
    const course = [...courseBySourceKey.values()].find((row) => row.id === variant.course_id);
    const topic = [...topicByCourseSlug.values()].find((row) => row.id === variant.topic_id);
    const placedSubtopics = rows.placements
      .filter((placement) => placement.variant_id === variant.id)
      .map((placement) =>
        [...subtopicByTopicSlug.values()].find((subtopic) => subtopic.id === placement.subtopic_id)?.name,
      )
      .filter(Boolean);
    searchRowByVariantId.set(variant.id, {
      variant_id: variant.id,
      search_text: [
        question?.reference,
        question?.content,
        question?.mark_scheme,
        course?.name,
        topic?.name,
        ...placedSubtopics,
        'Revision Village',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  rows.searchDocuments = [...searchRowByVariantId.values()];

  const criticalFindings = findings.filter((finding) => finding.severity === 'critical');
  const actualCounts = {
    ...normalized.actualCounts,
    newSubjects: rows.subjects.length,
    newCourses: rows.courses.length,
    newDatasets: rows.datasets.length,
    newTopics: rows.topics.length,
    newSubtopics: rows.subtopics.length,
    newQuestionCores: rows.questions.length,
    questionSources: rows.questionSources.length,
    newVariants: rows.variants.length,
    variantSources: rows.variantSources.length,
    placements: rows.placements.length,
    variantPaperRelations: rows.variantPapers.length,
    newPapers: rows.papers.length,
    newPhysicalAssets: rows.assets.length,
    assetSources: rows.assetSources.length,
    variantAssetRelations: rows.variantAssets.length,
    audioMetadataRows: rows.audioAssets.length,
    paperAssetRelations: rows.paperAssets.length,
    newSolutionVideos: rows.videos.length,
    variantSolutionVideoRelations: rows.variantVideos.length,
    searchDocuments: rows.searchDocuments.length,
    reusedQuestionCores:
      normalized.source.questions.length - rows.questions.length,
    reusedVariants:
      normalized.source.logicalVariants.length - rows.variants.length,
    reusedPhysicalAssets:
      normalized.source.physicalByHash.size - rows.assets.length,
  };

  return {
    importerVersion: normalized.importerVersion,
    archiveIdentifier: normalized.archiveIdentifier,
    archiveSha256: normalized.archiveSha256,
    expectedCounts: normalized.expectedCounts,
    actualCounts,
    verificationStatus: criticalFindings.length ? 'failed' : 'passed',
    findings,
    rows,
    maps: {
      canonicalQuestionBySourceId,
      canonicalPaperBySourceId,
      variantsBySourceQuestion,
    },
  };
}

export function publicRevisionVillageReport(normalized) {
  return {
    importerVersion: normalized.importerVersion,
    archiveIdentifier: normalized.archiveIdentifier,
    archiveSha256: normalized.archiveSha256,
    processedAt: normalized.processedAt || new Date().toISOString(),
    expectedCounts: normalized.expectedCounts,
    actualCounts: normalized.actualCounts,
    verificationStatus: normalized.verificationStatus,
    findings: normalized.findings,
  };
}
