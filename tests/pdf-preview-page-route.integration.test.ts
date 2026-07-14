import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pdfPreviewSessionFromRequest: vi.fn(),
}));

vi.mock('@/lib/pdf-preview-derivatives', () => ({
  PDF_PREVIEW_BUCKET: 'pdf-previews',
}));
vi.mock('@/lib/pdf-preview-session', () => ({
  pdfPreviewSessionFromRequest: mocks.pdfPreviewSessionFromRequest,
}));

import { GET } from '../app/api/resource/[fileId]/pdf-preview/page/[pageNumber]/route';

const fileId = 'drive-file-1';
const versionKey = 'a'.repeat(64);
const session = {
  fileId,
  fileName: 'large.pdf',
  mimeType: 'application/pdf',
  size: 50_000_000,
  modifiedTime: '2026-07-14T00:00:00.000Z',
  userId: 'user-1',
  previewId: '00000000-0000-4000-8000-000000000001',
  previewVersionKey: versionKey,
  expiresAt: 4_000_000_000,
};
const context = { params: Promise.resolve({ fileId, pageNumber: '1' }) };
const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function request(version = versionKey) {
  return new Request(`http://localhost/api/resource/${fileId}/pdf-preview/page/1?v=${version}`);
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  mocks.pdfPreviewSessionFromRequest.mockReset();
  mocks.pdfPreviewSessionFromRequest.mockReturnValue(session);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
});

describe('private PDF page route', () => {
  it('fails closed for missing authorization', async () => {
    mocks.pdfPreviewSessionFromRequest.mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await GET(request(), context)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a stale or missing derivative version before storage access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await GET(request('b'.repeat(64)), context)).status).toBe(409);
    expect((await GET(new Request(`http://localhost/api/resource/${fileId}/pdf-preview/page/1`), context)).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the deterministic private object is not prepared', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('streams the private object with server-side credentials and no page database lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': '4', etag: '"storage-etag"' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request(), context);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://example.supabase.co/storage/v1/object/authenticated/pdf-previews/${fileId}/${versionKey}/page-1.jpg`);
    expect(new Headers(init.headers).get('apikey')).toBe('service-role-secret');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer service-role-secret');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('etag')).toBe('"storage-etag"');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(response.headers.get('authorization')).toBeNull();
    expect(response.headers.get('apikey')).toBeNull();
  });
});
