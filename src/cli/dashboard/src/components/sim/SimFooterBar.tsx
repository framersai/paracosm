import { useState, useCallback, useEffect, type ReactNode } from 'react';
import type { CitationRegistry } from '../../hooks/useCitationRegistry';
import type { ToolRegistry } from '../../hooks/useToolRegistry';
import { ReferencesList } from '../shared/ReferencesSection';
import { ToolboxSection } from '../shared/ToolboxSection';

interface SimFooterBarProps {
  citationRegistry: CitationRegistry;
  toolRegistry: ToolRegistry;
}

/**
 * Compact bottom bar that surfaces References and Forged Toolbox as
 * modal CTAs instead of inline blocks. Keeps the events column tall
 * (the user reported that the inline sections were eating vertical
 * space and making timeline events hard to scan).
 *
 * Each pill shows the count and opens a centered modal with the full
 * data. The bar collapses into icon-only on phones via global CSS.
 */
export function SimFooterBar({ citationRegistry, toolRegistry }: SimFooterBarProps) {
  const [open, setOpen] = useState<null | 'refs' | 'tools'>(null);
  const close = useCallback(() => setOpen(null), []);

  // Esc closes whichever modal is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const refsCount = citationRegistry.list.length;
  const toolsCount = toolRegistry.list.length;

  if (refsCount === 0 && toolsCount === 0) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Simulation evidence"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: 'var(--bg-panel)',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
          color: 'var(--text-3)', letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Evidence
        </span>
        {refsCount > 0 && (
          <FooterCta
            label="References"
            count={refsCount}
            onClick={() => setOpen('refs')}
            ariaLabel={`Open References list (${refsCount} sources)`}
          />
        )}
        {toolsCount > 0 && (
          <FooterCta
            label="Forged Toolbox"
            count={toolsCount}
            onClick={() => setOpen('tools')}
            ariaLabel={`Open Forged Toolbox (${toolsCount} tools)`}
          />
        )}
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-3)', fontStyle: 'italic',
        }}>
          Click any inline [N] pill to jump to its source.
        </span>
      </div>

      {open === 'refs' && (
        <Modal title={`References · ${refsCount}`} onClose={close}>
          <ReferencesList registry={citationRegistry} />
        </Modal>
      )}
      {open === 'tools' && (
        <Modal title={`Forged Toolbox · ${toolsCount}`} onClose={close}>
          <ToolboxSection registry={toolRegistry} title="" collapsible={false} />
        </Modal>
      )}
    </>
  );
}

function FooterCta({ label, count, onClick, ariaLabel }: { label: string; count: number; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 4,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        color: 'var(--text-2)',
        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.05em', cursor: 'pointer',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--amber)';
        e.currentTarget.style.color = 'var(--amber)';
        e.currentTarget.style.background = 'rgba(232,180,74,0.06)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.color = 'var(--text-2)';
        e.currentTarget.style.background = 'var(--bg-card)';
      }}
    >
      <span>{label.toUpperCase()}</span>
      <span style={{
        padding: '0 6px', borderRadius: 8,
        background: 'rgba(232,180,74,0.12)', color: 'var(--amber)',
        fontSize: 10, fontWeight: 800,
      }}>
        {count}
      </span>
    </button>
  );
}

/**
 * Generic centered modal. Backdrop click and Esc both dismiss.
 */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
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
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderTop: '3px solid var(--amber)',
          borderRadius: 10,
          padding: '16px 20px',
          maxWidth: 960, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
          fontFamily: 'var(--sans)', color: 'var(--text-1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
          <h2 style={{
            fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800,
            color: 'var(--amber)', letterSpacing: '0.06em',
            textTransform: 'uppercase', margin: 0,
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '4px 2px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
