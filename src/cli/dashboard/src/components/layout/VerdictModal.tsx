/**
 * Full-verdict modal triggered from the global VerdictBanner. Opens a
 * centered dialog carrying the VerdictDetails breakdown with focus
 * trapped inside while open. Backdrop click + Escape (handled by
 * caller) both dismiss.
 *
 * Extracted from App.tsx.
 */
import { VerdictDetails } from '../sim/VerdictCard';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface VerdictModalProps {
  verdict: Record<string, unknown>;
  onClose: () => void;
}

export function VerdictModal({ verdict, onClose }: VerdictModalProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const winner = verdict.winner;
  const topBorderColor = winner === 'A'
    ? 'var(--vis)'
    : winner === 'B'
      ? 'var(--eng)'
      : 'var(--amber)';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Simulation verdict full breakdown"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(10,8,6,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, var(--bg-panel) 0%, var(--bg-deep) 100%)',
          border: '1px solid var(--border)',
          borderTop: `3px solid ${topBorderColor}`,
          borderRadius: 10,
          padding: '20px 24px',
          maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
          fontFamily: 'var(--sans)', color: 'var(--text-1)',
          position: 'relative',
          outline: 'none',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close verdict"
          style={{
            position: 'absolute', top: 8, right: 12,
            background: 'none', border: 'none', color: 'var(--text-3)',
            cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4,
            zIndex: 1,
          }}
        >
          ×
        </button>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <VerdictDetails v={verdict as any} />
      </div>
    </div>
  );
}
