import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 4000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast" role="status" aria-live="polite" data-open={message ? `true` : `false`}>
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function PageHeader({ title, onBack, backLabel = `Back`, children }: { title: ReactNode; onBack?: () => void; backLabel?: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      {onBack && (
        <button type="button" className="btn btn--ghost page-header__back" onClick={onBack}>
          ← {backLabel}
        </button>
      )}
      <h2 className="page-header__title">{title}</h2>
      {children && <div className="page-header__actions">{children}</div>}
    </div>
  );
}

export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? ` field--wide` : ``}`}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
