import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';

interface ToastMessage {
  id: number;
  type: 'info' | 'error' | 'success';
  title: string;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastMessage['type'], title: string, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((type: ToastMessage['type'], title: string, message: string) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }, []);

  const borderColors = { info: 'var(--color-warning)', error: 'var(--color-error)', success: 'var(--color-success)' };
  const titleColors = { info: 'var(--color-warning)', error: 'var(--color-error)', success: 'var(--color-success)' };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-14 right-4 z-[100000] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto px-4 py-3 rounded-lg text-sm max-w-sm animate-[slideIn_0.3s_ease]"
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${borderColors[t.type]}`,
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div className="font-bold text-sm mb-0.5" style={{ color: titleColors[t.type] }}>{t.title}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
