import { useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import { PopoverPanel } from '@/components/ui/PopoverPanel';

export type MenuItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  shortcut?: string;
};

export function Menu({
  items,
  trigger,
  align = 'end',
  width = 232,
  label = 'More actions',
  className,
}: {
  items: MenuItem[];
  trigger?: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  label?: string;
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={clsx(
          'inline-flex items-center justify-center rounded-lg transition-all active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
          trigger
            ? ''
            : 'h-9 w-9 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
          className,
        )}
      >
        {trigger ?? <MoreHorizontal size={16} />}
      </button>

      <PopoverPanel
        open={open}
        triggerRef={triggerRef}
        onRequestClose={() => setOpen(false)}
        matchWidth={false}
        minWidth={width}
        maxWidth={width + 96}
        maxHeight={420}
        className={align === 'end' ? 'origin-top-right' : 'origin-top-left'}
      >
        <ul className="max-h-[420px] overflow-y-auto p-1.5">
          {items.map((item) => (
            <li key={item.key}>
              {item.separatorBefore && (
                <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
              )}
              <button
                type="button"
                disabled={item.disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] transition-colors',
                  item.disabled && 'cursor-not-allowed text-slate-300 dark:text-slate-600',
                  !item.disabled &&
                    (item.danger
                      ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'),
                )}
              >
                {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
                <span className="flex-1 truncate">{item.label}</span>
                {item.shortcut && (
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    {item.shortcut}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverPanel>
    </>
  );
}
