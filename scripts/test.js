import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handler } from '../src/server.js';

const server = createServer(handler);
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function request(path, user = 'new@example.com', options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'x-demo-user': user, ...(options.headers || {}) } });
  return { response, body: await response.json() };
}

let result = await request('/api/library');
assert.equal(result.response.status, 403);
assert.equal(result.body.error, 'approval_required');

result = await request('/api/library', 'user@example.com');
assert.equal(result.response.status, 200);
assert.deepEqual(result.body.resources, []);

result = await request('/api/admin/users', 'user@example.com');
assert.equal(result.response.status, 403);
assert.equal(result.body.error, 'admin_required');

result = await request('/api/admin/users', 'admin@example.com');
assert.equal(result.response.status, 200);
assert.ok(result.body.users.some((user) => user.email === 'new@example.com'));

result = await request('/api/resources/file-guidelines/download', 'user@example.com', { method: 'POST' });
assert.equal(result.response.status, 200);
assert.equal(result.body.event.event, 'download_started');

await new Promise((resolve) => server.close(resolve));
console.log('Tests passed.');
