import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  opendir,
  readFile,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import { MathMLToLaTeX } from 'mathml-to-latex';
import { NodeHtmlMarkdown } from 'node-html-markdown';

import { deterministicUuid } from './archive.mjs';

export const PESTLE_IMPORTER_VERSION = 'pestle-1.0.0';

const EXPECTED = Object.freeze({
  banks: 18,
  sourceRecords: 10_721,
  uniqueSubjectQuestionIds: 10_484,
  overlappingRows: 237,
  quarantinedQuestions: 2,
  importableQuestions: 10_482,
  embeddedAssets: 5_918,
  linkedAssets: 517,
  assetFailures: 3,
});

const QUARANTINE = new Set([
  'Physics:17M.2.HL.TZ2.4',
  'Physics:17M.2.HL.TZ2.6',
]);

const SUBJECTS = {
  'Biology QB.json': {
    id: 'biology',
    slug: 'biology',
    name: 'Biology',
    order: 0,
  },
  'Biology 2025 QB merged.json': {
    id: 'biology',
    slug: 'biology',
    name: 'Biology',
    order: 0,
    syllabus2025: true,
  },
  'Business Management QB.json': {
    id: 'business',
    slug: 'business',
    name: 'Business Management',
    order: 4,
  },
  'Chemistry QB.json': {
    id: 'chemistry',
    slug: 'chemistry',
    name: 'Chemistry',
    order: 3,
  },
  'Chemistry 2025 QB merged.json': {
    id: 'chemistry',
    slug: 'chemistry',
    name: 'Chemistry',
    order: 3,
    syllabus2025: true,
  },
  'Computer Science QB.json': {
    id: 'computer-science',
    slug: 'computer-science',
    name: 'Computer Science',
    order: 8,
  },
  'Design Technology QB.json': {
    id: 'design-technology',
    slug: 'design-technology',
    name: 'Design Technology',
    order: 9,
  },
  'Digital Society QB.json': {
    id: 'digital-society',
    slug: 'digital-society',
    name: 'Digital Society',
    order: 10,
  },
  'Economics QB.json': {
    id: 'economics',
    slug: 'economics',
    name: 'Economics',
    order: 6,
  },
  'ESS QB.json': {
    id: 'ess',
    slug: 'ess',
    name: 'Environmental Systems and Societies',
    order: 7,
    slOnly: true,
  },
  'Geography QB.json': {
    id: 'geography',
    slug: 'geography',
    name: 'Geography',
    order: 11,
  },
  'History QB.json': {
    id: 'history',
    slug: 'history',
    name: 'History',
    order: 12,
  },
  'Math AA QB.json': {
    id: 'math',
    slug: 'mathematics',
    name: 'Mathematics',
    sourceSubject: 'Math AA',
    order: 1,
    track: 'analysis-and-approaches',
  },
  'Math AI QB.json': {
    id: 'math',
    slug: 'mathematics',
    name: 'Mathematics',
    sourceSubject: 'Math AI',
    order: 1,
    track: 'applications-and-interpretation',
  },
  'Physics QB.json': {
    id: 'physics',
    slug: 'physics',
    name: 'Physics',
    order: 2,
  },
  'Physics 2025 QB merged.json': {
    id: 'physics',
    slug: 'physics',
    name: 'Physics',
    order: 2,
    syllabus2025: true,
  },
  'Psychology QB.json': {
    id: 'psychology',
    slug: 'psychology',
    name: 'Psychology',
    order: 5,
  },
  'SEHS QB.json': {
    id: 'sehs',
    slug: 'sports-exercise-and-health-science',
    name: 'Sports, Exercise and Health Science',
    order: 13,
    slOnly: true,
  },
};

const BANK_ORDER = Object.keys(SUBJECTS).sort((left, right) => {
  const left2025 = SUBJECTS[left].syllabus2025 ? 0 : 1;
  const right2025 = SUBJECTS[right].syllabus2025 ? 0 : 1;
  return left2025 - right2025 || left.localeCompare(right);
});

const nhm = new NodeHtmlMarkdown({
  bulletMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  ignore: ['script', 'style', 'iframe', 'object'],
  keepDataImages: false,
  maxConsecutiveNewlines: 2,
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function* readNdjson(filePath) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line);
  }
}

