import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const ARCHIVE_SHA256 =
  '911a6bfa097e47ce060b6dfcb9cf15f12de1f3b76f8f7b2134b699d010cd541b';
const ARCHIVE_ROOT = 'PADLET IMPORT - COMPRESSED';
const EXPECTED_ARCHIVE_FILES = 269;
const WORK_DIR = join(process.cwd(), '.padlet-drive-refresh');
const ARCHIVE_PATH = join(WORK_DIR, 'padlet.zip');
const EXTRACT_DIR = join(WORK_DIR, 'extract');
const SUMMARY_PATH = join(process.cwd(), 'padlet-refresh-summary.json');
const VERSION = 'padlet_drive_content_refresh_v1';

const ENGLISH_B_FOLDER_ID = '16_lPOguZvBemscUt2_mIm0yWga9ZOYoo';
const ENGLISH_B_PARENT_ID = '17UswRjDeGdoobhJYR4hU2BJpEO34OVn0';
const ARABIC_B_FOLDER_ID = '16Ys-Am39nZN6rLp-Anwma-Pj-SAMZm3W';
const FRENCH_B_FOLDER_ID = '1A2cMZKAYV_uoT35MzCjmX7Uhj1pPuzKR';

const STAGING_PARTS = [
  {
    id: '1HjrpsgZ3qwJ7XRedvy1LN9DQLM6ZXRLy',
    name: 'padlet.zip.00.part',
    sha256: '0e99d5f75cbfa3d8b46f751bcd17302add1edf8c4d2b73a2bcf7f4abf853251c',
  },
  {
    id: '1PagJlHqpaxncx4NEOii3U01Jhu5QztUO',
    name: 'padlet.zip.01.part',
    sha256: '29e1f8cb7dc01c05cf21fe56d9ec5a934037b522f6a36e30ff34b506e7c4b532',
  },
  {
    id: '1g8I-zf2ii2zrB43TmaZO8Kqg4UUiHBGs',
    name: 'padlet.zip.02.part',
    sha256: 'a343fbd1a6eaee92de00750b795bb6a58a236ca6040d5548012b06bc5dbd03f7',
  },
  {
    id: '1nX26QeoYLQIItQg7itAaR0eee7UbkDHu',
    name: 'padlet.zip.03.part',
    sha256: '2e58b0f25c771dc77c6f6f16ae4ee82bede7d907e6cca5a64b7076145bc11b98',
  },
  {
    id: '1KtOh_dQNyCG-jjZ5pkGQJAIa3M1Uv7mc',
    name: 'padlet.zip.04.part',
    sha256: '5e8fda57c70adb6f01aa02aea3ad763eb36249c73037f9e81b5afb7963511e9a',
  },
];

const AMBIGUOUS_TARGETS = new Map([
  [
    `${ARCHIVE_ROOT}/Group_2_-_Arabic/Extended_Essay_Sample.pdf`,
    {
      fileId: '1lBYcu60ERR9L6AxWeOWzpE1PNrYLpoZD',
      parentId: ARABIC_B_FOLDER_ID,
    },
  ],
  [
    `${ARCHIVE_ROOT}/Group_2_-_French/Extended_Essay___sample.pdf`,
    {
      fileId: '1hIWuRR9tsHFxJCvm9sMH6gp9q5V--sWz',
      parentId: FRENCH_B_FOLDER_ID,
    },
  ],
]);

