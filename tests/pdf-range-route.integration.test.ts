import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchDriveMediaResponse: vi.fn(),
  pdfPreviewSessionFromRequest: vi.fn(),
}));

vi.mock('@/lib/media-range', () => ({
  fetchDriveMediaResponse: mocks.fetchDriveMediaResponse,
}));
vi.mock('@/lib/pdf-preview-session', () => ({
  pdfPreviewSessionFromRequest: mocks.pdfPreviewSessionFromRequest,
}));

import { GET, HEAD } from '../app/api/resource/[fileId]/pdf-content/route';

const fileId = 'drive-file-1';
const totalSize = 50_000_000;
const session = {
  fileId,
  fileName: 'large.pdf',
  mimeType: 'application/pdf',
  size: totalSize,
  modifiedTime: '2026-07-14T00:00:00.000Z',
  userId: 'user-1',
  expiresAt: 4_000_000_000,
};
const context = { params: Promise.resolve({ fileId }) };

function request(range?: string) {
  return new Request(`http://localhost/api/resource/${fileId}/pdf-content`, {
    headers: range ? { Range: range } : undefined,
  });
}

function partial(start: number, end: number) {
  const length = end - start + 1;
  return new Response(new Uint8Array(length), {
    status: 206,
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(length),
      'content-range': `bytes ${start}-${end}/${totalSize}`,
    },
  });
}

beforeEach(() => {
  mocks.fetchDriveMediaResponse.mockReset();
  mocks.pdfPreviewSessionFromRequest.mockReset();
  mocks.pdfPreviewSessionFromRequest.mockReturnValue(session);
});

describe('authenticated PDF range route', () => {
  it.each([
    ['beginning', 'bytes=0-1023', 0, 1023],
    ['middle', 'bytes=4096-8191', 4096, 8191],
    ['suffix', 'bytes=-500', totalSize - 500, totalSize - 1],
    [
      'open-ended',
      `bytes=${totalSize - 1000}-`,
      totalSize - 1000,
      totalSize - 1,
    ],
  ])(
    'forwards and returns a correct %s range',
    async (_label, header, start, end) => {
      mocks.fetchDriveMediaResponse.mockResolvedValue(partial(start, end));

      const response = await GET(request(header), context);

      expect(mocks.fetchDriveMediaResponse).toHaveBeenCalledWith(
        fileId,
        'application/pdf',
        'large.pdf',
        `bytes=${start}-${end}`,
      );
      expect(response.status).toBe(206);
      expect(response.headers.get('accept-ranges')).toBe('bytes');
      expect(response.headers.get('content-range')).toBe(
        `bytes ${start}-${end}/${totalSize}`,
      );
      expect(response.headers.get('content-length')).toBe(
        String(end - start + 1),
      );
    },
  );

  it('never streams the complete original PDF through the preview route', async () => {
    const response = await GET(request(), context);

    expect(response.status).toBe(400);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(mocks.fetchDriveMediaResponse).not.toHaveBeenCalled();
  });

  it('returns 416 for an invalid range without contacting Drive', async () => {
    const response = await GET(request(`bytes=${totalSize}-`), context);

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${totalSize}`);
    expect(mocks.fetchDriveMediaResponse).not.toHaveBeenCalled();
  });

  it('returns 416 for a valid but oversized range without contacting Drive', async () => {
    const response = await GET(request('bytes=0-33554432'), context);

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${totalSize}`);
    expect(mocks.fetchDriveMediaResponse).not.toHaveBeenCalled();
  });

  it('rejects Drive silently returning 200 for a requested range', async () => {
    mocks.fetchDriveMediaResponse.mockResolvedValue(
      new Response(new Uint8Array(10), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(totalSize),
        },
      }),
    );

    const response = await GET(request('bytes=0-9'), context);

    expect(response.status).toBe(502);
  });

  it('rejects an incorrect Content-Range or Content-Length', async () => {
    mocks.fetchDriveMediaResponse.mockResolvedValueOnce(
      new Response(new Uint8Array(10), {
        status: 206,
        headers: {
          'content-range': `bytes 1-10/${totalSize}`,
          'content-length': '10',
        },
      }),
    );
    expect((await GET(request('bytes=0-9'), context)).status).toBe(502);

    mocks.fetchDriveMediaResponse.mockResolvedValueOnce(
      new Response(new Uint8Array(9), {
        status: 206,
        headers: {
          'content-range': `bytes 0-9/${totalSize}`,
          'content-length': '9',
        },
      }),
    );
    expect((await GET(request('bytes=0-9'), context)).status).toBe(502);
  });

  it('fails closed when preview authorization is missing or expired', async () => {
    mocks.pdfPreviewSessionFromRequest.mockReturnValue(null);

    expect((await HEAD(request(), context)).status).toBe(401);
    expect((await GET(request('bytes=0-9'), context)).status).toBe(401);
    expect(mocks.fetchDriveMediaResponse).not.toHaveBeenCalled();
  });

  it('reports complete metadata on HEAD without fetching Drive', async () => {
    const response = await HEAD(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-length')).toBe(String(totalSize));
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(mocks.fetchDriveMediaResponse).not.toHaveBeenCalled();
  });
});