async function* iterateJsonArray(filePath) {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  let started = false;
  let ended = false;
  let collecting = false;
  let inString = false;
  let escaped = false;
  let depth = 0;
  let buffer = '';

  for await (const chunk of stream) {
    for (const character of chunk) {
      if (!started) {
        if (/\s/.test(character)) continue;
        if (character !== '[')
          throw new Error(`${path.basename(filePath)} is not a JSON array.`);
        started = true;
        continue;
      }
      if (ended) {
        if (!/\s/.test(character))
          throw new Error(`Unexpected data after ${path.basename(filePath)}.`);
        continue;
      }
      if (!collecting) {
        if (/\s/.test(character) || character === ',') continue;
        if (character === ']') {
          ended = true;
          continue;
        }
        if (character !== '{')
          throw new Error(`Expected an object in ${path.basename(filePath)}.`);
        collecting = true;
        depth = 1;
        buffer = character;
        continue;
      }

      buffer += character;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{' || character === '[') depth += 1;
      else if (character === '}' || character === ']') depth -= 1;

      if (depth === 0) {
        yield JSON.parse(buffer);
        collecting = false;
        buffer = '';
      }
    }
  }
  if (!started || collecting || !ended)
    throw new Error(`${path.basename(filePath)} ended unexpectedly.`);
}

function cleanArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];
}

function recordHash(record) {
  return sha256(
    JSON.stringify({
      question: String(record.Question || ''),
      markscheme: String(record.Markscheme || ''),
      examinerReport: String(record['Examiners report'] || ''),
    }),
  );
}