const MISSING_DESTINATIONS = new Map([
  [
    `${ARCHIVE_ROOT}/Group_2_-_Arabic/IO_(1).mp3`,
    { parentId: ARABIC_B_FOLDER_ID, name: 'IO (1).mp3' },
  ],
  [
    `${ARCHIVE_ROOT}/Group_3_-_Geography/27th_Sept_Final__12__Geo__September_2024_(1).docx`,
    {
      parentId: '1eIQhQHLW2BSXAZR8GaXS9xsRacwUcxl1',
      name: '27th Sept Final 12 Geo September 2024 (1).docx',
    },
  ],
  [
    `${ARCHIVE_ROOT}/Group_3_-_Economics/Alia_Abdelhamid_002730_0160_kcn791_Economics_IA__4___1_.pdf`,
    {
      parentId: '10n6M9s5u_UjcjXn7H5qn-ZJ6LBoXPH6B',
      name: 'Alia Abdelhamid 002730 0160 kcn791 Economics IA 4 1.pdf',
    },
  ],
  [
    `${ARCHIVE_ROOT}/Group_4_-_Chemistry/S1_1_Introduction_to_the_particulate_nature_of_matter.pptx`,
    {
      parentId: '1Ik2Z_b_uhrrtnlhLRjg6AwUV4tKX4B75',
      name: 'S1 1 Introduction to the particulate nature of matter.pptx',
    },
  ],
  [
    `${ARCHIVE_ROOT}/Group_2_-_French/Recording_(1).mp3`,
    { parentId: '1uXj3LXDEcfsTeK39YSMpKEUxG2gN0BBC', name: 'Recording (1).mp3' },
  ],
  [
    `${ARCHIVE_ROOT}/Group_2_-_French/Teacher_s_comments_(1).pdf`,
    {
      parentId: '1EmReZSAeSjov_Erb5MbxEycHPAGaAu0o',
      name: 'Teacher s comments (1).pdf',
    },
  ],
  [
    `${ARCHIVE_ROOT}/Group_4_-_Physics/IB_Physics__2025_Subject_Guide.pdf`,
    {
      parentId: '1EsTdP0s4FuOEHlqji8tDG6F_De9HKf3O',
      name: 'IB Physics 2025 Subject Guide.pdf',
    },
  ],
  ...[
    ['Review_Checklist_for_review_writing.odt', 'Review Checklist for review writing.odt'],
    ['IO_Feedback_Form_Y12_Eng_B_HL___Enzo_Peters.docx', 'IO Feedback Form Y12 Eng B HL Enzo Peters.docx'],
    ['Fact_finding_Task_journalist_Dp1.odt', 'Fact finding Task journalist Dp1.odt'],
    ['Oral_Assessment_Question_Bank__IO.odt', 'Oral Assessment Question Bank IO.odt'],
    ['Diary_entry_DP1.odt', 'Diary entry DP1.odt'],
    ['Task_1__Listening_Comprehension_Speech_Mamdani.odt', 'Task 1 Listening Comprehension Speech Mamdani.odt'],
    ['IO_Feedback_Form_Y12_Eng_B_HL_Jonathan_Petrellese.docx', 'IO Feedback Form Y12 Eng B HL Jonathan Petrellese.docx'],
    ['Comparing_Perspectives_on_Migration.odt', 'Comparing Perspectives on Migration.odt'],
    ['Guiding_questions_conceptual_exploratory_questions.odt', 'Guiding questions conceptual exploratory questions.odt'],
    ['DP_Writing_Assessment_Criteria.pdf', 'DP Writing Assessment Criteria.pdf'],
    ['IO_Feedback_Form_Y12_Eng_B_HL___Rose_Madani.docx', 'IO Feedback Form Y12 Eng B HL Rose Madani.docx'],
    ['English_specimen___nov_2020_exam_new.pdf', 'English specimen nov 2020 exam new.pdf'],
    ['All_My_Sons_Extracts.pdf', 'All My Sons Extracts.pdf'],
    ['The_6_Pillars_of_Lifestyle_Reading.odt', 'The 6 Pillars of Lifestyle Reading.odt'],
    ['Year_12_English_B_HL_Course_Outline.odt', 'Year 12 English B HL Course Outline.odt'],
  ].map(([archiveName, name]) => [
    `${ARCHIVE_ROOT}/Group_2_-_English_B/${archiveName}`,
    { parentId: ENGLISH_B_FOLDER_ID, name },
  ]),
  ...[
    '_____________1_8.docx',
    '____________.pdf',
    'Y_11.pdf',
    '________________.docx',
    '__________________.docx',
  ].map((name) => [
    `${ARCHIVE_ROOT}/Islamic_A/${name}`,
    { parentId: '1vketqcIKC5gJm2GTQjE2t3vCGOQZcpFW', name },
  ]),
  [
    `${ARCHIVE_ROOT}/Group_4_-_Computer_Science/DP_Comp_sci_asw_example_6_en.pdf`,
    {
      parentId: '1o3vwWkTSD8Oz6Y5TZth8oZyyAX1Xt0-x',
      name: 'DP Comp sci asw example 6 en.pdf',
    },
  ],
]);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizePrivateKey(raw) {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim();
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function md5(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function mimeFor(name) {
  return (
    {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.odt': 'application/vnd.oasis.opendocument.text',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.png': 'image/png',
    }[extname(name).toLowerCase()] || 'application/octet-stream'
  );
}

function listFiles(root) {
  const output = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) output.push(...listFiles(path));
    else if (name !== '.DS_Store' && !relative(EXTRACT_DIR, path).startsWith('__MACOSX/')) {
      output.push(path);
    }
  }
  return output;
}

