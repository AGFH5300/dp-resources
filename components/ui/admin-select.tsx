'use client';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption={value:string;label:string};
export function AdminSelect({name,value,defaultValue,onValueChange,options,placeholder='Select',disabled=false}:{name?:string;value?:string;defaultValue?:string;onValueChange?:(v:string)=>void;options:SelectOption[];placeholder?:string;disabled?:boolean}){
  return <Select.Root name={name} value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled}>
    <Select.Trigger className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-blue-100 disabled:opacity-60" aria-label={placeholder}>
      <Select.Value placeholder={placeholder}/><Select.Icon><ChevronDown className="size-4 text-slate-500"/></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content position="popper" sideOffset={4} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl">
      <Select.Viewport>{options.map(o=><Select.Item key={o.value} value={o.value} className="relative cursor-default select-none py-2 pl-8 pr-3 text-slate-800 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-950"><Select.ItemIndicator className="absolute left-2 top-2.5"><Check className="size-4"/></Select.ItemIndicator><Select.ItemText>{o.label}</Select.ItemText></Select.Item>)}</Select.Viewport>
    </Select.Content></Select.Portal>
  </Select.Root>
}
