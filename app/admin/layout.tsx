import type { Metadata } from 'next';
import { privatePageMetadata } from '@/lib/seo';

export const metadata: Metadata = privatePageMetadata('Admin');

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
