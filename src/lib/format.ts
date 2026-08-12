import type { Tone } from '@shared/types';

export const TONE_CLASSES: Record<Tone, { dot: string; chip: string; bar: string; text: string }> =
  {
    brand: {
      dot: 'bg-brand-600',
      chip: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/50 dark:text-brand-300 dark:ring-brand-800',
      bar: 'bg-brand-600',
      text: 'text-brand-600 dark:text-brand-300',
    },
    accent: {
      dot: 'bg-accent-500',
      chip: 'bg-accent-50 text-accent-800 ring-accent-200 dark:bg-accent-950/50 dark:text-accent-300 dark:ring-accent-800',
      bar: 'bg-accent-600',
      text: 'text-accent-700 dark:text-accent-300',
    },
    emerald: {
      dot: 'bg-emerald-500',
      chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
      bar: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
    },
    amber: {
      dot: 'bg-amber-500',
      chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
      bar: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
    },
    rose: {
      dot: 'bg-rose-500',
      chip: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
      bar: 'bg-rose-500',
      text: 'text-rose-600 dark:text-rose-400',
    },
    violet: {
      dot: 'bg-violet-500',
      chip: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800',
      bar: 'bg-violet-500',
      text: 'text-violet-600 dark:text-violet-400',
    },
    sky: {
      dot: 'bg-sky-500',
      chip: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800',
      bar: 'bg-sky-500',
      text: 'text-sky-600 dark:text-sky-400',
    },
    teal: {
      dot: 'bg-teal-500',
      chip: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800',
      bar: 'bg-teal-500',
      text: 'text-teal-600 dark:text-teal-400',
    },
    fuchsia: {
      dot: 'bg-fuchsia-500',
      chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:ring-fuchsia-800',
      bar: 'bg-fuchsia-500',
      text: 'text-fuchsia-600 dark:text-fuchsia-400',
    },
    slate: {
      dot: 'bg-slate-400',
      chip: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
      bar: 'bg-slate-400',
      text: 'text-slate-600 dark:text-slate-300',
    },
  };

export function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 6) return '•'.repeat(Math.max(4, value.length));
  return `${'•'.repeat(Math.min(24, value.length - 4))}${value.slice(-4)}`;
}

export function truncateMiddle(value: string, max = 48): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(iso: string): string {
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return iso;
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(iso);
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function lineCount(value: string): number {
  return value ? value.split('\n').length : 0;
}
