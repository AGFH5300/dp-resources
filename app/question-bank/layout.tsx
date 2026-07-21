import type { Metadata } from 'next';
import { privatePageMetadata } from '@/lib/seo';

export const metadata: Metadata = privatePageMetadata('Question Bank');

export default function QuestionBankLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
