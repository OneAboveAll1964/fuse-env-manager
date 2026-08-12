import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';

const SIZES: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
  '3xl': 'max-w-6xl',
  full: 'max-w-[95vw]',
};

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  hideCloseButton?: boolean;
};

export function Modal({
  open,
  onClose,
  eyebrow,
  title,
  description,
  size = 'lg',
  children,
  footer,
  closeOnBackdrop = true,
  hideCloseButton = false,
}: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 md:p-6 animate-fade-in"
      onClick={() => {
        if (closeOnBackdrop) onClose();
      }}
    >
      <div
        className={clsx(
          'flex w-full flex-col overflow-hidden bg-white ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-slate-100/10',
          'max-h-[92vh] rounded-2xl animate-zoom-in-95',
          SIZES[size],
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {(eyebrow || title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 md:px-7 md:py-5 dark:border-slate-800">
            <div className="min-w-0 flex-1">
              {eyebrow && <div className="label-eyebrow mb-1">{eyebrow}</div>}
              {title && (
                <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-me-1.5 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-7 md:py-6">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 md:px-7 md:py-4 dark:border-slate-800 dark:bg-slate-800/40">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
