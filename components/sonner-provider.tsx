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
          overflow: visible !important;
        }

        [data-sonner-toast].dp-sonner-toast .dp-sonner-close {
          position: absolute !important;
          inset-block-start: 0 !important;
          inset-inline-start: auto !important;
          inset-inline-end: 0 !important;
          top: 0 !important;
          right: 0 !important;
          left: auto !important;
          width: 2rem !important;
          height: 2rem !important;
          margin: 0 !important;
          padding: 0 !important;
          display: grid !important;
          place-items: center !important;
          transform: translate(40%, -40%) !important;
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
