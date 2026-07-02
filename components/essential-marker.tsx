import { Star } from 'lucide-react';

export function EssentialMarker({ label = 'Essential', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
      <Star className="size-3 fill-amber-500 text-amber-600" aria-hidden="true" />
      {compact ? label : label}
    </span>
  );
}
