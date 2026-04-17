import { useEffect, useState } from 'react';

interface Shortcut {
  keys: string[];
  description: string;
  scope: 'Global' | 'Visualization' | 'Chat';
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['?'], description: 'Open this shortcuts overlay', scope: 'Global' },
  { keys: ['Esc'], description: 'Close overlays / drilldown panel', scope: 'Global' },
  { keys: ['←'], description: 'Previous turn', scope: 'Visualization' },
  { keys: ['→'], description: 'Next turn', scope: 'Visualization' },
  { keys: ['Space'], description: 'Play / pause playback', scope: 'Visualization' },
  { keys: ['M'], description: 'Cycle cluster mode (families · departments · mood · age)', scope: 'Visualization' },
  { keys: ['D'], description: 'Toggle divergence tint overlay', scope: 'Visualization' },
  { keys: ['A'], description: 'Collapse / expand the automaton band', scope: 'Visualization' },
  { keys: ['1'], description: 'Automaton: mood propagation', scope: 'Visualization' },
  { keys: ['2'], description: 'Automaton: forge flow', scope: 'Visualization' },
  { keys: ['3'], description: 'Automaton: ecology grid', scope: 'Visualization' },
  { keys: ['Enter'], description: 'Send chat message', scope: 'Chat' },
];

/**
 * Modal overlay listing all keyboard shortcuts. Toggled by `?` from
 * anywhere in the app (skips when focus is in an input/textarea so the
 * user can still type a literal `?`).
 */
export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !editable) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const scopes: Shortcut['scope'][] = ['Global', 'Visualization', 'Chat'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(10,8,6,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '2px solid var(--amber)', borderRadius: 10,
          padding: '20px 24px',
          maxWidth: 520, width: '100%', maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
          fontFamily: 'var(--sans)', color: 'var(--text-1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{
            fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800,
            color: 'var(--amber)', letterSpacing: '0.06em',
            textTransform: 'uppercase', margin: 0,
          }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              cursor: 'pointer', fontSize: 18, lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {scopes.map(scope => {
          const items = SHORTCUTS.filter(s => s.scope === scope);
          if (items.length === 0) return null;
          return (
            <section key={scope} style={{ marginBottom: 16 }}>
              <h3 style={{
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                color: 'var(--text-3)', letterSpacing: '0.08em',
                textTransform: 'uppercase', margin: '0 0 6px',
              }}>
                {scope}
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {items.map(s => (
                  <li
                    key={s.keys.join('+')}
                    style={{
                      display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12,
                      padding: '5px 0', borderTop: '1px solid var(--border)',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          style={{
                            display: 'inline-block',
                            padding: '2px 7px', borderRadius: 4,
                            background: 'var(--bg-deep)',
                            border: '1px solid var(--border)',
                            fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                            color: 'var(--amber)', minWidth: 18, textAlign: 'center',
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span style={{ color: 'var(--text-2)', lineHeight: 1.45 }}>
                      {s.description}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4,
          fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)',
          textAlign: 'center',
        }}>
          press <kbd style={{
            padding: '1px 6px', background: 'var(--bg-deep)',
            border: '1px solid var(--border)', borderRadius: 3,
            fontFamily: 'var(--mono)', color: 'var(--amber)',
          }}>?</kbd> anywhere · <kbd style={{
            padding: '1px 6px', background: 'var(--bg-deep)',
            border: '1px solid var(--border)', borderRadius: 3,
            fontFamily: 'var(--mono)', color: 'var(--amber)',
          }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
