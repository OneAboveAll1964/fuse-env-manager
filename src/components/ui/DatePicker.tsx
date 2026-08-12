import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, Infinity as InfinityIcon, X } from 'lucide-react';
import { PopoverPanel } from '@/components/ui/PopoverPanel';

export const INDEFINITE_VALUE = '__indefinite__';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  size?: 'sm' | 'md';
  displayFormat?: string;
  allowIndefinite?: boolean;
  indefiniteLabel?: string;
  startYearOffset?: number;
  className?: string;
  id?: string;
  name?: string;
};

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIso(value: string): Date | null {
  if (!value || value === INDEFINITE_VALUE) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    const loose = new Date(value);
    return Number.isNaN(loose.getTime()) ? null : loose;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDisplay(value: string, format: string): string {
  const d = parseIso(value);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  if (format === 'yyyy-MM-dd') return `${yyyy}-${mm}-${dd}`;
  if (format === 'dd-MMM-yyyy') return `${dd}-${MONTHS[d.getMonth()].slice(0, 3)}-${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildGrid(view: Date): Array<Date | null> {
  const first = startOfMonth(view);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(view.getFullYear(), view.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DatePicker({
  value,
  onChange,
  label,
  hint,
  error,
  placeholder = 'Select a date',
  disabled,
  clearable = true,
  size = 'md',
  displayFormat = 'dd/MM/yyyy',
  allowIndefinite = false,
  indefiniteLabel = 'No end date (open-ended)',
  startYearOffset,
  className,
  id,
  name,
}: DatePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isIndefinite = value === INDEFINITE_VALUE;
  const selected = parseIso(value);

  const defaultView = useCallback((): Date => {
    const base = new Date();
    if (startYearOffset) base.setFullYear(base.getFullYear() - startYearOffset);
    return startOfMonth(base);
  }, [startYearOffset]);

  const [view, setView] = useState<Date>(() => startOfMonth(selected ?? defaultView()));
  const [yearDraft, setYearDraft] = useState<string>(() => String(view.getFullYear()));

  useEffect(() => {
    if (!open) return;
    const next = startOfMonth(parseIso(value) ?? defaultView());
    setView(next);
    setYearDraft(String(next.getFullYear()));
  }, [open, value, defaultView]);

  const cells = useMemo(() => buildGrid(view), [view]);
  const todayIso = toIso(new Date());
  const heightClass = size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-[14px]';
  const fieldId = id ?? name;

  const display = isIndefinite ? indefiniteLabel : formatDisplay(value, displayFormat);

  return (
    <label htmlFor={fieldId} className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </span>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={fieldId}
          name={name}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          className={clsx(
            'flex w-full items-center gap-2 rounded-xl border bg-white ps-3.5 pe-3 text-start transition-all dark:bg-slate-900',
            'focus:outline-none focus:ring-4 focus:ring-brand-500/15',
            error
              ? 'border-rose-300 focus:border-rose-400 dark:border-rose-900'
              : 'border-slate-200 focus:border-brand-500 dark:border-slate-800',
            disabled && 'cursor-not-allowed bg-slate-50 text-slate-400 dark:bg-slate-800',
            heightClass,
            className,
          )}
        >
          {isIndefinite ? (
            <InfinityIcon size={15} className="shrink-0 text-brand-500" />
          ) : (
            <CalendarDays size={15} className="shrink-0 text-slate-400" />
          )}
          <span
            className={clsx(
              'flex-1 truncate',
              display ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {display || placeholder}
          </span>
          {clearable && value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              title="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <X size={14} />
            </span>
          )}
        </button>

        <PopoverPanel
          open={open}
          triggerRef={triggerRef}
          onRequestClose={() => setOpen(false)}
          matchWidth={false}
          minWidth={286}
          maxWidth={320}
          maxHeight={400}
        >
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                title="Previous month"
                onClick={() => {
                  const next = new Date(view.getFullYear(), view.getMonth() - 1, 1);
                  setView(next);
                  setYearDraft(String(next.getFullYear()));
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronLeft size={15} />
              </button>
              <div className="flex items-center gap-1">
                <select
                  value={view.getMonth()}
                  onChange={(e) => setView(new Date(view.getFullYear(), Number(e.target.value), 1))}
                  className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[13px] font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  value={yearDraft}
                  onChange={(e) => setYearDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                  onBlur={() => {
                    const y = Number(yearDraft);
                    if (y >= 1900 && y <= 2200) setView(new Date(y, view.getMonth(), 1));
                    else setYearDraft(String(view.getFullYear()));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setYearDraft(String(view.getFullYear()));
                  }}
                  className="w-[68px] rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-center text-[13px] font-medium tabular-nums text-slate-800 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                title="Next month"
                onClick={() => {
                  const next = new Date(view.getFullYear(), view.getMonth() + 1, 1);
                  setView(next);
                  setYearDraft(String(next.getFullYear()));
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {w}
                </div>
              ))}
              {cells.map((date, i) => {
                if (!date) return <div key={`e${i}`} />;
                const iso = toIso(date);
                const isSelected = !isIndefinite && iso === value;
                const isToday = iso === todayIso;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    className={clsx(
                      'flex h-8 items-center justify-center rounded-lg text-[13px] transition-colors',
                      isSelected
                        ? 'bg-brand-600 font-semibold text-white'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                      !isSelected && isToday && 'ring-1 ring-inset ring-brand-400',
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onChange(todayIso);
                  setOpen(false);
                }}
                className="rounded-lg px-2 py-1 text-[12px] font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40"
              >
                Today
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="rounded-lg px-2 py-1 text-[12px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Clear
              </button>
            </div>

            {allowIndefinite && (
              <button
                type="button"
                onClick={() => {
                  onChange(isIndefinite ? '' : INDEFINITE_VALUE);
                  setOpen(false);
                }}
                className={clsx(
                  'mt-2 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] font-medium transition-colors',
                  isIndefinite
                    ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <InfinityIcon size={13} />
                {indefiniteLabel}
              </button>
            )}
          </div>
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
