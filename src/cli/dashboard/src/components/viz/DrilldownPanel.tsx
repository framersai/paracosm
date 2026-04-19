import { useEffect, useMemo, useRef, useState } from 'react';
import type { CellSnapshot, TurnSnapshot } from './viz-types.js';
import { HexacoRadar } from './HexacoRadar.js';
import { MoodChart } from './MoodChart.js';
import { FamilyTree } from './FamilyTree.js';

interface HexacoShape { O: number; C: number; E: number; A: number; Em: number; HH: number }

interface DrilldownPanelProps {
  selectedId: string | null;
  snapshots: TurnSnapshot[];
  byId: Map<string, CellSnapshot>;
  hexacoById?: Map<string, HexacoShape>;
  colonyMean?: HexacoShape;
  onClose: () => void;
  onSelect: (agentId: string) => void;
  onJumpToTurn: (turn: number) => void;
  onOpenChat: (name: string) => void;
}

const MOOD_TO_SCORE: Record<string, number> = {
  positive: 0.85,
  hopeful: 0.75,
  neutral: 0.5,
  anxious: 0.35,
  negative: 0.25,
  defiant: 0.4,
  resigned: 0.2,
};

function pickProfile(snapshots: TurnSnapshot[], id: string): CellSnapshot | null {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const hit = snapshots[i].cells.find(c => c.agentId === id);
    if (hit) return hit;
  }
  return null;
}

