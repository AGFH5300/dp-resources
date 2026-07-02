'use client';
import { createContext, useContext, useMemo, useState } from 'react';

type Toast = { id: number; message: string; tone?: 'success' | 'error' | 'info' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, tone }]);
    setTimeout(() => setToasts((items) => items.filter((t) => t.id !== id)), 3200);
  };
  const value = useMemo(() => push, []);
  return <ToastContext.Provider value={value}>{children}<div className="fixed bottom-4 right-4 z-[70] space-y-2" aria-live="polite">{toasts.map(t => <div key={t.id} className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${t.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : t.tone === 'success' ? 'border-[color:var(--dp-teal)]/20 bg-teal-50 text-teal-800' : 'border-[color:var(--dp-blue)]/20 bg-blue-50 text-blue-900'}`}>{t.message}</div>)}</div></ToastContext.Provider>;
}
export function useToast() { return useContext(ToastContext); }
