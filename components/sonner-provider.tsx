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
          inset-block-start: 1.125rem !important;
          inset-inline-start: auto !important;
          inset-inline-end: 1.125rem !important;
          top: 1.125rem !important;
          right: 1.125rem !important;
          left: auto !important;
          width: 1rem !important;
          height: 1rem !important;
          margin: 0 !important;
          padding: 0 !important;
          display: grid !important;
          place-items: center !important;
          transform: none !important;
          border: 1px solid rgb(255 255 255 / 0.48) !important;
          border-radius: 9999px !important;
          background: rgb(255 255 255 / 0.08) !important;
          color: rgb(255 255 255 / 0.9) !important;
          box-shadow: none !important;
          z-index: 2 !important;
          transition:
            background-color 150ms ease,
            border-color 150ms ease,
            color 150ms ease !important;
        }

        [data-sonner-toast].dp-sonner-toast .dp-sonner-close:hover {
          background: rgb(255 255 255 / 0.18) !important;
          border-color: rgb(255 255 255 / 0.8) !important;
          color: #fff !important;
        }

        [data-sonner-toast].dp-sonner-toast .dp-sonner-close:focus-visible {
          outline: none !important;
          border-color: #fff !important;
          box-shadow: 0 0 0 2px rgb(255 255 255 / 0.22) !important;
        }

        [data-sonner-toast].dp-sonner-toast .dp-sonner-close svg {
          width: 0.75rem !important;
          height: 0.75rem !important;
        }

        button[aria-label^='Report issue with '] {
          border-color: #fca5a5 !important;
          background: #fff1f2 !important;
          color: #b91c1c !important;
        }

        button[aria-label^='Report issue with ']:hover:not(:disabled),
        button[aria-label^='Report issue with ']:focus-visible {
          border-color: #ef4444 !important;
          background: #ffe4e6 !important;
          color: #991b1b !important;
        }

        html[data-theme='dark'] button[aria-label^='Report issue with '] {
          border-color: #7f1d1d !important;
          background: #351720 !important;
          color: #fecaca !important;
        }

        html[data-theme='dark']
          button[aria-label^='Report issue with ']:hover:not(:disabled),
        html[data-theme='dark']
          button[aria-label^='Report issue with ']:focus-visible {
          border-color: #ef4444 !important;
          background: #431d27 !important;
          color: #fee2e2 !important;
        }
      `}</style>
    </>
  );
}
