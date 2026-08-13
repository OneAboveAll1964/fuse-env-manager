import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { PopoverPanel } from '@/components/ui/PopoverPanel';

export type SelectOption<T extends string | number = string> = {
  value: T;
  label: string;
  sublabel?: ReactNode;
  disabled?: boolean;
};

export type SelectProps<T extends string | number = string> = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  placeholder?: string;
  options: SelectOption<T>[];
  value?: T | '' | null;
  onChange?: (value: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  leading?: ReactNode;
};

function SelectInner<T extends string | number>(
  {
    label,
    hint,
    error,
    size = 'md',
    placeholder = '—',
    options,
    value,
    onChange,
    searchable,
    searchPlaceholder = 'Search…',
    emptyText = 'No options',
    clearable = false,
    disabled,
    className,
    id,
    name,
    leading,
  }: SelectProps<T>,
  ref: React.ForwardedRef<HTMLButtonElement>,
): JSX.Element {
  const isSearchable = searchable ?? options.length > 8;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const fieldId = id ?? name;

  const setRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  useEffect(() => {
    if (open && isSearchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
    if (!open) {
      setQuery('');
      setActiveIdx(-1);
    }
    return undefined;
  }, [open, isSearchable]);

  const heightClass =
    size === 'lg' ? 'h-12 text-[15px]' : size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-[14px]';

  const select = useCallback(
    (opt: SelectOption<T>) => {
      if (opt.disabled) return;
      onChange?.(opt.value);
      setOpen(false);
      setQuery('');
    },
    [onChange],
  );

  const onKey = (e: React.KeyboardEvent): void => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[activeIdx];
      if (o) select(o);
    }
  };

  return (
    <label htmlFor={fieldId} className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </span>
      )}
      <div className="relative">
        <button
          ref={setRefs}
          type="button"
          id={fieldId}
          name={name}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          onKeyDown={onKey}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={clsx(
            'flex w-full items-center gap-2 rounded-xl border bg-white text-start text-slate-900 transition-all dark:bg-slate-900 dark:text-slate-100',
            leading ? 'ps-3' : 'ps-3.5',
            'pe-3.5',
            'focus:outline-none focus:ring-4 focus:ring-brand-500/15',
            error
              ? 'border-rose-300 focus:border-rose-400 dark:border-rose-900'
              : 'border-slate-200 focus:border-brand-500 dark:border-slate-800',
            disabled && 'cursor-not-allowed bg-slate-50 text-slate-400 dark:bg-slate-800',
            heightClass,
            className,
          )}
        >
          {leading && (
            <span className="shrink-0 text-slate-400 dark:text-slate-500">{leading}</span>
          )}
          <span
            className={clsx('flex-1 truncate', !selected && 'text-slate-400 dark:text-slate-500')}
          >
            {selected ? selected.label : placeholder}
          </span>
          {clearable && selected && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('' as T);
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <X size={14} />
            </span>
          ) : (
            <ChevronDown
              size={16}
              className={clsx('text-slate-400 transition-transform', open && 'rotate-180')}
            />
          )}
        </button>

        <PopoverPanel
          open={open}
          triggerRef={triggerRef}
          onRequestClose={() => setOpen(false)}
          className="flex flex-col"
        >
          {isSearchable && (
            <div className="shrink-0 border-b border-slate-100 p-2 dark:border-slate-800">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 focus-within:bg-white dark:border-slate-800 dark:bg-slate-800">
                <Search size={14} className="text-slate-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIdx(-1);
                  }}
                  onKeyDown={onKey}
                  placeholder={searchPlaceholder}
                  className="block h-9 w-full bg-transparent text-sm outline-none dark:text-slate-100"
                />
              </div>
            </div>
          )}
          <ul role="listbox" className="min-h-0 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">{emptyText}</li>
            ) : (
              filtered.map((opt, idx) => {
                const active = idx === activeIdx;
                const isSel = selected?.value === opt.value;
                return (
                  <li key={String(opt.value)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      disabled={opt.disabled}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => select(opt)}
                      className={clsx(
                        'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start text-sm transition-colors dark:text-slate-200',
                        opt.disabled && 'cursor-not-allowed text-slate-300 dark:text-slate-600',
                        !opt.disabled && active && 'bg-slate-50 dark:bg-slate-800',
                        !opt.disabled &&
                          isSel &&
                          'bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-200',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {opt.sublabel}
                          </span>
                        )}
                      </span>
                      {isSel && <Check size={14} className="shrink-0 text-brand-600" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </PopoverPanel>
      </div>
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-rose-600 dark:text-rose-300">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

export const Select = forwardRef(SelectInner) as <T extends string | number = string>(
  props: SelectProps<T> & { ref?: React.ForwardedRef<HTMLButtonElement> },
) => JSX.Element;
