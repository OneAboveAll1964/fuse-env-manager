import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

type Variant = 'success' | 'error' | 'warning' | 'info';

type Toast = {
  id: number;
  variant: Variant;
  title: string;
  description?: string;
  ttlMs: number;
};

type ToastContextValue = {
  push: (input: { variant?: Variant; title: string; description?: string; ttlMs?: number }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<Variant, ReactNode> = {
  success: <CheckCircle2 size={18} className="text-emerald-500" />,
  error: <XCircle size={18} className="text-red-500" />,
  warning: <AlertTriangle size={18} className="text-amber-500" />,
  info: <Info size={18} className="text-sky-500" />,
};

const RING: Record<Variant, string> = {
  success: 'ring-emerald-200 dark:ring-emerald-900',
  error: 'ring-red-200 dark:ring-red-900',
  warning: 'ring-amber-200 dark:ring-amber-900',
  info: 'ring-sky-200 dark:ring-sky-900',
};

const DEFAULT_TTL: Record<Variant, number> = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: 10000,
};

const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastContextValue['push']>(
    ({ variant = 'info', title, description, ttlMs }) => {
      const id = idRef.current++;
      setItems((prev) => {
        const next = [
          ...prev,
          {
            id,
            variant,
            title,
            description,
            ttlMs: ttlMs ?? DEFAULT_TTL[variant],
          },
        ];
        return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
      });
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ variant: 'success', title, description }),
      error: (title, description) => push({ variant: 'error', title, description }),
      warning: (title, description) => push({ variant: 'warning', title, description }),
      info: (title, description) => push({ variant: 'info', title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-0 z-[80] flex flex-col items-end justify-end gap-2 p-4 sm:p-6">
          {items.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }): JSX.Element {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.ttlMs);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (paused) return undefined;
    startRef.current = Date.now();
    const handle = window.setTimeout(onDismiss, remainingRef.current);
    return () => {
      window.clearTimeout(handle);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startRef.current));
    };
  }, [paused, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={clsx(
        'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-inset dark:bg-slate-900',
        RING[toast.variant],
      )}
    >
      <div className="mt-0.5">{ICONS[toast.variant]}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {toast.title}
        </div>
        {toast.description && (
          <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">
            {toast.description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