function titleWords(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (['and', 'of', 'the', 'to', 'in'].includes(lower)) return lower;
      if (['dna', 'rna', 'ai', 'hl', 'sl', 'ict'].includes(lower))
        return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

export function taxonomyName(slug, type = 'topic') {
  if (!slug || slug === 'uncategorized') return 'Uncategorized';
  const option = slug.match(/^option-([a-z0-9]+)-(.+)$/i);
  if (option) return `Option ${option[1].toUpperCase()}: ${titleWords(option[2])}`;
  const topic = slug.match(/^topic-([a-z0-9]+)-(.+)$/i);
  if (topic) return `Topic ${topic[1].toUpperCase()}: ${titleWords(topic[2])}`;
  const numbered = slug.match(/^([a-z0-9]+)-([a-z0-9]+)-(.+)$/i);
  if (numbered && type === 'subtopic')
    return `${numbered[1].toUpperCase()}.${numbered[2].toUpperCase()} ${titleWords(numbered[3])}`;
  return titleWords(slug);
}

function levelsForRecord(questionId, subject) {
  if (subject.slOnly) return ['SL'];
  const parts = String(questionId || '').split('.');
  if (parts.includes('BP')) return ['SL', 'HL'];
  if (parts.includes('AHL') || parts.includes('HL')) return ['HL'];
  if (parts.includes('SL')) return ['SL'];
  return ['SL', 'HL'];
}

function subtopicsForTopic(topicSlug, allTopics, subtopicSlugs) {
  if (allTopics.length <= 1 || subtopicSlugs.length <= 1) return subtopicSlugs;
  const matchers = [];
  const numberedTopic = topicSlug.match(/^topic-([a-z0-9]+)-/i);
  if (numberedTopic)
    matchers.push(
      new RegExp(`^(?:(?:sl|hl)-)?${numberedTopic[1]}-`, 'i'),
    );
  const chemistryTopic = topicSlug.match(/^(reactivity|structure)-(\d+)-/i);
  if (chemistryTopic)
    matchers.push(
      new RegExp(`^${chemistryTopic[1]}-${chemistryTopic[2]}-`, 'i'),
    );
  const biologyTheme = topicSlug.match(/^([a-d])-/i);
  if (biologyTheme)
    matchers.push(new RegExp(`^${biologyTheme[1]}(?:\\d|-).*`, 'i'));
  if (topicSlug === 'inquiry') matchers.push(/^(?:i-|inquiry-)/i);
  if (topicSlug === 'tools') matchers.push(/^tool-/i);

  const matched = subtopicSlugs.filter((subtopic) =>
    matchers.some((matcher) => matcher.test(subtopic)),
  );
  return matched.length ? matched : subtopicSlugs;
}

function courseFor(subject, level) {
  const sourceCourse = subject.track
    ? `${subject.track}-${level.toLowerCase()}`
    : `${level.toLowerCase()}${subject.syllabus2025 ? '-2025' : ''}`;
  const name = subject.track
    ? `${titleWords(subject.track)} ${level}`
    : `${subject.name} ${level}`;
  return {
    id: deterministicUuid(`course:${subject.id}:${sourceCourse}`),
    subject_id: subject.id,
    source_key: `${subject.id}:${sourceCourse}`,
    slug: sourceCourse,
    name,
    level,
    syllabus_label: subject.syllabus2025
      ? 'First assessment 2025'
      : 'Legacy syllabus',
    sort_order: level === 'SL' ? 0 : 1,
  };
}

function paperMetadata(questionId) {
  const parts = String(questionId || '').split('.');
  const sessionIndex = parts.findIndex((part) => /^\d{2}[MN]$/i.test(part));
  if (sessionIndex < 0) return null;
  const session = parts[sessionIndex].toUpperCase();
  const paper = parts[sessionIndex + 1] || null;
  const timezone = parts.find((part) => /^TZ\d+$/i.test(part))?.toUpperCase();
  if (!paper) return null;
  return {
    session,
    paper,
    timezone: timezone || null,
    reference: [session, `Paper ${paper}`, timezone].filter(Boolean).join(' · '),
  };
}

function marksFromHtml(value) {
  return [
    ...String(value || '').matchAll(
      /class\s*=\s*["'][^"']*\bmarks\b[^"']*["'][^>]*>\s*\[?\s*(\d+)\s*\]?/gi,
    ),
  ].map((match) => Number(match[1]));
}

function questionPartCount(value) {
  const parts = (
    String(value || '').match(
      /class\s*=\s*["'][^"']*question_part_label[^"']*["']/gi,
    ) || []
  ).length;
  return Math.max(1, parts);
}

const SUBSCRIPT = {
  0: '₀',
  1: '₁',
  2: '₂',
  3: '₃',
  4: '₄',
  5: '₅',
  6: '₆',
  7: '₇',
  8: '₈',
  9: '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
};

const SUPERSCRIPT = {
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
};

function decodeBasicEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, number) =>
      String.fromCodePoint(Number(number)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 16)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function scriptText(value, map, fallback) {
  const plain = decodeBasicEntities(value).replace(/<[^>]+>/g, '').trim();
  const converted = [...plain].map((character) => map[character]).join('');
  return converted.length === plain.length ? converted : `${fallback}(${plain})`;
}

export function htmlToQuestionSource(html, occurrences) {
  const tokens = new Map();
  let tokenIndex = 0;
  let imageIndex = 0;
  const token = (replacement) => {
    const value = `DPQBPROTECTEDTOKEN${tokenIndex++}END`;
    tokens.set(value, replacement);
    return value;
  };

  let prepared = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const occurrence = occurrences[imageIndex++];
      if (!occurrence)
        return `<p>${token('[Referenced image unavailable]')}</p>`;
      const alt =
        tag.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim() ||
        'Question diagram';
      return `<p>${token(`![${decodeBasicEntities(alt)}](question:${occurrence.sourceFileId})`)}</p>`;
    })
    .replace(/<math\b[\s\S]*?<\/math>/gi, (mathml) => {
      try {
        const latex = MathMLToLaTeX.convert(mathml).trim();
        if (!latex) return '';
        const display = /\bdisplay\s*=\s*["']block["']/i.test(mathml);
        return token(display ? `$$${latex}$$` : `$${latex}$`);
      } catch {
        return token(decodeBasicEntities(mathml.replace(/<[^>]+>/g, ' ')));
      }
    })
    .replace(
      /<div\b[^>]*class\s*=\s*["'][^"']*\bmarks\b[^"']*["'][^>]*>\s*\[?\s*(\d+)\s*\]?\s*<\/div>/gi,
      (_, marks) => `<p>${token(`:marks[${marks}]`)}</p>`,
    )
    .replace(
      /<div\b[^>]*class\s*=\s*["'][^"']*question_part_label[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
      (_, label) =>
        `<p>${token(`**${decodeBasicEntities(label.replace(/<[^>]+>/g, '')).trim()}**`)}</p>`,
    )
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_, value) =>
      token(scriptText(value, SUBSCRIPT, '_')),
    )
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_, value) =>
      token(scriptText(value, SUPERSCRIPT, '^')),
    );

  let output = nhm.translate(prepared);
  for (let pass = 0; pass <= tokens.size; pass += 1) {
    let changed = false;
    for (const [protectedToken, replacement] of tokens) {
      if (!output.includes(protectedToken)) continue;
      output = output.replaceAll(protectedToken, replacement);
      changed = true;
    }
    if (!changed) break;
  }
  return output
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function occurrenceKey(bank, questionId, field) {
  return `${bank}\u0000${questionId}\u0000${field}`;
}

