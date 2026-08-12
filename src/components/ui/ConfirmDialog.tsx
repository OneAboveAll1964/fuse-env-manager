import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AlertTriangle } from 'lucide-react';

type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
  variant?: 'default' | 'danger';
};

type State = ConfirmOptions & { resolve: (v: boolean) => void };

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<State | null>(null);

  const confirm = useCallback<ConfirmContextValue>(
    (options) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  const handleClose = (value: boolean): void => {
    if (state) {
      state.resolve(value);
      setState(null);
    }
  };

  const value = useMemo(() => confirm, [confirm]);
  const isDanger = state?.variant === 'danger';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        onClose={() => handleClose(false)}
        size="sm"
        hideCloseButton
        footer={
          <>
            <Button variant="ghost" onClick={() => handleClose(false)}>
              {state?.cancelText ?? 'Cancel'}
            </Button>
            <Button
              variant={isDanger ? 'danger' : 'primary'}
              onClick={() => handleClose(true)}
              autoFocus
            >
              {state?.confirmText ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          {isDanger && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {state?.title}
            </h3>
            {state?.description && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{state.description}</p>
            )}
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
