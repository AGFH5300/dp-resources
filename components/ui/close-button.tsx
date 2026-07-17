import type { ButtonHTMLAttributes } from 'react';

type CloseButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'children' | 'aria-label'
> & {
  label?: string;
};

export function CloseButton({
  label = 'Close',
  className = '',
  ...props
}: CloseButtonProps) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-2xl leading-none text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dp-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
