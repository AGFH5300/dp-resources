'use client';
import { Toaster } from 'sonner';
export function AppToaster() {
  return <Toaster position="bottom-right" closeButton richColors={false} toastOptions={{ classNames: { toast: 'dp-sonner-toast dp-sonner-default', default: 'dp-sonner-default', success: 'dp-sonner-success', error: 'dp-sonner-error', warning: 'dp-sonner-warning', info: 'dp-sonner-info', loading: 'dp-sonner-loading', icon: 'dp-sonner-icon', closeButton: 'dp-sonner-close' } }} />;
}
