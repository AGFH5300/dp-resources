import type { Metadata } from 'next'
import { privatePageMetadata } from '@/lib/seo'

export const metadata: Metadata = privatePageMetadata('Set password')

export default function SetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