function sourceRecordKey(subjectName, questionId) {
  return `${subjectName}:${questionId}`;
}

function contentType(extension, declared) {
  if (String(declared || '').startsWith('image/')) return declared;
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  }[extension] || 'image/png';
}

function finding(severity, code, details = {}, source = {}) {
  return {
    id: deterministicUuid(
      `pestle-finding:${severity}:${code}:${source.questionId || ''}:${JSON.stringify(details)}`,
    ),
    severity,
    code,
    source_dataset: source.bank || null,
    source_question_id: source.questionUuid || null,
    source_reference: source.questionId || null,
    details,
  };
}

async function countFiles(directory) {
  if (!(await exists(directory))) return 0;
  let count = 0;
  const handle = await opendir(directory);
  for await (const entry of handle) if (entry.isFile() && entry.name !== '.DS_Store') count += 1;
  return count;
}

export async function normalizePestleArchive(root, options = {}) {
  const rawDirectory = path.join(root, 'raw', 'banks');
  const occurrencePath = path.join(root, 'index', 'asset-occurrences.ndjson');
  const failurePath = path.join(root, 'index', 'asset-failures.ndjson');
  for (const required of [rawDirectory, occurrencePath, failurePath]) {
    if (!(await exists(required)))
      throw new Error(`PESTLE capture is missing ${path.relative(root, required)}.`);
  }

  const findings = [];
  const occurrencesByRecord = new Map();
  let assetOccurrenceCount = 0;
  for await (const occurrence of readNdjson(occurrencePath)) {
    assetOccurrenceCount += 1;
    const key = occurrenceKey(
      occurrence.bank,
      occurrence.question_id,
      occurrence.field,
    );
    if (!occurrencesByRecord.has(key)) occurrencesByRecord.set(key, []);
    occurrencesByRecord.get(key).push(occurrence);
  }
  for (const occurrences of occurrencesByRecord.values())
    occurrences.sort((left, right) => left.ordinal - right.ordinal);

  const failures = [];
  for await (const failure of readNdjson(failurePath)) failures.push(failure);
  const unexpectedFailures = failures.filter(
    (failure) =>
      !QUARANTINE.has(sourceRecordKey('Physics', failure.question_id)),
  );
  if (unexpectedFailures.length)
    findings.push(
      finding('critical', 'unexpected_asset_failures', {
        failures: unexpectedFailures,
      }),
    );

  const subjects = new Map();
  const courses = new Map();
  const selected = new Map();
  let sourceRecords = 0;
  let overlappingRows = 0;

  for (const bank of BANK_ORDER) {
    const subject = SUBJECTS[bank];
    const rawPath = path.join(rawDirectory, bank);
    if (!(await exists(rawPath)))
      throw new Error(`PESTLE capture is missing bank ${bank}.`);
    subjects.set(subject.id, {
      id: subject.id,
      slug: subject.slug,
      name: subject.name,
      sort_order: subject.order,
    });

    let sourceIndex = 0;
    for await (const record of iterateJsonArray(rawPath)) {
      sourceRecords += 1;
      const questionId = String(record.question_id || '').trim();
      if (!questionId) {
        findings.push(
          finding('critical', 'missing_question_id', { sourceIndex }, { bank }),
        );
        sourceIndex += 1;
        continue;
      }
      const sourceSubject = subject.sourceSubject || subject.name;
      const key = sourceRecordKey(sourceSubject, questionId);
      const hash = recordHash(record);
      const existing = selected.get(key);
      if (existing) {
        overlappingRows += 1;
        if (existing.rawContentHash !== hash)
          findings.push(
            finding(
              'critical',
              'conflicting_subject_question',
              { chosenBank: existing.bank, conflictingBank: bank },
              { bank, questionId },
            ),
          );
        sourceIndex += 1;
        continue;
      }

      if (QUARANTINE.has(key)) {
        findings.push(
          finding(
            'warning',
            'question_quarantined_for_unavailable_images',
            { failedImages: failures.filter((item) => item.question_id === questionId) },
            { bank, questionId },
          ),
        );
        sourceIndex += 1;
        continue;
      }

      const questionUuid = deterministicUuid(
        `pestle:question:${sourceSubject}:${questionId}`,
      );
      const fieldOccurrences = {};
      for (const field of ['Question', 'Markscheme', 'Examiners report']) {
        fieldOccurrences[field] =
          occurrencesByRecord.get(occurrenceKey(bank, questionId, field)) || [];
      }
      const marks = marksFromHtml(record.Question);
      const examinerReport = htmlToQuestionSource(
        record['Examiners report'],
        fieldOccurrences['Examiners report'].map((occurrence) => ({
          ...occurrence,
          sourceFileId: deterministicUuid(
            `pestle:asset-occurrence:${bank}:${questionId}:Examiners report:${occurrence.ordinal}`,
          ),
        })),
      );
      const normalizedRecord = {
        bank,
        subject,
        sourceSubject,
        questionId,
        questionUuid,
        sourceIndex,
        rawContentHash: hash,
        topics: cleanArray(record.topics),
        subtopics: cleanArray(record.subtopics),
        levels: levelsForRecord(questionId, subject),
        marks,
        questionParts: questionPartCount(record.Question),
        content: htmlToQuestionSource(
          record.Question,
          fieldOccurrences.Question.map((occurrence) => ({
            ...occurrence,
            sourceFileId: deterministicUuid(
              `pestle:asset-occurrence:${bank}:${questionId}:Question:${occurrence.ordinal}`,
            ),
          })),
        ),
        markScheme: htmlToQuestionSource(
          record.Markscheme,
          fieldOccurrences.Markscheme.map((occurrence) => ({
            ...occurrence,
            sourceFileId: deterministicUuid(
              `pestle:asset-occurrence:${bank}:${questionId}:Markscheme:${occurrence.ordinal}`,
            ),
          })),
        ),
        examinerReport:
          examinerReport
            .replace(/\[N\/A\]/gi, '')
            .replace(/^\s*[a-z]\.\s*$/gim, '')
            .trim().length > 20
            ? examinerReport
            : '',
        occurrences: fieldOccurrences,
      };
      selected.set(key, normalizedRecord);
      for (const level of normalizedRecord.levels) {
        const course = courseFor(subject, level);
        courses.set(course.id, course);
      }
      sourceIndex += 1;
    }
  }

  const datasets = new Map();
  const topics = new Map();
  const subtopics = new Map();
  const questions = new Map();
  const variants = new Map();
  const placements = new Map();
  const papers = new Map();
  const coursePapers = new Map();
  const assets = new Map();
  const assetSources = new Map();
  const variantAssets = new Map();
  const searchDocuments = new Map();
  const physicalByPath = new Map();
  let globalTopicOrder = 0;

  async function physicalAsset(occurrence) {
    const relative = String(occurrence.path || '').replaceAll('\\', '/');
    if (!relative.startsWith('assets/'))
      throw new Error(`Unsafe PESTLE asset path: ${relative}`);
    if (physicalByPath.has(relative)) return physicalByPath.get(relative);
    const localPath = path.join(root, ...relative.split('/'));
    const [fileStat, actualHash] = await Promise.all([
      stat(localPath),
      hashFile(localPath),
    ]);
    if (occurrence.sha256 && occurrence.sha256 !== actualHash)
      throw new Error(`Asset hash mismatch for ${relative}.`);
    const extension = path.extname(localPath).toLowerCase() || '.png';
    const physical = {
      relative,
      localPath,
      hash: actualHash,
      extension,
      byteSize: fileStat.size,
      contentType: contentType(extension, occurrence.mime),
    };
    physicalByPath.set(relative, physical);
    return physical;
  }

  function ensureTaxonomy(record, course, topicSlug, subtopicSlugs) {
    const datasetId = deterministicUuid(
      `pestle:dataset:${course.id}:${record.bank}:${topicSlug}`,
    );
    const topicId = deterministicUuid(`pestle:topic:${course.id}:${topicSlug}`);
    if (!datasets.has(datasetId))
      datasets.set(datasetId, {
        id: datasetId,
        course_id: course.id,
        source_filename: `pestle:${record.bank}:${course.source_key}:${topicSlug}`,
        encoded_filename: encodeURIComponent(record.bank),
        chunk_id: 0,
        topic_slug: topicSlug,
        expected_question_count: 0,
        expected_subtopic_count: 0,
        source_metadata: {
          provider: 'PESTLE',
          sourceBank: record.bank,
          taxonomy: topicSlug,
        },
      });
    if (!topics.has(topicId))
      topics.set(topicId, {
        id: topicId,
        dataset_id: datasetId,
        course_id: course.id,
        slug: topicSlug,
        name: taxonomyName(topicSlug),
        sort_order: globalTopicOrder++,
      });

    const resolvedSubtopics = subtopicSlugs.length
      ? subtopicSlugs
      : ['uncategorized'];
    const subtopicIds = resolvedSubtopics.map((subtopicSlug, order) => {
      const subtopicId = deterministicUuid(
        `pestle:subtopic:${topicId}:${subtopicSlug}`,
      );
      if (!subtopics.has(subtopicId))
        subtopics.set(subtopicId, {
          id: subtopicId,
          topic_id: topicId,
          course_id: course.id,
          slug: subtopicSlug,
          name: taxonomyName(subtopicSlug, 'subtopic'),
          code: '',
          description: '',
          sort_order: order,
        });
      return subtopicId;
    });
    return { datasetId, topicId, subtopicIds };
  }

  for (const record of selected.values()) {
    const maximumMark = record.marks.reduce((total, mark) => total + mark, 0);
    const flags = [];
    if (!record.topics.length) flags.push('topic_uncategorized');
    if (!record.subtopics.length) flags.push('subtopic_uncategorized');
    if (!record.marks.length) flags.push('marks_unavailable');
    if (!record.examinerReport) flags.push('examiner_report_unavailable');
    if (!String(record.questionId).split('.').some((part) => /^(?:SL|HL|AHL|BP)$/.test(part)))
      flags.push('level_unavailable_both_courses');
    questions.set(record.questionUuid, {
      id: record.questionUuid,
      reference: record.questionId,
      content: record.content,
      mark_scheme: record.markScheme,
      examiner_report: record.examinerReport,
      maximum_mark: maximumMark,
      source_status: flags.length ? 'pestle_import_with_flags' : 'pestle_import_ready',
      content_hash: sha256(
        JSON.stringify({
          reference: record.questionId,
          content: record.content,
          markScheme: record.markScheme,
          examinerReport: record.examinerReport,
          maximumMark,
        }),
      ),
      source_metadata: {
        provider: 'PESTLE',
        sourceBank: record.bank,
        sourceSubject: record.sourceSubject,
        sourceQuestionId: record.questionId,
        sourceTopics: record.topics,
        sourceSubtopics: record.subtopics,
        questionParts: record.questionParts,
        explicitPartMarks: record.marks,
        imageOccurrences: Object.values(record.occurrences).reduce(
          (total, occurrences) => total + occurrences.length,
          0,
        ),
        auditFlags: flags,
      },
    });

    const paper = paperMetadata(record.questionId);
    const topicSlugs = record.topics.length ? record.topics : ['uncategorized'];
    const variantIds = [];
    for (const level of record.levels) {
      const course = courseFor(record.subject, level);
      courses.set(course.id, course);
      let paperId = null;
      if (paper) {
        paperId = deterministicUuid(
          `pestle:paper:${record.subject.id}:${level}:${paper.reference}`,
        );
        papers.set(paperId, {
          id: paperId,
          reference: paper.reference,
          calculator_allowed: null,
          formula_booklet_source_url: null,
          formula_booklet_filename: null,
          formula_booklet_storage_provider: null,
          formula_booklet_storage_bucket: null,
          formula_booklet_storage_key: null,
        });
        coursePapers.set(`${course.id}:${paperId}`, {
          course_id: course.id,
          paper_id: paperId,
        });
      }

      for (const topicSlug of topicSlugs) {
        const taxonomy = ensureTaxonomy(
          record,
          course,
          topicSlug,
          subtopicsForTopic(topicSlug, topicSlugs, record.subtopics),
        );
        const variantId = deterministicUuid(
          `pestle:variant:${course.id}:${record.questionUuid}:${topicSlug}`,
        );
        variantIds.push(variantId);
        variants.set(variantId, {
          id: variantId,
          question_id: record.questionUuid,
          dataset_id: taxonomy.datasetId,
          course_id: course.id,
          topic_id: taxonomy.topicId,
          paper_id: paperId,
          source_index: record.sourceIndex,
          source_occurrence: 0,
          canonical_source_subtopic_id: taxonomy.subtopicIds[0] || null,
          difficulty_value: null,
          difficulty_label: null,
          section_raw: null,
          section_normalized: null,
          calculator_allowed: null,
          source_metadata: {
            provider: 'PESTLE',
            sourceBank: record.bank,
            sourceSubject: record.sourceSubject,
            sourceQuestionId: record.questionId,
            sourceTopic: topicSlug,
          },
        });
        datasets.get(taxonomy.datasetId).expected_question_count += 1;
        taxonomy.subtopicIds.forEach((subtopicId, placementOrder) => {
          placements.set(`${variantId}:${subtopicId}`, {
            variant_id: variantId,
            subtopic_id: subtopicId,
            placement_order: placementOrder,
            placement_difficulty: null,
            is_fallback: !record.subtopics.length,
            fallback_reason: !record.subtopics.length
              ? 'source_subtopic_missing_uncategorized'
              : null,
          });
        });
      }
    }

    for (const [field, role] of [
      ['Question', 'question'],
      ['Markscheme', 'markscheme'],
      ['Examiners report', 'examiner_report'],
    ]) {
      for (const occurrence of record.occurrences[field]) {
        const physical = await physicalAsset(occurrence);
        const assetId = deterministicUuid(`asset:${physical.hash}`);
        const sourceFileId = deterministicUuid(
          `pestle:asset-occurrence:${record.bank}:${record.questionId}:${field}:${occurrence.ordinal}`,
        );
        if (!assets.has(assetId))
          assets.set(assetId, {
            id: assetId,
            content_hash: physical.hash,
            canonical_source_path: physical.relative,
            original_filename: path.basename(physical.localPath),
            file_extension: physical.extension,
            content_type: physical.contentType,
            byte_size: physical.byteSize,
            storage_provider: options.storageProvider || 'r2',
            storage_bucket: options.storageBucket || 'dp-question-bank',
            storage_key: `question-bank/assets/sha256/${physical.hash.slice(0, 2)}/${physical.hash}${physical.extension}`,
            upload_status: 'pending',
            verification_status: 'pending',
            local_path: physical.localPath,
          });
        const sourceKey = sha256(
          `${record.bank}\u0000${record.questionId}\u0000${field}\u0000${occurrence.ordinal}`,
        );
        assetSources.set(sourceKey, {
          id: deterministicUuid(`asset-source:${sourceKey}`),
          asset_id: assetId,
          source_key: sourceKey,
          source_file_id: sourceFileId,
          source_question_id: record.questionUuid,
          original_filename: path.basename(physical.localPath),
          original_source_path: String(occurrence.source || occurrence.path),
          original_source_url: occurrence.resolved_url || null,
          canonical_normalized_source_path: physical.relative,
          source_created_at: null,
          source_updated_at: null,
          source_uploaded_at: null,
        });
        for (const variantId of variantIds)
          variantAssets.set(`${variantId}:${assetId}:${role}`, {
            variant_id: variantId,
            asset_id: assetId,
            source_file_id: sourceFileId,
            role,
            sort_order: Number(occurrence.ordinal || 0),
            alt_text: `${record.questionId} ${role.replaceAll('_', ' ')} image`,
          });
      }
    }
  }

  const subtopicCountByTopic = new Map();
  for (const subtopic of subtopics.values())
    subtopicCountByTopic.set(
      subtopic.topic_id,
      (subtopicCountByTopic.get(subtopic.topic_id) || 0) + 1,
    );
  for (const topic of topics.values())
    datasets.get(topic.dataset_id).expected_subtopic_count =
      subtopicCountByTopic.get(topic.id) || 0;

  for (const variant of variants.values()) {
    const question = questions.get(variant.question_id);
    const course = courses.get(variant.course_id);
    const subject = subjects.get(course.subject_id);
    const topic = topics.get(variant.topic_id);
    const placedSubtopics = [...placements.values()]
      .filter((placement) => placement.variant_id === variant.id)
      .map((placement) => subtopics.get(placement.subtopic_id)?.name)
      .filter(Boolean);
    searchDocuments.set(variant.id, {
      variant_id: variant.id,
      search_text: [
        question.reference,
        question.content,
        question.mark_scheme,
        question.examiner_report,
        subject.name,
        course.name,
        topic.name,
        ...placedSubtopics,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  const [embeddedAssetFiles, linkedAssetFiles] = await Promise.all([
    countFiles(path.join(root, 'assets', 'embedded')),
    countFiles(path.join(root, 'assets', 'linked')),
  ]);
  const actualCounts = {
    banks: BANK_ORDER.length,
    sourceRecords,
    uniqueSubjectQuestionIds: selected.size + QUARANTINE.size,
    overlappingRows,
    quarantinedQuestions: QUARANTINE.size,
    importableQuestions: questions.size,
    subjects: subjects.size,
    courses: courses.size,
    datasets: datasets.size,
    topics: topics.size,
    subtopics: subtopics.size,
    variants: variants.size,
    storedPlacementRows: placements.size,
    papers: papers.size,
    assetOccurrences: assetOccurrenceCount,
    embeddedAssetFiles,
    linkedAssetFiles,
    referencedContentDeduplicatedAssets: assets.size,
    assetSourceAssociations: assetSources.size,
    variantAssetAssociations: variantAssets.size,
    searchDocuments: searchDocuments.size,
    assetFailures: failures.length,
  };

  for (const [key, expected] of Object.entries({
    banks: EXPECTED.banks,
    sourceRecords: EXPECTED.sourceRecords,
    uniqueSubjectQuestionIds: EXPECTED.uniqueSubjectQuestionIds,
    overlappingRows: EXPECTED.overlappingRows,
    quarantinedQuestions: EXPECTED.quarantinedQuestions,
    importableQuestions: EXPECTED.importableQuestions,
    embeddedAssetFiles: EXPECTED.embeddedAssets,
    linkedAssetFiles: EXPECTED.linkedAssets,
    assetFailures: EXPECTED.assetFailures,
  })) {
    if (actualCounts[key] !== expected)
      findings.push(
        finding('critical', 'pestle_count_mismatch', {
          key,
          expected,
          actual: actualCounts[key],
        }),
      );
  }
  for (const question of questions.values()) {
    if (!question.content || !question.mark_scheme)
      findings.push(
        finding(
          'critical',
          'empty_importable_question_content',
          {},
          {
            questionId: question.reference,
            questionUuid: question.id,
          },
        ),
      );
    const renderedSources = [
      question.content,
      question.mark_scheme,
      question.examiner_report,
    ];
    if (
      renderedSources.some((source) =>
        /DPQBPROTECTEDTOKEN|<(?:img|math)\b/i.test(source),
      )
    )
      findings.push(
        finding(
          'critical',
          'unsafe_or_unresolved_render_source',
          {},
          {
            questionId: question.reference,
            questionUuid: question.id,
          },
        ),
      );
    const expectedImages = Number(
      question.source_metadata?.imageOccurrences || 0,
    );
    const renderedImages = renderedSources.reduce(
      (total, source) => total + (source.match(/\(question:/g) || []).length,
      0,
    );
    if (expectedImages !== renderedImages)
      findings.push(
        finding(
          'critical',
          'rendered_image_occurrence_mismatch',
          { expected: expectedImages, actual: renderedImages },
          {
            questionId: question.reference,
            questionUuid: question.id,
          },
        ),
      );
  }

  const fingerprint = createHash('sha256');
  for (const bank of BANK_ORDER) {
    const bankPath = path.join(rawDirectory, bank);
    fingerprint.update(bank);
    fingerprint.update(await hashFile(bankPath));
  }
  for (const physical of [...physicalByPath.values()].sort((left, right) =>
    left.relative.localeCompare(right.relative),
  )) {
    fingerprint.update(physical.relative);
    fingerprint.update(physical.hash);
  }

  const criticalFindings = findings.filter(
    (item) => item.severity === 'critical',
  );
  return {
    importerVersion: PESTLE_IMPORTER_VERSION,
    archiveIdentifier: 'pestle-audited-capture-20260723',
    archiveSha256: fingerprint.digest('hex'),
    processedAt: new Date().toISOString(),
    expectedCounts: EXPECTED,
    actualCounts,
    verificationStatus: criticalFindings.length ? 'failed' : 'passed',
    findings,
    rows: {
      subjects: [...subjects.values()],
      courses: [...courses.values()],
      datasets: [...datasets.values()],
      topics: [...topics.values()],
      subtopics: [...subtopics.values()],
      papers: [...papers.values()],
      coursePapers: [...coursePapers.values()],
      questions: [...questions.values()],
      variants: [...variants.values()],
      placements: [...placements.values()],
      assets: [...assets.values()],
      assetSources: [...assetSources.values()],
      variantAssets: [...variantAssets.values()],
      videos: [],
      variantVideos: [],
      searchDocuments: [...searchDocuments.values()],
    },
  };
}

export function publicPestleAuditReport(normalized) {
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
