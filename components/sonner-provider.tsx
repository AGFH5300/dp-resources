'use client';
import { Toaster } from 'sonner';

export function AppToaster() {
  return <Toaster position="bottom-right" closeButton richColors={false} toastOptions={{ classNames: { toast: 'dp-sonner-toast', success: 'dp-sonner-success', error: 'dp-sonner-error', icon: 'dp-sonner-icon', closeButton: 'dp-sonner-close' } }} />;
}
