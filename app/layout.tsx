import './globals.css';
import { ToastProvider } from '@/components/toast';
import type { Metadata } from 'next';
import { GlobalSearch } from '@/components/global-search';

export const metadata: Metadata = { title: 'DP Resources', description: 'Secure DP Resources portal' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><ToastProvider>{children}</ToastProvider><GlobalSearch /></body></html>;
}
