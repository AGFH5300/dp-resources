'use client';

import { Toaster } from 'sonner';

export function AppToaster() {
  return (
    <>
      <Toaster
        position="bottom-right"
        closeButton
        richColors={false}
        toastOptions={{
          classNames: {
            toast: 'dp-sonner-toast dp-sonner-default',
            default: 'dp-sonner-default',
            success: 'dp-sonner-success',
            error: 'dp-sonner-error',
            warning: 'dp-sonner-warning',
            info: 'dp-sonner-info',
            loading: 'dp-sonner-loading',
            icon: 'dp-sonner-icon',
            closeButton: 'dp-sonner-close',
          },
        }}
      />
      <style jsx global>{`
        [data-sonner-toast].dp-sonner-toast {
          position: relative !important;
          padding-inline-end: 4rem !important;
        }

        [data-sonner-toast].dp-sonner-toast .dp-sonner-close {
          position: absolute !important;
          inset-block-start: 1rem !important;
          inset-inline-start: auto !important;
          inset-inline-end: 1rem !important;
          top: 1rem !important;
          right: 1rem !important;
          left: auto !important;
          width: 2rem !important;
          height: 2rem !important;
          margin: 0 !important;
          padding: 0 !important;
          display: grid !important;
          place-items: center !important;
          transform: none !important;
          border: 0 !important;
          border-radius: 9999px !important;
          z-index: 2 !important;
        }

        [data-sonner-toast].dp-sonner-toast .dp-sonner-close svg {
          width: 1rem !important;
          height: 1rem !important;
        }
      `}</style>
    </>
  );
}
