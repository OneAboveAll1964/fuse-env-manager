import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

type Rect = {
  top: number;
  left: number;
  width: number;
  placement: 'top' | 'bottom';
};

export function PopoverPanel({
  open,
  triggerRef,
  onRequestClose,
  children,
  matchWidth = true,
  minWidth,
  maxWidth,
  maxHeight = 320,
  offset = 8,
  className,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement>;
  onRequestClose: () => void;
  children: ReactNode;
  matchWidth?: boolean;
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  offset?: number;
  className?: string;
}): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - 16;
      const spaceAbove = r.top - 16;
      const placement: 'top' | 'bottom' =
        spaceBelow >= maxHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
      setRect({
        top: placement === 'bottom' ? r.bottom + offset : r.top - offset,
        left: r.left,
        width: r.width,
        placement,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, triggerRef, offset, maxHeight]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onRequestClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onRequestClose();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onRequestClose, triggerRef]);

  if (!open || !rect) return null;

  const isAbove = rect.placement === 'top';
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(rect.left, window.innerWidth - (maxWidth ?? rect.width) - 12),
    width: matchWidth ? rect.width : undefined,
    minWidth,
    maxWidth,
    maxHeight,
    zIndex: 100,
    ...(isAbove ? { bottom: window.innerHeight - rect.top } : { top: rect.top }),
  };

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className={clsx(
        'overflow-hidden rounded-xl border border-slate-200 bg-white animate-zoom-in-95 dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
