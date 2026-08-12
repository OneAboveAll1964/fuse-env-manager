import clsx from 'clsx';
import { Check } from 'lucide-react';
import { TONES } from '@shared/defaults';
import type { Tone } from '@shared/types';
import { TONE_CLASSES } from '@/lib/format';
import { iconByName } from '@/lib/icons';

export function TonePicker({
  value,
  onChange,
  label = 'Colour',
}: {
  value: Tone;
  onChange: (tone: Tone) => void;
  label?: string;
}): JSX.Element {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {TONES.map((tone) => (
          <button
            key={tone}
            type="button"
            title={tone}
            aria-label={tone}
            onClick={() => onChange(tone)}
            className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-lg text-white transition-transform active:scale-95',
              TONE_CLASSES[tone].bar,
              value === tone &&
                'ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-slate-900',
            )}
          >
            {value === tone && <Check size={13} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function IconPicker({
  value,
  onChange,
  names,
  label = 'Icon',
}: {
  value: string;
  onChange: (icon: string) => void;
  names: string[];
  label?: string;
}): JSX.Element {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => {
          const Icon = iconByName(name);
          const active = value === name;
          return (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={name}
              onClick={() => onChange(name)}
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
                active
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              <Icon size={15} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
