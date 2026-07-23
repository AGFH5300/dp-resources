'use client';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

export type SelectOption = { value: string; label: string };

export function AppSelect({
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = 'Select',
  disabled = false,
  searchable = false,
  searchPlaceholder = 'Search options',
  emptyMessage = 'No matching options',
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!searchable || !normalized) return options;
    return options.filter((option) =>
      option.label.toLocaleLowerCase().includes(normalized),
    );
  }, [options, query, searchable]);

  return (
    <Select.Root
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery('');
      }}
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
          side="bottom"
          align="start"
          sideOffset={5}
          avoidCollisions={false}
          className="dp-select-content z-[110] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border text-sm shadow-lg outline-none ring-0"
        >
          {searchable ? (
            <div className="dp-select-search">
              <Search className="size-4" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setOpen(false);
                    return;
                  }
                  event.stopPropagation();
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
              />
            </div>
          ) : null}
          <Select.Viewport className="dp-select-viewport">
            {filteredOptions.map((o) => (
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
            {!filteredOptions.length ? (
              <p className="dp-select-empty">{emptyMessage}</p>
            ) : null}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
