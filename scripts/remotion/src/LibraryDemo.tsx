import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { C } from './colors';

const RUNS = [
  { id: 'r-001', leader: 'Pragmatist', sc: 'mars-genesis', turns: 8, cost: '$0.42', color: C.amber },
  { id: 'r-002', leader: 'Visionary',  sc: 'mars-genesis', turns: 8, cost: '$0.38', color: C.rust },
  { id: 'r-003', leader: 'Cautious',   sc: 'lunar-base',  turns: 6, cost: '$0.31', color: C.teal },
  { id: 'r-004', leader: 'Bold',       sc: 'mars-genesis', turns: 8, cost: '$0.45', color: C.amber },
  { id: 'r-005', leader: 'Engineer',   sc: 'lunar-base',  turns: 6, cost: '$0.29', color: C.teal },
  { id: 'r-006', leader: 'Diplomat',   sc: 'mars-genesis', turns: 8, cost: '$0.40', color: C.rust },
];

export const LibraryDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const total = 210;
  const ghostOpacity = interpolate(frame, [total - 18, total - 1], [1, 0]);
  const drawerOpen = interpolate(frame, [70, 95], [0, 1], { extrapolateRight: 'clamp' });
  const replayPhase = interpolate(frame, [120, 165], [0, 1], { extrapolateRight: 'clamp' });
  const matchPanel = interpolate(frame, [170, 195], [0, 1], { extrapolateRight: 'clamp' });
  const cursorX = interpolate(frame, [40, 70], [600, 230], { extrapolateRight: 'clamp' });
  const cursorY = interpolate(frame, [40, 70], [380, 280], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: C.sans, color: C.text1, opacity: ghostOpacity }}>
      <Header />
      <div style={{ padding: '70px 56px 56px', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.5px' }}>Library</span>
          <Stat label="runs" value="6" />
          <Stat label="total cost" value="$2.25" />
          <Stat label="replays matched" value="4 / 4" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {RUNS.map((r, i) => {
            const appear = clamp01((frame - 8 - i * 4) / 14);
            return (
              <RunCard
                key={r.id}
                r={r}
                opacity={appear}
                lift={(1 - appear) * 16}
                highlighted={i === 0 && drawerOpen > 0}
              />
            );
          })}
        </div>
      </div>
      <Drawer open={drawerOpen} replayPhase={replayPhase} matchPanel={matchPanel} run={RUNS[0]} />
      <Cursor x={cursorX} y={cursorY} click={isClickFrame(frame, [70, 145])} />
    </AbsoluteFill>
  );
};

const Header: React.FC = () => (
  <div style={{
    position: 'absolute', top: 0, left: 0, right: 0, height: 50,
    background: C.bgPanel, borderBottom: `1px solid ${C.border}`,
    display: 'flex', alignItems: 'center', padding: '0 22px', gap: 8,
    fontFamily: C.mono, fontSize: 11, letterSpacing: '0.5px', color: C.text3, fontWeight: 700,
  }}>
    {['SIM', 'VIZ', 'REPORTS', 'BRANCHES'].map(t => <span key={t}>{t}</span>)}
    <span style={{ color: C.amber, borderBottom: `2px solid ${C.amber}`, padding: '14px 0' }}>LIBRARY</span>
    {['CHAT', 'LOG', 'ABOUT'].map(t => <span key={t}>{t}</span>)}
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ color: C.text3, fontSize: 11, fontFamily: C.mono, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</span>
    <span style={{ color: C.text1, fontSize: 18, fontWeight: 700 }}>{value}</span>
  </div>
);

const RunCard: React.FC<{
  r: typeof RUNS[number];
  opacity: number;
  lift: number;
  highlighted: boolean;
}> = ({ r, opacity, lift, highlighted }) => (
  <div style={{
    background: C.bgCard,
    border: `1px solid ${highlighted ? C.amber : C.border}`,
    boxShadow: highlighted ? `0 0 0 2px ${C.amber}40` : 'none',
    borderRadius: 8,
    padding: '14px 16px',
    opacity,
    transform: `translateY(${lift}px)`,
    transition: 'border-color 0.2s',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>{r.id}</span>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color }} />
    </div>
    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{r.leader}</div>
    <div style={{ fontFamily: C.mono, color: C.text3, fontSize: 12, marginBottom: 12 }}>{r.sc}</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text2, fontFamily: C.mono }}>
      <span>{r.turns} turns</span>
      <span>{r.cost}</span>
    </div>
  </div>
);

const Drawer: React.FC<{ open: number; replayPhase: number; matchPanel: number; run: typeof RUNS[number] }> = ({ open, replayPhase, matchPanel, run }) => (
  <div style={{
    position: 'absolute',
    top: 50, right: 0, height: 'calc(100% - 50px)', width: 460,
    background: C.bgPanel, borderLeft: `1px solid ${C.border}`,
    transform: `translateX(${(1 - open) * 460}px)`,
    padding: '24px 28px',
    boxSizing: 'border-box',
    boxShadow: open > 0 ? '-12px 0 30px rgba(0,0,0,0.4)' : 'none',
  }}>
    <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text3, marginBottom: 8 }}>{run.id}</div>
    <h2 style={{ margin: '0 0 16px 0', fontSize: 22, fontWeight: 700 }}>{run.leader}</h2>
    <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text2, marginBottom: 20 }}>
      scenario={run.sc} · turns={run.turns} · cost={run.cost} · seed=42
    </div>
    <div style={{
      padding: '14px 16px',
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: C.text2, fontFamily: C.mono, fontSize: 12, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Replay Verification</span>
        <button style={{
          padding: '4px 12px',
          background: replayPhase > 0 ? `${C.amber}30` : C.bgCard,
          color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 4,
          fontFamily: C.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
        }}>REPLAY</button>
      </div>
      {replayPhase > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.text3, marginBottom: 4 }}>
            re-executing kernel from snapshot 0/{run.turns}…
          </div>
          <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${replayPhase * 100}%`, height: '100%', background: C.amber }} />
          </div>
        </div>
      )}
      {matchPanel > 0 && (
        <div style={{
          padding: '10px 12px',
          background: `${C.ok}25`,
          border: `1px solid ${C.ok}`,
          borderRadius: 4,
          opacity: matchPanel,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.ok, fontWeight: 700, fontSize: 18 }}>✓</span>
            <span style={{ color: C.ok, fontWeight: 700, fontFamily: C.mono, letterSpacing: '0.5px' }}>MATCH</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: C.text2 }}>
            kernel snapshots byte-equal under canonical JSON
          </div>
          <div style={{ marginTop: 4, fontFamily: C.mono, fontSize: 11, color: C.text3 }}>
            divergence: ""
          </div>
        </div>
      )}
    </div>
  </div>
);

const Cursor: React.FC<{ x: number; y: number; click: boolean }> = ({ x, y, click }) => (
  <svg style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none', filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.6))' }} width="22" height="22" viewBox="0 0 24 24">
    {click && <circle cx="12" cy="12" r="11" fill={C.amber} opacity="0.4" />}
    <path d="M3 2 L3 18 L8 13 L11.5 21 L14 20 L10.5 12 L18 12 Z" fill={C.text1} stroke={C.bg} strokeWidth="1" />
  </svg>
);

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function isClickFrame(f: number, frames: number[]) { return frames.includes(f) || frames.some(x => Math.abs(f - x) < 2); }