async function mapWithConcurrency(items, limit, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      output[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function downloadArchive(drive) {
  mkdirSync(WORK_DIR, { recursive: true });
  const partPaths = [];
  for (const part of STAGING_PARTS) {
    const path = join(WORK_DIR, part.name);
    const response = await drive.files.get(
      { fileId: part.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' },
    );
    await pipeline(response.data, createWriteStream(path));
    if (sha256(path) !== part.sha256) throw new Error(`Staging checksum mismatch: ${part.name}`);
    partPaths.push(path);
  }
  const destination = createWriteStream(ARCHIVE_PATH);
  destination.setMaxListeners(STAGING_PARTS.length * 4 + 10);
  for (const path of partPaths) await pipeline(createReadStream(path), destination, { end: false });
  destination.end();
  await new Promise((resolve, reject) => {
    destination.on('finish', resolve);
    destination.on('error', reject);
  });
  if (sha256(ARCHIVE_PATH) !== ARCHIVE_SHA256) throw new Error('Reassembled archive checksum mismatch');
  execFileSync('unzip', ['-tq', ARCHIVE_PATH], { stdio: 'inherit' });
  mkdirSync(EXTRACT_DIR, { recursive: true });
  execFileSync('unzip', ['-q', '-o', ARCHIVE_PATH, '-d', EXTRACT_DIR]);
}

async function fetchAllIndexRows(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('dp_resource_index')
      .select('drive_file_id,parent_drive_file_id,name,normalized_name,path,mime_type,is_folder,size_bytes,modified_at')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function tableCount(supabase, table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

async function protectedCounts(supabase) {
  const names = [
    'dp_qb_questions',
    'dp_qb_question_variants',
    'dp_qb_assets',
    'dp_qb_solution_videos',
    'dp_qb_user_progress',
    'dp_qb_user_saved_questions',
    'dp_resource_index',
    'dp_resource_source_assignments',
  ];
  const values = await Promise.all(names.map((name) => tableCount(supabase, name)));
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

async function getMetadata(drive, fileId) {
  const { data } = await drive.files.get({
    fileId,
    supportsAllDrives: true,
    fields:
      'id,name,mimeType,size,modifiedTime,parents,md5Checksum,trashed,capabilities(canEdit,canAddChildren)',
  });
  return data;
}

async function findChild(drive, parentId, wantedName) {
  const escaped = parentId.replace(/'/g, "\\'");
  let pageToken;
  const matches = [];
  do {
    const { data } = await drive.files.list({
      q: `'${escaped}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,md5Checksum,trashed)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    matches.push(...(data.files || []).filter((file) => normalizeName(file.name || '') === normalizeName(wantedName)));
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);
  if (matches.length > 1) throw new Error(`Multiple destination children match ${wantedName}`);
  return matches[0] || null;
}

async function upsertIndexRows(supabase, rows) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase
      .from('dp_resource_index')
      .upsert(rows.slice(index, index + 500), { onConflict: 'drive_file_id' });
    if (error) throw new Error(error.message);
  }
}

async function ensurePadletAssignments(supabase, driveFileIds) {
  const { data: source, error: sourceError } = await supabase
    .from('dp_content_sources')
    .select('id')
    .eq('slug', 'padlet')
    .eq('is_active', true)
    .single();
  if (sourceError) throw new Error(sourceError.message);

  const existing = [];
  for (let index = 0; index < driveFileIds.length; index += 100) {
    const { data, error } = await supabase
      .from('dp_resource_source_assignments')
      .select('id,drive_file_id')
      .eq('source_id', source.id)
      .eq('assignment_method', 'import_manifest')
      .eq('relationship', 'hosted_from')
      .in('drive_file_id', driveFileIds.slice(index, index + 100));
    if (error) throw new Error(error.message);
    existing.push(...data);
  }
  const byFile = new Map(existing.map((row) => [row.drive_file_id, row.id]));
  const now = new Date().toISOString();
  const insertRows = driveFileIds
    .filter((id) => !byFile.has(id))
    .map((drive_file_id) => ({
      drive_file_id,
      source_id: source.id,
      is_primary: false,
      relationship: 'hosted_from',
      assignment_method: 'import_manifest',
      confidence: 1,
      inherited_from_drive_file_id: null,
      review_status: 'reviewed',
      applies_to_descendants: false,
      resolution_version: VERSION,
      backfill_version: VERSION,
      last_resolved_at: now,
      created_by: null,
      updated_at: now,
    }));
  if (insertRows.length) {
    const { error } = await supabase.from('dp_resource_source_assignments').insert(insertRows);
    if (error) throw new Error(error.message);
  }
  for (let index = 0; index < existing.length; index += 100) {
    const ids = existing.slice(index, index + 100).map((row) => row.id);
    const { error } = await supabase
      .from('dp_resource_source_assignments')
      .update({
        is_primary: false,
        confidence: 1,
        review_status: 'reviewed',
        applies_to_descendants: false,
        resolution_version: VERSION,
        last_resolved_at: now,
        updated_at: now,
      })
      .in('id', ids);
    if (error) throw new Error(error.message);
  }
  return insertRows.length;
}

async function main() {
  if (MISSING_DESTINATIONS.size !== 28) throw new Error('Missing destination manifest must contain 28 files');
  if (AMBIGUOUS_TARGETS.size !== 2) throw new Error('Ambiguous manifest must contain 2 reviewed files');

  if (process.argv.includes('--validate-manifest')) {
    const localRoot = required('PADLET_ARCHIVE_DIR');
    const archivePaths = new Set(
      listFiles(localRoot).map((path) =>
        `${ARCHIVE_ROOT}/${relative(localRoot, path).replaceAll('\\', '/')}`,
      ),
    );
    if (archivePaths.size !== EXPECTED_ARCHIVE_FILES) {
      throw new Error(`Expected ${EXPECTED_ARCHIVE_FILES} local archive files, found ${archivePaths.size}`);
    }
    for (const path of [...MISSING_DESTINATIONS.keys(), ...AMBIGUOUS_TARGETS.keys()]) {
      if (!archivePaths.has(path)) throw new Error(`Manifest path is absent from archive: ${path}`);
    }
    console.log(
      JSON.stringify({
        archiveFiles: archivePaths.size,
        missingDestinations: MISSING_DESTINATIONS.size,
        reviewedAmbiguousTargets: AMBIGUOUS_TARGETS.size,
      }),
    );
    return;
  }

  const auth = new google.auth.JWT({
    email: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    key: normalizePrivateKey(required('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const supabase = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: completedAudit, error: completedAuditError } = await supabase
    .from('dp_content_source_audit_log')
    .select('after_state,created_at')
    .eq('action', 'drive_content_refresh')
    .eq('change_version', VERSION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (completedAuditError) throw new Error(completedAuditError.message);
  if (completedAudit?.after_state) {
    const summary = {
      ...completedAudit.after_state,
      status: 'already_completed',
      verifiedFromAuditAt: completedAudit.created_at,
    };
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await downloadArchive(drive);
  const extractedRoot = join(EXTRACT_DIR, ARCHIVE_ROOT);
  if (!existsSync(extractedRoot)) throw new Error('Archive root is missing');
  const archiveFiles = listFiles(extractedRoot)
    .map((localPath) => ({
      localPath,
      archivePath: relative(EXTRACT_DIR, localPath).replaceAll('\\', '/'),
      archiveName: basename(localPath),
      mimeType: mimeFor(localPath),
      size: statSync(localPath).size,
      md5: md5(localPath),
    }))
    .sort((a, b) => a.archivePath.localeCompare(b.archivePath));
  if (archiveFiles.length !== EXPECTED_ARCHIVE_FILES) {
    throw new Error(`Expected ${EXPECTED_ARCHIVE_FILES} archive files, found ${archiveFiles.length}`);
  }

  const beforeCounts = await protectedCounts(supabase);
  const indexRows = await fetchAllIndexRows(supabase);
  const indexById = new Map(indexRows.map((row) => [row.drive_file_id, row]));
  const candidatesByNormalizedName = new Map();
  for (const row of indexRows.filter((row) => !row.is_folder)) {
    const key = normalizeName(row.name);
    const bucket = candidatesByNormalizedName.get(key) || [];
    bucket.push(row);
    candidatesByNormalizedName.set(key, bucket);
  }

  const plan = [];
  let uniqueCount = 0;
  let ambiguousCount = 0;
  let missingCount = 0;
  for (const file of archiveFiles) {
    const candidates = candidatesByNormalizedName.get(normalizeName(file.archiveName)) || [];
    const reviewedAmbiguous = AMBIGUOUS_TARGETS.get(file.archivePath);
    if (reviewedAmbiguous) {
      ambiguousCount += 1;
      const target = candidates.find((row) => row.drive_file_id === reviewedAmbiguous.fileId);
      if (!target || target.parent_drive_file_id !== reviewedAmbiguous.parentId) {
        throw new Error(`Reviewed ambiguous target changed: ${file.archivePath}`);
      }
      plan.push({ ...file, kind: 'update', fileId: target.drive_file_id, indexRow: target });
      continue;
    }
    if (candidates.length > 1) throw new Error(`Unexpected duplicate Library match: ${file.archivePath}`);
    if (candidates.length === 1) {
      uniqueCount += 1;
      plan.push({ ...file, kind: 'update', fileId: candidates[0].drive_file_id, indexRow: candidates[0] });
      continue;
    }
    const destination = MISSING_DESTINATIONS.get(file.archivePath);
    if (!destination) throw new Error(`Unexpected missing Library file: ${file.archivePath}`);
    missingCount += 1;
    const existingChild = await findChild(drive, destination.parentId, destination.name);
    plan.push({
      ...file,
      kind: existingChild ? 'update' : 'upload',
      fileId: existingChild?.id || null,
      indexRow: existingChild ? indexById.get(existingChild.id) || null : null,
      destination,
    });
  }
  if (uniqueCount + missingCount !== 267 || ambiguousCount !== 2) {
    throw new Error(`Archive boundary changed: ${JSON.stringify({ uniqueCount, ambiguousCount, missingCount })}`);
  }
  if (new Set(plan.map((item) => item.fileId).filter(Boolean)).size !== plan.filter((item) => item.fileId).length) {
    throw new Error('A Drive file ID is targeted by more than one archive entry');
  }

  const existingPlans = plan.filter((item) => item.fileId);
  const existingMetadata = new Map();
  const permissionFailures = {
    uneditableTargets: [],
    unwritableDestinations: [],
  };
  await mapWithConcurrency(existingPlans, 8, async (item) => {
    const metadata = await getMetadata(drive, item.fileId);
    if (metadata.trashed || metadata.capabilities?.canEdit !== true) {
      permissionFailures.uneditableTargets.push({
        archivePath: item.archivePath,
        fileId: item.fileId,
        parentIds: metadata.parents || [],
        trashed: metadata.trashed === true,
      });
      return;
    }
    existingMetadata.set(item.fileId, metadata);
  });
  const destinationParentIds = [...new Set(
    plan.filter((item) => item.destination).map((item) => item.destination.parentId),
  )];
  await mapWithConcurrency(destinationParentIds, 8, async (parentId) => {
    const metadata = await getMetadata(drive, parentId);
    if (metadata.trashed || metadata.capabilities?.canAddChildren !== true) {
      permissionFailures.unwritableDestinations.push({
        parentId,
        trashed: metadata.trashed === true,
      });
    }
  });
  permissionFailures.uneditableTargets.sort((a, b) => a.archivePath.localeCompare(b.archivePath));
  permissionFailures.unwritableDestinations.sort((a, b) => a.parentId.localeCompare(b.parentId));
  if (
    permissionFailures.uneditableTargets.length > 0 ||
    permissionFailures.unwritableDestinations.length > 0
  ) {
    const error = new Error(
      `Drive preflight found ${permissionFailures.uneditableTargets.length} uneditable targets and ` +
      `${permissionFailures.unwritableDestinations.length} unwritable destinations`,
    );
    error.permissionFailures = permissionFailures;
    throw error;
  }

  const updated = [];
  const uploaded = [];
  await mapWithConcurrency(plan, 3, async (item) => {
    if (item.fileId) {
      const { data } = await drive.files.update({
        fileId: item.fileId,
        supportsAllDrives: true,
        media: { mimeType: item.mimeType, body: createReadStream(item.localPath) },
        fields: 'id,name,mimeType,size,modifiedTime,parents,md5Checksum',
      });
      item.result = data;
      updated.push(item);
      return;
    }
    const { data } = await drive.files.create({
      supportsAllDrives: true,
      requestBody: { name: item.destination.name, parents: [item.destination.parentId] },
      media: { mimeType: item.mimeType, body: createReadStream(item.localPath) },
      fields: 'id,name,mimeType,size,modifiedTime,parents,md5Checksum',
    });
    item.fileId = data.id;
    item.result = data;
    uploaded.push(item);
  });

  const englishFolderMetadata = await getMetadata(drive, ENGLISH_B_FOLDER_ID);
  if (
    englishFolderMetadata.name !== 'English B' ||
    !(englishFolderMetadata.parents || []).includes(ENGLISH_B_PARENT_ID)
  ) {
    throw new Error('English B folder moved or renamed during refresh');
  }
  const englishParentRow = indexById.get(ENGLISH_B_PARENT_ID);
  if (!englishParentRow) throw new Error('English B parent is missing from the Library index');
  const englishFolderPath = `${englishParentRow.path} / English B`;
  const indexUpserts = [
    {
      drive_file_id: ENGLISH_B_FOLDER_ID,
      parent_drive_file_id: ENGLISH_B_PARENT_ID,
      name: 'English B',
      normalized_name: 'English B',
      path: englishFolderPath,
      mime_type: 'application/vnd.google-apps.folder',
      is_folder: true,
      size_bytes: null,
      modified_at: englishFolderMetadata.modifiedTime || null,
      indexed_at: new Date().toISOString(),
    },
  ];
  for (const item of plan) {
    const data = item.result;
    const existingRow = item.indexRow;
    let path = existingRow?.path;
    if (!path) {
      const parentId = data.parents?.[0] || item.destination?.parentId;
      const parentRow =
        parentId === ENGLISH_B_FOLDER_ID
          ? { path: englishFolderPath }
          : indexById.get(parentId);
      if (!parentRow) throw new Error(`Destination parent is missing from index: ${item.archivePath}`);
      path = `${parentRow.path} / ${data.name}`;
    }
    indexUpserts.push({
      drive_file_id: data.id,
      parent_drive_file_id: data.parents?.[0] || existingRow?.parent_drive_file_id || item.destination?.parentId,
      name: data.name,
      normalized_name: data.name.trim().slice(0, 100),
      path,
      mime_type: data.mimeType,
      is_folder: false,
      size_bytes: data.size ? Number(data.size) : null,
      modified_at: data.modifiedTime || null,
      indexed_at: new Date().toISOString(),
    });
  }
  await upsertIndexRows(supabase, indexUpserts);

  const archiveDriveIds = plan.map((item) => item.fileId);
  const newDriveIds = plan
    .filter((item) => !item.indexRow)
    .map((item) => item.fileId);
  if (newDriveIds.length) {
    const { error } = await supabase.rpc('dp_seed_resource_attribution', {
      p_drive_file_ids: newDriveIds,
    });
    if (error) throw new Error(error.message);
  }
  const insertedPadletAssignments = await ensurePadletAssignments(supabase, archiveDriveIds);
  const { error: inheritanceError } = await supabase.rpc(
    'dp_resolve_resource_source_inheritance',
    { p_resolution_version: VERSION },
  );
  if (inheritanceError) throw new Error(inheritanceError.message);

  const verifiedMetadata = await mapWithConcurrency(plan, 8, async (item) => {
    const metadata = await getMetadata(drive, item.fileId);
    if (
      metadata.md5Checksum !== item.md5 ||
      Number(metadata.size) !== item.size ||
      metadata.trashed
    ) {
      throw new Error(`Post-write integrity mismatch: ${item.archivePath}`);
    }
    if (item.destination && !(metadata.parents || []).includes(item.destination.parentId)) {
      throw new Error(`Post-write parent mismatch: ${item.archivePath}`);
    }
    return metadata;
  });

  const finalIndexRows = await fetchAllIndexRows(supabase);
  const finalIndexIds = new Set(finalIndexRows.map((row) => row.drive_file_id));
  if (archiveDriveIds.some((id) => !finalIndexIds.has(id))) {
    throw new Error('One or more archive files are missing from the Library index');
  }
  let verifiedAssignments = 0;
  const { data: padletSource, error: padletSourceError } = await supabase
    .from('dp_content_sources')
    .select('id')
    .eq('slug', 'padlet')
    .single();
  if (padletSourceError) throw new Error(padletSourceError.message);
  for (let index = 0; index < archiveDriveIds.length; index += 100) {
    const { data, error } = await supabase
      .from('dp_resource_source_assignments')
      .select('drive_file_id')
      .eq('source_id', padletSource.id)
      .eq('is_primary', false)
      .eq('relationship', 'hosted_from')
      .eq('review_status', 'reviewed')
      .in('drive_file_id', archiveDriveIds.slice(index, index + 100));
    if (error) throw new Error(error.message);
    verifiedAssignments += data.length;
  }
  if (verifiedAssignments !== EXPECTED_ARCHIVE_FILES) {
    throw new Error(`Expected ${EXPECTED_ARCHIVE_FILES} reviewed Padlet assignments, found ${verifiedAssignments}`);
  }

  const afterCounts = await protectedCounts(supabase);
  for (const table of [
    'dp_qb_questions',
    'dp_qb_question_variants',
    'dp_qb_assets',
    'dp_qb_solution_videos',
    'dp_qb_user_progress',
    'dp_qb_user_saved_questions',
  ]) {
    if (beforeCounts[table] !== afterCounts[table]) {
      throw new Error(`Protected table changed: ${table}`);
    }
  }
  const expectedNewIndexRows = indexUpserts.filter(
    (row) => !indexById.has(row.drive_file_id),
  ).length;
  if (afterCounts.dp_resource_index !== beforeCounts.dp_resource_index + expectedNewIndexRows) {
    throw new Error('Library index count did not change by the expected amount');
  }

  const summary = {
    version: VERSION,
    archiveSha256: ARCHIVE_SHA256,
    archiveFiles: archiveFiles.length,
    boundaryBeforeWrite: { unique: uniqueCount, ambiguous: ambiguousCount, missing: missingCount },
    drive: {
      updatedInPlace: updated.length,
      uploaded: uploaded.length,
      verifiedMd5: verifiedMetadata.length,
      distinctFileIds: new Set(archiveDriveIds).size,
    },
    library: {
      indexedArchiveFiles: archiveDriveIds.length,
      newIndexRows: expectedNewIndexRows,
      insertedPadletAssignments,
      verifiedPadletAssignments: verifiedAssignments,
    },
    protectedCountsBefore: beforeCounts,
    protectedCountsAfter: afterCounts,
    completedAt: new Date().toISOString(),
  };
  const { error: auditError } = await supabase.from('dp_content_source_audit_log').insert({
    target_kind: 'resource_library_archive',
    target_id: 'PADLET IMPORT - COMPRESSED.zip',
    action: 'drive_content_refresh',
    before_state: {
      archiveFiles: EXPECTED_ARCHIVE_FILES,
      uniqueLibraryMatches: uniqueCount,
      ambiguousArchiveFilesResolved: ambiguousCount,
      missingArchiveFiles: missingCount,
    },
    after_state: summary,
    change_version: VERSION,
  });
  if (auditError) throw new Error(auditError.message);

  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const failure = {
    version: VERSION,
    status: 'failed',
    message: error instanceof Error ? error.message : String(error),
    ...(error?.permissionFailures ? { permissionFailures: error.permissionFailures } : {}),
    failedAt: new Date().toISOString(),
  };
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(failure.message);
  process.exitCode = 1;
});
