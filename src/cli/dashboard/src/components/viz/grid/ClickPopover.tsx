import { useEffect, useMemo, useRef } from 'react';
import type { CellSnapshot, TurnSnapshot } from '../viz-types.js';
import { HexacoRadar } from '../HexacoRadar.js';

interface HexacoShape { O: number; C: number; E: number; A: number; Em: number; HH: number }

export interface ClickPopoverPayload {
  cell: CellSnapshot;
  /** Anchor coordinates in overlay-canvas pixel space. */
  x: number;
  y: number;
}

interface ClickPopoverProps {
  payload: ClickPopoverPayload | null;
  /** Container size so the popover can flip when near an edge. */
  containerW: number;
  containerH: number;
  sideColor: string;
  hexacoById?: Map<string, HexacoShape>;
  snapshots?: TurnSnapshot[];
  onClose: () => void;
  onOpenChat?: (name: string) => void;
}

const HEXACO_LABELS: Record<keyof HexacoShape, string> = {
  O: 'Openness',
  C: 'Conscientiousness',
  E: 'Extraversion',
  A: 'Agreeableness',
  Em: 'Emotionality',
  HH: 'Honesty-Humility',
};

function topHexacoAxes(h: HexacoShape | undefined): string {
  if (!h) return '';
  const entries = Object.entries(h) as Array<[keyof HexacoShape, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${HEXACO_LABELS[k]} ${v.toFixed(2)}`)
    .join(' · ');
}

/**
 * Floating colonist drilldown popover. Anchored near the clicked glyph
 * with viewport-aware placement (auto-flip left/up when near edge).
 * Shows identity, HEXACO radar, mood+psych, family, memory quotes,
 * click-to-chat. Dismissible via Esc, close button, or backdrop click.
 */
export function ClickPopover(props: ClickPopoverProps) {
  const {
    payload,
    containerW,
    containerH,
    sideColor,
    hexacoById,
    snapshots,
    onClose,
    onOpenChat,
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const hexaco = useMemo(() => {
    if (!payload || !hexacoById) return undefined;
    return hexacoById.get(payload.cell.agentId) ?? hexacoById.get(payload.cell.name);
  }, [payload, hexacoById]);

  const memoryQuotes = useMemo(() => {
    if (!payload) return [] as string[];
    const out: string[] = [...(payload.cell.shortTermMemory ?? [])];
    if (snapshots) {
      for (let i = snapshots.length - 1; i >= 0 && out.length < 3; i--) {
        const found = snapshots[i].cells.find(c => c.agentId === payload.cell.agentId);
        if (!found) continue;
        for (const q of found.shortTermMemory ?? []) {
          if (q && !out.includes(q)) out.push(q);
          if (out.length >= 3) break;
        }
      }
    }
    return out.slice(0, 3);
  }, [payload, snapshots]);

  if (!payload) return null;

  const POP_W = 320;
  const POP_H_EST = 360;
  const margin = 10;
  const flipRight = payload.x + POP_W + margin > containerW;
  const flipDown = payload.y - POP_H_EST - margin < 0;
  const left = flipRight
    ? Math.max(margin, payload.x - POP_W - margin)
    : Math.min(containerW - POP_W - margin, payload.x + margin);
  const top = flipDown
    ? Math.min(containerH - POP_H_EST - margin, payload.y + margin)
    : Math.max(margin, payload.y - POP_H_EST - margin);

  const cell = payload.cell;
  const morale = typeof cell.psychScore === 'number' ? Math.round(cell.psychScore * 100) : null;
  const generationLabel = (() => {
    const g = cell.generation ?? 0;
    if (g === 0) return 'Earth-born';
    if (g === 1) return 'First-native';
    return `Gen ${g}`;
  })();

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
          zIndex: 10,
        }}
      />
      <div
        ref={rootRef}
        role="dialog"
        aria-label={`${cell.name} drilldown`}
        style={{
          position: 'absolute',
          left,
          top,
          width: POP_W,
          maxHeight: containerH - margin * 2,
          overflow: 'auto',
          background: 'var(--bg-panel)',
          border: `1px solid ${sideColor}66`,
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--text-2)',
          zIndex: 11,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px',
            borderBottom: `1px solid ${sideColor}33`,
            background: `linear-gradient(0deg, transparent, ${sideColor}11)`,
          }}
        >
          <div>
            <div
              style={{
                color: sideColor,
                fontWeight: 800,
                fontSize: 13,
                fontFamily: 'var(--sans)',
                letterSpacing: '0.02em',
              }}
            >
              {cell.name}
            </div>
            <div
              style={{
                color: 'var(--text-3)',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {cell.role} · {cell.rank}
              {cell.featured && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: '1px 4px',
                    background: `${sideColor}33`,
                    color: sideColor,
                    borderRadius: 2,
                    fontSize: 8,
                    letterSpacing: '0.1em',
                  }}
                >
                  FEATURED
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drilldown"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 3,
              color: 'var(--text-3)',
              cursor: 'pointer',
              width: 22,
              height: 22,
              fontSize: 11,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px 12px',
              fontSize: 10,
            }}
          >
            <span style={{ color: 'var(--text-3)' }}>DEPT</span>
            <span style={{ color: 'var(--text-1)', textTransform: 'uppercase' }}>
              {cell.department}
            </span>
            <span style={{ color: 'var(--text-3)' }}>AGE</span>
            <span style={{ color: 'var(--text-1)' }}>{cell.age ?? '—'}</span>
            <span style={{ color: 'var(--text-3)' }}>MOOD</span>
            <span style={{ color: 'var(--text-1)' }}>{cell.mood}</span>
            {morale !== null && (
              <>
                <span style={{ color: 'var(--text-3)' }}>PSYCH</span>
                <span style={{ color: 'var(--text-1)' }}>{morale}%</span>
              </>
            )}
            <span style={{ color: 'var(--text-3)' }}>ORIGIN</span>
            <span style={{ color: 'var(--text-1)' }}>{generationLabel}</span>
            <span style={{ color: 'var(--text-3)' }}>PARTNER</span>
            <span style={{ color: 'var(--text-1)' }}>
              {cell.partnerId ? 'yes' : '—'}
            </span>
            <span style={{ color: 'var(--text-3)' }}>CHILDREN</span>
            <span style={{ color: 'var(--text-1)' }}>{cell.childrenIds?.length ?? 0}</span>
          </div>
        </div>

        {hexaco && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <div
              style={{
                color: 'var(--text-3)',
                fontSize: 9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 6,
                fontWeight: 700,
              }}
            >
              HEXACO
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flexShrink: 0 }}>
                <HexacoRadar profile={hexaco} size={120} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
                {topHexacoAxes(hexaco)}
              </div>
            </div>
          </div>
        )}

        {memoryQuotes.length > 0 && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <div
              style={{
                color: 'var(--text-3)',
                fontSize: 9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 6,
                fontWeight: 700,
              }}
            >
              Recent memory
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {memoryQuotes.map((q, i) => (
                <li
                  key={i}
                  style={{
                    padding: '3px 0',
                    color: 'var(--text-2)',
                    fontSize: 10,
                    fontStyle: 'italic',
                    fontFamily: 'var(--sans)',
                    borderLeft: `2px solid ${sideColor}44`,
                    paddingLeft: 8,
                    marginBottom: 4,
                  }}
                >
                  "{q}"
                </li>
              ))}
            </ul>
          </div>
        )}

        {onOpenChat && (
          <div style={{ padding: '8px 10px' }}>
            <button
              type="button"
              onClick={() => onOpenChat(cell.name)}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: sideColor,
                color: 'var(--bg-deep)',
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Open chat with {cell.name.split(' ')[0]}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
