'use client';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string };

export function AppSelect({ name, value, defaultValue, onValueChange, options, placeholder = 'Select', disabled = false }: { name?: string; value?: string; defaultValue?: string; onValueChange?: (v: string) => void; options: SelectOption[]; placeholder?: string; disabled?: boolean }) {
  return <Select.Root name={name} value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled}>
    <Select.Trigger className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-[color:var(--dp-warm-surface)] px-3 text-sm text-slate-800 outline-none ring-0 transition hover:border-slate-300 hover:bg-white focus-visible:border-slate-300 focus-visible:bg-white data-[state=open]:border-slate-300 data-[state=open]:bg-slate-50 disabled:opacity-60" aria-label={placeholder}>
      <Select.Value placeholder={placeholder} />
      <Select.Icon><ChevronDown className="size-4 text-slate-500" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content position="popper" sideOffset={5} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg outline-none ring-0">
        <Select.Viewport>{options.map(o => <Select.Item key={o.value} value={o.value} className="relative cursor-default select-none py-2 pl-8 pr-3 text-slate-800 outline-none data-[highlighted]:bg-slate-100 data-[state=checked]:bg-slate-50 data-[highlighted]:text-slate-950">
          <Select.ItemIndicator className="absolute left-2 top-2.5 text-slate-600"><Check className="size-4" /></Select.ItemIndicator>
          <Select.ItemText>{o.label}</Select.ItemText>
        </Select.Item>)}</Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
