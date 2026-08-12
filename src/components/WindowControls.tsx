import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

export function WindowControls(): JSX.Element | null {
  const [maximized, setMaximized] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const bridge = window.fuse?.window;
    if (!bridge) return undefined;
    setAvailable(true);
    void bridge.isMaximized().then(setMaximized);
    return bridge.onMaximizedChange(setMaximized);
  }, []);

  if (!available) return null;

  return (
    <div className="app-no-drag inline-flex h-full shrink-0 items-stretch">
      <button
        type="button"
        onClick={() => void window.fuse?.window.minimize()}
        aria-label="Minimize"
        className="flex h-full w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        onClick={() => void window.fuse?.window.toggleMaximize()}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        className="flex h-full w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        {maximized ? <Copy size={12} className="-scale-x-100" /> : <Square size={11} />}
      </button>
      <button
        type="button"
        onClick={() => void window.fuse?.window.close()}
        aria-label="Close"
        className="flex h-full w-11 items-center justify-center text-slate-500 transition-colors hover:bg-rose-600 hover:text-white dark:text-slate-400"
      >
        <X size={15} />
      </button>
    </div>
  );
}
