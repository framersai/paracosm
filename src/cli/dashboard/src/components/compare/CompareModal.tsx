/**
 * Phase 4 stub. Replaced in the next implementation step with the
 * full bundle-aware modal (useBundle + AggregateStrip + grid + pinned
 * diff panel). This stub keeps LibraryTab compilable while phases 4-7
 * build out the real component, and matches the final exported props
 * shape so swapping the implementation is a one-file change.
 *
 * @module paracosm/dashboard/compare/CompareModal
 */
import * as React from 'react';

export interface CompareModalProps {
  bundleId: string;
  open: boolean;
  onClose: () => void;
}

export function CompareModal({ bundleId, open, onClose }: CompareModalProps): JSX.Element | null {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Compare bundle ${bundleId}`}
      style={{
        position: 'fixed',
        inset: 24,
        background: 'var(--bg-deep)',
        border: '1px solid var(--glass-border)',
        borderRadius: 14,
        padding: 24,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: '0 24px 64px rgba(0,0,0,.6)',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--mono)' }}>Compare bundle (Phase 4 stub)</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'none',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-2)',
            width: 32,
            height: 32,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >×</button>
      </header>
      <p style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', fontSize: 13 }}>
        Bundle id: <code>{bundleId}</code>
      </p>
      <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
        AggregateStrip / SmallMultiplesGrid / PinnedDiffPanel arrive in
        phases 5-7 of the Compare-runs UI implementation plan.
      </p>
    </div>
  );
}
