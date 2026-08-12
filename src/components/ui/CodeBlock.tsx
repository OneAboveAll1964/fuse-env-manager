import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';

export function CodeBlock({
  code,
  title,
  actions,
  maxHeight = 360,
  wrap = false,
  className,
}: {
  code: string;
  title?: ReactNode;
  actions?: ReactNode;
  maxHeight?: number;
  wrap?: boolean;
  className?: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-800',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="flex-1 truncate font-mono text-[11px] uppercase tracking-wider text-slate-400">
          {title}
        </span>
        {actions}
        <button
          type="button"
          onClick={copy}
          title="Copy"
          aria-label="Copy"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        style={{ maxHeight }}
        className={clsx(
          'overflow-auto px-4 py-3 font-mono text-[12px] leading-relaxed text-slate-200',
          wrap && 'whitespace-pre-wrap break-words',
        )}
      >
        {code}
      </pre>
    </div>
  );
}
