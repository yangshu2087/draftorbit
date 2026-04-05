'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  pushToast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: { title: string; description?: string; variant?: ToastVariant }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? 'info'
      };
      setItems((prev) => [...prev, item]);
      window.setTimeout(() => remove(id), 3200);
    },
    [remove]
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[80] space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto w-[320px] rounded-xl border p-3 shadow-lg backdrop-blur',
              item.variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
              item.variant === 'error' && 'border-red-200 bg-red-50 text-red-900',
              item.variant === 'info' && 'border-slate-900/12 bg-white text-slate-900'
            )}
          >
            <p className="text-sm font-semibold">{item.title}</p>
            {item.description ? <p className="mt-1 text-xs opacity-85">{item.description}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
