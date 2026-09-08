import { google } from 'googleapis';

const OLD_ESS_ID = '1IPzXSMSJSape5GGzMbsC8XmlOwazfL4Y';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
  throw new Error('Google service account credentials are required');
}

function normalizePrivateKey(raw = '') {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1).trim();
  return key.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n').replace(/\\+\n/g, '\n').replace(/\n\\+/g, '\n').replace(/\\+$/g, '').replace(/\\/g, '').trim();
}

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

async function metadata(id) {
  const { data } = await drive.files.get({
    fileId: id,
    fields: 'id,name,mimeType,size,modifiedTime,trashed,parents',
    supportsAllDrives: true,
  });
  return data;
}

async function main() {
  const file = await metadata(OLD_ESS_ID);
  const chain = [{ id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, trashed: file.trashed, parents: file.parents || [] }];
  let current = file.parents?.[0] || null;
  const seen = new Set([OLD_ESS_ID]);
  for (let depth = 0; current && depth < 25 && !seen.has(current); depth += 1) {
    seen.add(current);
    const parent = await metadata(current);
    chain.push({ id: parent.id, name: parent.name, mimeType: parent.mimeType, size: parent.size, trashed: parent.trashed, parents: parent.parents || [] });
    current = parent.parents?.[0] || null;
  }
  console.log(JSON.stringify({ event: 'old_ess_location', file, chain }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
