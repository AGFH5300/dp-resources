import type { Metadata } from 'next';
import { privatePageMetadata } from '@/lib/seo';

export const metadata: Metadata = privatePageMetadata('Verify code');

export default function VerifyOtpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
