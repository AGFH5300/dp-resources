import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AdminActivityUserLinksBridge } from '@/components/admin/activity-user-links';
import { UnsuspendConfirmationDialogBridge } from '@/components/admin/unsuspend-confirmation-dialog';
import { privatePageMetadata } from '@/lib/seo';
import './admin-theme-compat.css';

export const metadata: Metadata = privatePageMetadata('Admin');

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <UnsuspendConfirmationDialogBridge />
      <Suspense fallback={null}>
        <AdminActivityUserLinksBridge />
      </Suspense>
    </>
  );
}
