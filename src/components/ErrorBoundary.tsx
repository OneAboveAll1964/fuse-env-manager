import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught', error, info);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 dark:bg-slate-950">
        <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-4 border-b border-slate-100 bg-rose-50/50 px-7 py-6 dark:border-slate-800 dark:bg-rose-950/20">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertOctagon size={22} />
            </div>
            <div className="min-w-0">
              <div className="label-eyebrow text-rose-700 dark:text-rose-300">Something broke</div>
              <h1 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Unexpected error
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Your vault is encrypted on disk and is unaffected.
              </p>
            </div>
          </div>
          <div className="border-b border-slate-100 bg-slate-950 px-7 py-4 font-mono text-xs text-rose-300 dark:border-slate-800">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
              {this.state.error.name}
            </div>
            <div className="mb-2 break-words text-rose-200">{this.state.error.message}</div>
            {this.state.error.stack && (
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-400">
                {this.state.error.stack}
              </pre>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-7 py-4">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              <RefreshCw size={14} />
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
