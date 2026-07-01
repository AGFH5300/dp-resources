import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const publicDir = join(root, 'public');

const users = new Map([
  ['admin@example.com', { email: 'admin@example.com', name: 'Admin User', approved: true, admin: true }],
  ['user@example.com', { email: 'user@example.com', name: 'Approved User', approved: true, admin: false }],
  ['new@example.com', { email: 'new@example.com', name: 'New User', approved: false, admin: false }],
]);

const activity = [];

const resources = [
  { id: 'folder-intake', type: 'folder', name: 'Intake Forms', description: 'Printable intake and onboarding resources.' },
  { id: 'file-guidelines', type: 'file', name: 'Program Guidelines', description: 'Reference guide for approved portal users.' },
  { id: 'file-calendar', type: 'file', name: 'Workshop Calendar', description: 'Current workshop planning calendar.' },
];

function config() {
  return {
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
    googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY || '',
  };
}

function driveConfigured() {
  const current = config();
  return Boolean(current.driveFolderId && current.googleClientEmail && current.googlePrivateKey);
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  const pairs = (req.headers.cookie || '').split(';').map((part) => part.trim()).filter(Boolean);
  return Object.fromEntries(pairs.map((part) => {
    const [key, ...value] = part.split('=');
    return [decodeURIComponent(key), decodeURIComponent(value.join('='))];
  }));
}

function currentUser(req) {
  const email = req.headers['x-demo-user'] || parseCookies(req).demo_user || 'new@example.com';
  return users.get(String(email)) || { email: String(email), name: 'New User', approved: false, admin: false };
}

function requireApproved(req, res) {
  const user = currentUser(req);
  if (!user.approved) {
    json(res, 403, { error: 'approval_required', message: 'Your account is awaiting admin approval.' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireApproved(req, res);
  if (!user) return null;
  if (!user.admin) {
    json(res, 403, { error: 'admin_required', message: 'Admin permission is required.' });
    return null;
  }
  return user;
}

function record(user, event, resourceId) {
  const entry = { at: new Date().toISOString(), user: user.email, event, resourceId };
  activity.unshift(entry);
  return entry;
}

async function staticFile(req, res) {
  const requested = req.url === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname;
  const safePath = normalize(requested).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = join(publicDir, safePath);
  try {
    const body = await readFile(filePath);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    res.end(body);
  } catch {
    json(res, 404, { error: 'not_found' });
  }
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/session') {
    const user = currentUser(req);
    json(res, 200, { user, configured: driveConfigured() });
    return;
  }

  if (url.pathname === '/api/library') {
    const user = requireApproved(req, res);
    if (!user) return;
    json(res, 200, { configured: driveConfigured(), resources: driveConfigured() ? resources : [] });
    return;
  }

  const resourceMatch = url.pathname.match(/^\/api\/resources\/([^/]+)\/(open|preview|download)$/);
  if (resourceMatch) {
    const user = requireApproved(req, res);
    if (!user) return;
    const [, resourceId, action] = resourceMatch;
    const resource = resources.find((item) => item.id === resourceId);
    if (!resource) {
      json(res, 404, { error: 'resource_not_found' });
      return;
    }
    const event = action === 'download' ? 'download_started' : `${resource.type}_opened`;
    const log = record(user, event, resourceId);
    json(res, 200, { ok: true, event: log, message: driveConfigured() ? 'Access recorded.' : 'Google Drive is not configured yet.' });
    return;
  }

  if (url.pathname === '/api/profile') {
    const user = requireApproved(req, res);
    if (!user) return;
    json(res, 200, { user, activity: activity.filter((entry) => entry.user === user.email) });
    return;
  }

  if (url.pathname === '/api/admin/users') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, { users: [...users.values()] });
    return;
  }

  if (url.pathname === '/api/admin/activity') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    json(res, 200, { activity });
    return;
  }

  if (url.pathname.startsWith('/api/admin/users/') && req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const email = decodeURIComponent(url.pathname.split('/').at(-2));
    const action = url.pathname.split('/').at(-1);
    const user = users.get(email);
    if (!user || !['approve', 'revoke'].includes(action)) {
      json(res, 404, { error: 'not_found' });
      return;
    }
    user.approved = action === 'approve';
    record(admin, action === 'approve' ? 'user_approved' : 'user_revoked', email);
    json(res, 200, { user });
    return;
  }

  await staticFile(req, res);
}

export { handler, currentUser, requireApproved, requireAdmin, record, activity, resources, driveConfigured };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer(handler).listen(port, () => {
    console.log(`DP Resources listening on http://localhost:${port}`);
  });
}
