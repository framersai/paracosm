import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';

interface ToastMessage {
  id: number;
  type: 'info' | 'error' | 'success' | 'crisis-a' | 'crisis-b';
  title: string;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastMessage['type'], title: string, message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

const BORDER_COLORS: Record<ToastMessage['type'], string> = {
  info: 'var(--amber)',
  error: 'var(--rust)',
  success: 'var(--green)',
  'crisis-a': 'var(--vis, #e8b44a)',
  'crisis-b': 'var(--eng, #4ca8a8)',
};

const TITLE_COLORS: Record<ToastMessage['type'], string> = {
  info: 'var(--amber)',
  error: 'var(--rust)',
  success: 'var(--green)',
  'crisis-a': 'var(--vis, #e8b44a)',
  'crisis-b': 'var(--eng, #4ca8a8)',
};

const BG_TINTS: Record<ToastMessage['type'], string> = {
  info: '#1a1610',
  error: '#1a1210',
  success: '#121a10',
  'crisis-a': '#1a1610',
  'crisis-b': '#101a18',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((type: ToastMessage['type'], title: string, message: string, durationMs?: number) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, type, title, message }]);
    const duration = durationMs ?? (type.startsWith('crisis') ? 12000 : 6000);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed', top: 56, right: 16, zIndex: 100000,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none', maxWidth: 380,
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 12,
              background: BG_TINTS[t.type],
              border: `1px solid ${BORDER_COLORS[t.type]}`,
              borderLeft: `3px solid ${BORDER_COLORS[t.type]}`,
              color: 'var(--text-1)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              animation: 'slideIn 0.3s ease',
              position: 'relative',
            }}
          >
            <button
              onClick={() => dismiss(t.id)}
              style={{
                position: 'absolute', top: 4, right: 8,
                background: 'none', border: 'none', color: 'var(--text-3)',
                cursor: 'pointer', fontSize: 14, lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              x
            </button>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2, color: TITLE_COLORS[t.type], paddingRight: 16 }}>
              {t.title}
            </div>
            {t.message && (
              <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
                {t.message}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
