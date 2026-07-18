'use client';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string };

export function AppSelect({
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = 'Select',
  disabled = false,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Select.Root
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Select.Trigger
        className="dp-select-trigger inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm outline-none ring-0 transition disabled:opacity-60"
        aria-label={placeholder}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="dp-select-indicator size-4" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={5}
          className="dp-select-content z-[90] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border py-1 text-sm shadow-lg outline-none ring-0"
        >
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                className="dp-select-item relative cursor-default select-none py-2 pl-8 pr-3 outline-none"
              >
                <Select.ItemIndicator className="dp-select-indicator absolute left-2 top-2.5">
                  <Check className="size-4" />
                </Select.ItemIndicator>
                <Select.ItemText>{o.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
