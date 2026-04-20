import { useEffect, useMemo } from 'react';
import type { ForgeAttempt, ReuseCall } from './useGridState.js';

export interface ForgeLineagePayload {
  toolName: string;
  side: 'a' | 'b';
  sideColor: string;
}

interface Props {
  payload: ForgeLineagePayload | null;
  forgeAttemptsA: ForgeAttempt[];
  forgeAttemptsB: ForgeAttempt[];
  reuseCallsA: ReuseCall[];
  reuseCallsB: ReuseCall[];
  onClose: () => void;
  onJumpToTurn?: (turn: number) => void;
}

/**
 * Inline modal showing a forged tool's lineage — every forge attempt
 * (approved + rejected, with confidence), every cross-dept reuse, and
 * its first-forge attribution. Click-to-jump on turns lets users rewind
 * to any moment in the tool's history.
 */
export function ForgeLineageModal({
  payload,
  forgeAttemptsA,
  forgeAttemptsB,
  reuseCallsA,
  reuseCallsB,
  onClose,
  onJumpToTurn,
}: Props) {
  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [payload, onClose]);

  const data = useMemo(() => {
    if (!payload) return null;
    const attempts =
      payload.side === 'a' ? forgeAttemptsA : forgeAttemptsB;
    const reuses = payload.side === 'a' ? reuseCallsA : reuseCallsB;
    const mine = attempts.filter(a => a.name === payload.toolName);
    mine.sort((a, b) => a.turn - b.turn || a.eventIndex - b.eventIndex);
    const mineReuses = reuses.filter(r => r.name === payload.toolName);
    mineReuses.sort((a, b) => a.turn - b.turn);
    const firstApproved = mine.find(a => a.approved);
    return { mine, mineReuses, firstApproved };
  }, [payload, forgeAttemptsA, forgeAttemptsB, reuseCallsA, reuseCallsB]);

  if (!payload || !data) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Forge lineage for ${payload.toolName}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${payload.sideColor}`,
          borderRadius: 6,
          padding: 18,
          maxWidth: 520,
          width: '100%',
          maxHeight: '82vh',
          overflow: 'auto',
          fontFamily: 'var(--mono)',
          color: 'var(--text-2)',
          boxShadow: '0 10px 32px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Forge Lineage · {payload.side.toUpperCase()}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: payload.sideColor, fontFamily: 'var(--sans)' }}>
              {payload.toolName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lineage"
            style={{
              width: 24,
              height: 24,
              padding: 0,
              background: 'transparent',
              color: 'var(--text-3)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {data.firstApproved && (
          <div
            style={{
              padding: '6px 10px',
              background: 'var(--bg-deep)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              marginBottom: 12,
              fontSize: 11,
            }}
          >
            First forged in{' '}
            <span style={{ color: payload.sideColor, fontWeight: 800 }}>
              {data.firstApproved.department.toUpperCase()}
            </span>{' '}
            on T{data.firstApproved.turn}
            {typeof data.firstApproved.confidence === 'number'
              ? ` · confidence ${data.firstApproved.confidence.toFixed(2)}`
              : ''}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.1em',
              color: 'var(--text-4)',
              textTransform: 'uppercase',
              marginBottom: 6,
              fontWeight: 800,
            }}
          >
            Attempts ({data.mine.length})
          </div>
          {data.mine.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text-4)', fontStyle: 'italic' }}>
              no forge records
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {data.mine.map((att, i) => (
                <li
                  key={`${att.turn}-${att.eventIndex}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    background: 'var(--bg-card)',
                    borderLeft: `2px solid ${att.approved ? 'var(--green)' : 'var(--rust)'}`,
                    borderRadius: 2,
                    fontSize: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      color: att.approved ? 'var(--green)' : 'var(--rust)',
                      textTransform: 'uppercase',
                      minWidth: 60,
                    }}
                  >
                    {att.approved ? '\u2713 Forged' : '\u2717 Rejected'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onJumpToTurn?.(Math.max(0, att.turn - 1))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--amber)',
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      cursor: onJumpToTurn ? 'pointer' : 'default',
                      padding: 0,
                      textDecoration: onJumpToTurn ? 'underline dotted' : 'none',
                    }}
                    title={onJumpToTurn ? `Jump to T${att.turn}` : undefined}
                  >
                    T{att.turn}
                  </button>
                  <span style={{ color: 'var(--text-3)', textTransform: 'uppercase', fontSize: 9 }}>
                    {att.department}
                  </span>
                  {typeof att.confidence === 'number' && (
                    <span style={{ color: 'var(--text-3)', marginLeft: 'auto', fontSize: 9 }}>
                      conf {att.confidence.toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.1em',
              color: 'var(--text-4)',
              textTransform: 'uppercase',
              marginBottom: 6,
              fontWeight: 800,
            }}
          >
            Cross-dept reuses ({data.mineReuses.length})
          </div>
          {data.mineReuses.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text-4)', fontStyle: 'italic' }}>
              never reused across departments
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {data.mineReuses.map((r, i) => (
                <li
                  key={`${r.turn}-${r.callingDept}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    background: 'var(--bg-card)',
                    borderLeft: '2px solid var(--amber)',
                    borderRadius: 2,
                    fontSize: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onJumpToTurn?.(Math.max(0, r.turn - 1))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--amber)',
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      cursor: onJumpToTurn ? 'pointer' : 'default',
                      padding: 0,
                      textDecoration: onJumpToTurn ? 'underline dotted' : 'none',
                    }}
                  >
                    T{r.turn}
                  </button>
                  <span style={{ color: 'var(--text-3)', textTransform: 'uppercase', fontSize: 9 }}>
                    {r.originDept} → {r.callingDept}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
