import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export function Resizer({
  width,
  min = 220,
  max = 620,
  onPreview,
  onCommit,
  onReset,
}: {
  width: number;
  min?: number;
  max?: number;
  onPreview: (width: number) => void;
  onCommit: (width: number) => void;
  onReset?: () => void;
}): JSX.Element {
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ x: 0, width: 0 });
  const latest = useRef(width);

  const clamp = useCallback(
    (value: number) => Math.min(max, Math.max(min, Math.round(value))),
    [min, max],
  );

  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (event: PointerEvent): void => {
      const next = clamp(origin.current.width + (event.clientX - origin.current.x));
      latest.current = next;
      onPreview(next);
    };
    const onUp = (): void => {
      setDragging(false);
      onCommit(latest.current);
    };

    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, clamp, onPreview, onCommit]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the tree"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize, double click to reset"
      onPointerDown={(event) => {
        event.preventDefault();
        origin.current = { x: event.clientX, width };
        latest.current = width;
        setDragging(true);
      }}
      onDoubleClick={() => onReset?.()}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next = clamp(width + (event.key === 'ArrowLeft' ? -16 : 16));
        onPreview(next);
        onCommit(next);
      }}
      className={clsx(
        'group relative z-20 w-px shrink-0 cursor-col-resize transition-colors',
        dragging ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-800',
      )}
    >
      <span
        className={clsx(
          'absolute inset-y-0 -left-2 -right-2',
          'after:absolute after:inset-y-0 after:left-2 after:w-px after:transition-colors',
          'group-hover:after:bg-brand-400 group-focus-visible:after:bg-brand-500',
        )}
      />
    </div>
  );
}
