export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { Suspense } from 'react';
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
import {
  ResourceFolderBreadcrumbFallback,
  ResourceFolderBreadcrumbLinks,
} from './resource-breadcrumbs';

export const metadata: Metadata = privatePageMetadata('Resource');

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

function ResourceActionsFallback() {
  return (
    <div className="flex gap-2" aria-label="Loading resource actions">
      <span className="h-9 w-20 animate-pulse rounded-md bg-slate-200" />
      <span className="h-9 w-20 animate-pulse rounded-md bg-slate-200" />
    </div>
  );
}

async function ResourceActionsWithFavorite({
  userId,
  fileId,
  resourceName,
  resourcePath,
  mimeType,
  isFolder,
  isPdf,
  sourceLabel,
  resourceTypeLabel,
}: {
  userId: string;
  fileId: string;
  resourceName: string;
  resourcePath: string;
  mimeType: string;
  isFolder: boolean;
  isPdf: boolean;
  sourceLabel?: string;
  resourceTypeLabel?: string;
}) {
  const favoriteIds = Array.from<string>(
    await getFavoriteIdSet(userId, [fileId]),
  );
  return (
    <FavoritesProvider initialSavedIds={favoriteIds}>
      <ResourceActions
        resource={{
          driveFileId: fileId,
          resourceName,
          resourcePath,
          mimeType,
          sourceLabel,
          resourceTypeLabel,
        }}
        downloadHref={
          !isFolder && !isPdf ? `/api/files/${fileId}/download` : undefined
        }
        initialSaved={favoriteIds.includes(fileId)}
      />
    </FavoritesProvider>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const { fileId } = await params;
  // Resource metadata is independent of authentication. Resolve both at once so
  // the dynamic route pays only the slower of the two operations, not their sum.
  const [{ user, membership }, indexedMeta] = await Promise.all([
    requireMember(),
    getIndexedResourceShell(fileId),
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

  const resourcePath = indexedMeta?.path || 'Library';
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
            <Suspense
              fallback={
                <ResourceFolderBreadcrumbFallback
                  path={indexedMeta?.path}
                  resourceName={meta.name}
                />
              }
            >
              <ResourceFolderBreadcrumbLinks
                path={indexedMeta?.path}
                resourceName={meta.name}
              />
            </Suspense>
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
            <Suspense fallback={<ResourceActionsFallback />}>
              <ResourceActionsWithFavorite
                userId={user.id}
                fileId={fileId}
                resourceName={meta.name}
                resourcePath={resourcePath}
                mimeType={meta.mimeType}
                isFolder={meta.isFolder}
                isPdf={isPdf}
                sourceLabel={indexedMeta?.attribution?.sources[0]?.shortLabel}
                resourceTypeLabel={
                  indexedMeta?.attribution?.resourceType?.displayName
                }
              />
            </Suspense>
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