function synthesizeTraitSentence(hexaco: HexacoShape | undefined): string {
  if (!hexaco) return 'Personality profile not available for this colonist.';
  const entries = Object.entries(hexaco) as Array<[keyof HexacoShape, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [top1, top2] = entries;
  const names: Record<keyof HexacoShape, string> = {
    O: 'Openness',
    C: 'Conscientiousness',
    E: 'Extraversion',
    A: 'Agreeableness',
    Em: 'Emotionality',
    HH: 'Honesty-Humility',
  };
  return `Strongest axes: high ${names[top1[0]]} (${top1[1].toFixed(2)}) and high ${names[top2[0]]} (${top2[1].toFixed(2)}) shape how this colonist reacts under pressure.`;
}

/**
 * Right slide-in on desktop, bottom sheet on mobile. Composes every
 * drilldown section: identity header, HEXACO radar with synthesized
 * sentence, mood chart across turns, family tree, top memories, chat
 * handoff button.
 */
export function DrilldownPanel(props: DrilldownPanelProps) {
  const { selectedId, snapshots, byId, hexacoById, colonyMean, onClose, onSelect, onJumpToTurn, onOpenChat } = props;
  const closeRef = useRef<HTMLButtonElement>(null);

  // Mobile sheet height state (vh units). Starts at full; user can drag
  // the top handle down to reduce to ~25vh so the scrub timeline is
  // visible behind the sheet, then drag back up to restore.
  const FULL_VH = 75;
  const REDUCED_VH = 25;
  const [sheetHeight, setSheetHeight] = useState<number>(FULL_VH);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; startHeight: number } | null>(null);

  useEffect(() => {
    if (selectedId && closeRef.current) closeRef.current.focus();
    if (selectedId) setSheetHeight(FULL_VH);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onClose]);

  const onHandleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragStartRef.current = { y: t.clientY, startHeight: sheetHeight };
    setIsDragging(true);
  };
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (!dragStartRef.current) return;
    const t = e.touches[0];
    const dyPx = t.clientY - dragStartRef.current.y;
    const dyVh = (dyPx / window.innerHeight) * 100;
    const next = Math.max(15, Math.min(92, dragStartRef.current.startHeight - dyVh));
    setSheetHeight(next);
  };
  const onHandleTouchEnd = () => {
    if (!dragStartRef.current) return;
    // Snap to the nearer of the two rest points so release always lands
    // somewhere predictable rather than at an arbitrary pixel.
    const midpoint = (FULL_VH + REDUCED_VH) / 2;
    setSheetHeight(sheetHeight >= midpoint ? FULL_VH : REDUCED_VH);
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const center = useMemo(
    () => (selectedId ? pickProfile(snapshots, selectedId) : null),
    [selectedId, snapshots],
  );

  const hexaco = selectedId && hexacoById ? hexacoById.get(selectedId) : undefined;

  const moodPoints = useMemo(() => {
    if (!selectedId) return [];
    return snapshots
      .map(s => {
        const hit = s.cells.find(c => c.agentId === selectedId);
        if (!hit) return null;
        // Build the object so `crisisTitle` is only present when defined,
        // which matches MoodPoint's `crisisTitle?: string` (optional
        // property) rather than the looser `crisisTitle: string | undefined`
        // TS would otherwise infer from a conditional spread.
        const crisis = s.eventCategories?.[0];
        const point: { turn: number; moodScore: number; crisisTitle?: string } = {
          turn: s.turn,
          moodScore: MOOD_TO_SCORE[hit.mood] ?? 0.5,
        };
        if (typeof crisis === 'string' && crisis.length > 0) point.crisisTitle = crisis;
        return point;
      })
      .filter((p): p is { turn: number; moodScore: number; crisisTitle?: string } => p !== null);
  }, [selectedId, snapshots]);

  if (!selectedId || !center) return null;

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: `${sheetHeight}vh`, background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)', zIndex: 1000,
        overflowY: 'auto', padding: '0 16px 16px',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
        transition: isDragging ? 'none' : 'height 220ms cubic-bezier(0.2, 0.9, 0.3, 1)',
      }
    : {
        position: 'fixed', top: 56, right: 0, bottom: 0,
        width: 420, background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)', zIndex: 1000,
        overflowY: 'auto', padding: 16,
        boxShadow: '-4px 0 16px rgba(0,0,0,0.3)',
      };

  return (
    <aside aria-label={`Details for ${center.name}`} style={panelStyle}>
      {isMobile && (
        <div
          role="button"
          aria-label={sheetHeight >= (FULL_VH + REDUCED_VH) / 2 ? 'Drag down to reduce panel' : 'Drag up to expand panel'}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onClick={() => setSheetHeight(h => (h >= (FULL_VH + REDUCED_VH) / 2 ? REDUCED_VH : FULL_VH))}
          style={{
            position: 'sticky', top: 0,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '10px 0 6px', marginLeft: -16, marginRight: -16,
            background: 'var(--bg-panel)',
            touchAction: 'none', cursor: 'ns-resize', zIndex: 3,
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--text-4)' }} />
        </div>
      )}
      <div style={{ paddingTop: isMobile ? 4 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{center.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            {center.role} {'\u00b7'} {center.rank} {'\u00b7'} {center.department}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
            {center.marsborn ? 'Mars-born' : 'Earth-born'} {'\u00b7'} age {center.age ?? '?'} {'\u00b7'} {center.alive ? 'alive' : 'deceased'}
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close drilldown"
          style={{
            background: 'none', border: 'none', color: 'var(--text-3)',
            fontSize: 16, cursor: 'pointer', padding: 4,
          }}
        >
          X
        </button>
      </div>

      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>
          HEXACO PROFILE
        </div>
        {hexaco ? (
          <>
            <HexacoRadar profile={hexaco} colonyMean={colonyMean} />
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>
              {synthesizeTraitSentence(hexaco)}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            No HEXACO profile recorded yet for this colonist.
          </div>
        )}
      </section>

      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>
          MOOD TRAJECTORY
        </div>
        <MoodChart points={moodPoints} onJumpToTurn={onJumpToTurn} />
      </section>

      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>
          FAMILY
        </div>
        <FamilyTree center={center} byId={byId} onSelect={onSelect} />
      </section>

      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>
          MEMORIES
        </div>
        {(center.shortTermMemory ?? []).slice(0, 3).map((m, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4, paddingLeft: 6, borderLeft: '2px solid var(--border)' }}>
            {m}
          </div>
        ))}
        {(!center.shortTermMemory || center.shortTermMemory.length === 0) && (
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>No recent memories recorded.</div>
        )}
      </section>

      <button
        type="button"
        onClick={() => onOpenChat(center.name)}
        style={{
          width: '100%', padding: '10px 14px',
          background: 'linear-gradient(135deg, var(--rust), #c44a1e)',
          color: 'white', border: 'none', borderRadius: 6,
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Open chat with {center.name}
      </button>
      </div>
    </aside>
  );
}
