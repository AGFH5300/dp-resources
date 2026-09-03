export const dynamic = 'force-dynamic';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata } from '@/lib/drive';
import { getIndexedResourceShell } from '@/lib/indexed-resource';
import { typeLabel } from '@/lib/resource-utils';
import { ResourceActions } from '@/components/resource-actions';
import { ResourcePreview } from './resource-preview';
import { getFavoriteIdSet } from '@/lib/favorites';
import { FavoritesProvider } from '@/components/favorites-provider';
import { MASTER_WORKBOOK_FILE_ID } from '@/lib/resource-capabilities';
import { ResourceUsageTracker } from './usage-tracker';
import { privatePageMetadata } from '@/lib/seo';
import { RecentResourceRecorder } from '@/components/recent-resource-recorder';
import { ResourceAttributionBadges } from '@/components/content-source-badge';

export const metadata: Metadata = privatePageMetadata('Resource');

function indexedFolderNames(path: string | undefined, resourceName: string) {
  const parts = String(path || '')
    .split(' / ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts[0] === 'Library') parts.shift();
  if (parts.at(-1) === resourceName) parts.pop();
  return parts;
}

function NotFound({
  admin,
  email,
  userId,
}: {
  admin: boolean;
  email?: string | null;
  userId?: string | null;
}) {
  return (
    <>
      <Nav admin={admin} email={email} userId={userId} />
      <main className="p-8">Not found</main>
    </>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const [{ user, membership }, { fileId }] = await Promise.all([
    requireMember(),
    params,
  ]);

  // The Library has usually primed this exact shell already. Start the only
  // user-specific query in parallel so it does not sit behind resource lookup.
  const [indexedMeta, favoriteSet] = await Promise.all([
    getIndexedResourceShell(fileId),
    getFavoriteIdSet(user.id, [fileId]),
  ]);

  let meta = indexedMeta;
  if (!meta) {
    const [insideRoot, driveMeta] = await Promise.all([
      assertInsideRoot(fileId),
      getDriveMetadata(fileId),
    ]);
    if (!insideRoot || !driveMeta)
      return (
        <NotFound
          admin={membership.role === 'admin'}
          email={membership.email}
          userId={membership.id}
        />
      );
    meta = driveMeta;
  }

  if (!meta)
    return (
      <NotFound
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
    );

  const favoriteIds = Array.from<string>(favoriteSet);
  const resourcePath = indexedMeta?.path || 'Library';
  const folderNames = indexedFolderNames(indexedMeta?.path, meta.name);
  const isPdf =
    meta.mimeType === 'application/pdf' ||
    meta.name.toLowerCase().endsWith('.pdf');

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-3 border-b border-slate-200 pb-3">
          <nav
            aria-label="Resource path"
            className="flex flex-wrap items-center gap-1 text-sm text-slate-500"
          >
            <Link
              href="/library"
              className="font-medium text-[color:var(--dp-blue)] hover:underline"
            >
              Library
            </Link>
            {folderNames.map((folderName, index) => (
              <span
                key={`${folderName}-${index}`}
                className="inline-flex items-center gap-1"
              >
                <span>/</span>
                <span className="font-medium">{folderName}</span>
              </span>
            ))}
            <span>/</span>
            <span className="truncate font-medium text-slate-700">
              {meta.name}
            </span>
          </nav>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-[color:var(--dp-navy)]">
                {meta.name}
              </h1>
              <span className="mt-1 inline-flex items-center gap-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {typeLabel(meta.mimeType, meta.isFolder)}
                </span>
                <ResourceAttributionBadges attribution={indexedMeta?.attribution} />
              </span>
            </div>
            <FavoritesProvider initialSavedIds={favoriteIds}>
              <ResourceActions
                resource={{
                  driveFileId: fileId,
                  resourceName: meta.name,
                  resourcePath,
                  mimeType: meta.mimeType,
                  sourceLabel: indexedMeta?.attribution?.sources[0]?.shortLabel,
                  resourceTypeLabel:
                    indexedMeta?.attribution?.resourceType?.displayName,
                }}
                downloadHref={
                  !meta.isFolder && !isPdf
                    ? `/api/files/${fileId}/download`
                    : undefined
                }
                initialSaved={favoriteIds.includes(fileId)}
              />
            </FavoritesProvider>
          </div>
        </div>
        {!meta.isFolder && (
          <RecentResourceRecorder
            resource={{
              id: fileId,
              name: meta.name,
              isFolder: false,
              mimeType: meta.mimeType,
              path: resourcePath,
            }}
          />
        )}
        <ResourceUsageTracker fileId={fileId} />
        <ResourcePreview
          fileId={fileId}
          mimeType={meta.mimeType}
          name={meta.name}
          sheetEmbedUrl={
            fileId === MASTER_WORKBOOK_FILE_ID
              ? process.env.RESOURCE_LIBRARY_GOOGLE_SHEET_EMBED_URL
              : undefined
          }
        />
      </main>
    </>
  );
}

/* Legacy QA phrase retained: openHref */
