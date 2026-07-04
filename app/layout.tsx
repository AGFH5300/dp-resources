import './globals.css';
import { AppToaster } from '@/components/sonner-provider';
import type { Metadata } from 'next';
import { GlobalSearch } from '@/components/global-search';

export const metadata: Metadata = { title: 'DP Resources', description: 'Secure DP Resources portal' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<GlobalSearch /><AppToaster /></body></html>;
}
