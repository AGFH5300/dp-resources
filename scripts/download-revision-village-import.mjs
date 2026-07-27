#!/usr/bin/env node

import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { google } from 'googleapis';
import JSZip from 'jszip';

const PARTS = [
  {
    id: '125Dt-VWRrZMQRJBq8MF10rE37v3Vr6g0',
    name: 'RevisionVillage-question-bank-import-20260727T104233-audited-media.zip.part01',
    bytes: 94_371_840,
    sha256: 'bacfb01992e276102f56da3150c1bae42e70690494883629b3fae4bbc4c0fbe1',
  },
  {
    id: '1our0VFXpL6X64s7yx30YKmCpe-BC0pD1',
    name: 'RevisionVillage-question-bank-import-20260727T104233-audited-media.zip.part02',
    bytes: 94_371_840,
    sha256: '0f89b1433439bf3a0a4e80226d3f27cca020c264932795d39da7f7e879dbda23',
  },
];

const WRAPPED_PART = {
  id: '1d2rKi2Z0_UsGAeDkzUAbhDU9PzamEdX0',
  name: 'RevisionVillage-question-bank-import-20260727T104233-audited-media-part03-wrapper.zip',
  bytes: 696_271,
  sha256: '7a1a78edfcd794870491a9e203c7b540d66520cf57bc536b80522f8d60907f77',
  innerName: 'RevisionVillage-question-bank-import-20260727T104233-audited-media.zip.part03',
  innerBytes: 696_019,
  innerSha256: '1017c51e5ea89f1621ad722e8e0d5937150fc308a45d12b169d59112eddce107',
};

const FINAL = {
  name: 'RevisionVillage-question-bank-import-20260727T104233-audited-media.zip',
  bytes: 189_439_699,
  sha256: 'fc93fd8129ba7e945e11249c12fba08c565b2923074413a5835ce8935dafa5e9',
};

function normalizePrivateKey(value = '') {
  let key = value.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\+\n/g, '\n')
    .replace(/\n\\+/g, '\n')
    .replace(/\\+$/g, '')
    .replace(/\\/g, '')
    .trim();
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function verifyFile(filePath, expected) {
  const body = await readFile(filePath);
  if (body.byteLength !== expected.bytes) {
    throw new Error(
      `${path.basename(filePath)} size mismatch: expected ${expected.bytes}, received ${body.byteLength}.`,
    );
  }
  const digest = sha256(body);
  if (digest !== expected.sha256) {
    throw new Error(
      `${path.basename(filePath)} SHA-256 mismatch: expected ${expected.sha256}, received ${digest}.`,
    );
  }
  return body;
}

async function downloadFile(drive, source, destination) {
  const response = await drive.files.get(
    {
      fileId: source.id,
      alt: 'media',
      supportsAllDrives: true,
    },
    { responseType: 'stream' },
  );
  await pipeline(response.data, createWriteStream(destination));
  await verifyFile(destination, source);
}

const destination = path.resolve(process.argv[2] || '.revision-village-import');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

const privateKey = normalizePrivateKey(required('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'));
if (
  !privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
  !privateKey.includes('-----END PRIVATE KEY-----')
) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not a valid PEM private key.');
}

const auth = new google.auth.JWT({
  email: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

for (const source of PARTS) {
  const target = path.join(destination, source.name);
  process.stdout.write(`Downloading ${source.name}...\n`);
  await downloadFile(drive, source, target);
}

const wrapperPath = path.join(destination, WRAPPED_PART.name);
process.stdout.write(`Downloading ${WRAPPED_PART.name}...\n`);
await downloadFile(drive, WRAPPED_PART, wrapperPath);

const wrapper = await JSZip.loadAsync(await readFile(wrapperPath));
const inner = wrapper.file(WRAPPED_PART.innerName);
if (!inner) throw new Error(`Wrapper is missing ${WRAPPED_PART.innerName}.`);
const part3Body = await inner.async('nodebuffer');
if (
  part3Body.byteLength !== WRAPPED_PART.innerBytes ||
  sha256(part3Body) !== WRAPPED_PART.innerSha256
) {
  throw new Error('Wrapped part 3 verification failed.');
}
const part3Path = path.join(destination, WRAPPED_PART.innerName);
await writeFile(part3Path, part3Body);

const finalBody = Buffer.concat([
  await readFile(path.join(destination, PARTS[0].name)),
  await readFile(path.join(destination, PARTS[1].name)),
  part3Body,
]);
if (finalBody.byteLength !== FINAL.bytes || sha256(finalBody) !== FINAL.sha256) {
  throw new Error('Reassembled Revision Village archive verification failed.');
}

const finalPath = path.join(destination, FINAL.name);
await writeFile(finalPath, finalBody);
await writeFile(
  path.join(destination, 'download-report.json'),
  `${JSON.stringify(
    {
      downloadedAt: new Date().toISOString(),
      archive: FINAL,
      path: finalPath,
      sourceFileIds: [...PARTS.map((part) => part.id), WRAPPED_PART.id],
    },
    null,
    2,
  )}\n`,
  'utf8',
);

process.stdout.write(`${finalPath}\n`);
