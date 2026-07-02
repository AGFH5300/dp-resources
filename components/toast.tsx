'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; tone: Tone };
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dismiss = useCallback((id:number)=>setToasts(t=>t.filter(x=>x.id!==id)),[]);
  const value = useCallback((message: string, tone: Tone = 'info') => { const id = Date.now() + Math.random(); setToasts(t => [...t, { id, message, tone }]); setTimeout(() => dismiss(id), 4500); }, [dismiss]);
  const node = <div className="fixed inset-x-3 bottom-20 z-[80] space-y-2 md:inset-x-auto md:bottom-auto md:right-5 md:top-[4.75rem]" aria-live="polite">{toasts.map(t => { const Icon=t.tone==='error'?AlertCircle:t.tone==='success'?CheckCircle2:Info; return <div key={t.id} className={`flex min-w-72 max-w-sm items-start gap-3 rounded-lg border px-3 py-3 text-sm shadow-lg ${t.tone==='error'?'border-red-200 bg-red-50 text-red-900':t.tone==='success'?'border-emerald-200 bg-emerald-50 text-emerald-900':'border-slate-200 bg-white text-slate-800'}`}><Icon className="mt-0.5 size-4 shrink-0"/><span className="flex-1">{t.message}</span><button aria-label="Dismiss notification" onClick={()=>dismiss(t.id)} className="rounded p-0.5 hover:bg-black/5"><X className="size-4"/></button></div>})}</div>;
  return <ToastContext.Provider value={value}>{children}{mounted ? createPortal(node, document.body) : null}</ToastContext.Provider>;
}
export function useToast() { return useContext(ToastContext); }
