import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { C } from './colors';

const TURNS = 9;
const TRUNK     = [0.62, 0.65, 0.68, 0.71, 0.74, 0.72, 0.68, 0.61, 0.55, 0.50];
const BRANCH_A  = [0.62, 0.65, 0.68, 0.71, 0.74, 0.78, 0.81, 0.79, 0.73, 0.66];
const BRANCH_B  = [0.62, 0.65, 0.68, 0.71, 0.74, 0.66, 0.55, 0.46, 0.38, 0.31];
const FORK_TURN = 4;

export const BranchesDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const total = 210;
  const ghostOpacity = interpolate(frame, [total - 18, total - 1], [1, 0]);

  const trunkPhase = clamp01((frame - 10) / 60);
  const forkPulse = Math.exp(-Math.max(0, frame - 75) / 8) * Math.sin(((frame - 70) / 4) * Math.PI);
  const branchPhase = clamp01((frame - 80) / 80);
  const labelOpacity = clamp01((frame - 170) / 25);

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: C.sans, color: C.text1, opacity: ghostOpacity }}>
      <Header />
      <div style={{ padding: '70px 56px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 20 }}>
          <span style={{ fontSize: 26, fontWeight: 700 }}>Branches</span>
          <span style={{ color: C.text2, fontFamily: C.mono, fontSize: 13 }}>fork at turn {FORK_TURN} · same world, swapped variable</span>
        </div>
        <Plot trunkPhase={trunkPhase} branchPhase={branchPhase} forkPulse={Math.max(0, forkPulse)} />
        <Verdict opacity={labelOpacity} />
      </div>
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
    {['SIM', 'VIZ', 'REPORTS'].map(t => <span key={t}>{t}</span>)}
    <span style={{ color: C.amber, borderBottom: `2px solid ${C.amber}`, padding: '14px 0' }}>BRANCHES</span>
    {['LIBRARY', 'CHAT', 'LOG', 'ABOUT'].map(t => <span key={t}>{t}</span>)}
  </div>
);

const Plot: React.FC<{ trunkPhase: number; branchPhase: number; forkPulse: number }> = ({ trunkPhase, branchPhase, forkPulse }) => {
  const W = 1170, H = 380;
  const padX = 80, padTop = 30, padBot = 50;
  const xAt = (turn: number) => padX + (turn / TURNS) * (W - padX * 2);
  const yAt = (v: number) => padTop + (1 - v) * (H - padTop - padBot);

  const partial = (data: number[], visibleTo: number) => {
    const visible = Math.min(visibleTo, data.length - 1);
    const n = Math.floor(visible);
    const frac = visible - n;
    const points = data.slice(0, n + 1).map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`);
    if (n + 1 < data.length && frac > 0) {
      const x = xAt(n) + (xAt(n + 1) - xAt(n)) * frac;
      const y = yAt(data[n]) + (yAt(data[n + 1]) - yAt(data[n])) * frac;
      points.push(`L ${x} ${y}`);
    }
    return points.join(' ');
  };

  const trunkVisible = trunkPhase * (TURNS);
  const branchVisible = FORK_TURN + branchPhase * (TURNS - FORK_TURN);

  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '20px 24px',
      position: 'relative',
    }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <line x1={padX} y1={H - padBot} x2={W - padX} y2={H - padBot} stroke={C.border} strokeWidth="1" />
        <line x1={padX} y1={padTop} x2={padX} y2={H - padBot} stroke={C.border} strokeWidth="1" />
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={padX} y1={yAt(g)} x2={W - padX} y2={yAt(g)} stroke={C.border} strokeWidth="0.6" opacity="0.5" />
        ))}
        {Array.from({ length: TURNS + 1 }).map((_, i) => (
          <text key={i} x={xAt(i)} y={H - padBot + 22} fill={C.text3} fontSize="11" textAnchor="middle" fontFamily={C.mono}>{i}</text>
        ))}
        <line x1={xAt(FORK_TURN)} y1={padTop} x2={xAt(FORK_TURN)} y2={H - padBot} stroke={C.amber} strokeWidth="1" strokeDasharray="3 4" opacity={trunkPhase >= FORK_TURN / TURNS ? 0.5 : 0} />
        {trunkPhase >= FORK_TURN / TURNS && (
          <circle cx={xAt(FORK_TURN)} cy={yAt(TRUNK[FORK_TURN])} r={6 + forkPulse * 8} fill={C.amber} opacity={0.6 - forkPulse * 0.4} />
        )}
        <path d={partial(TRUNK, trunkVisible)} stroke={C.text2} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {branchVisible > FORK_TURN && (
          <>
            <path d={partial(BRANCH_A, branchVisible)} stroke={C.teal} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={partial(BRANCH_B, branchVisible)} stroke={C.rust} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {branchVisible >= TURNS && (
          <>
            <circle cx={xAt(TURNS)} cy={yAt(TRUNK[TURNS])} r="5" fill={C.text2} />
            <circle cx={xAt(TURNS)} cy={yAt(BRANCH_A[TURNS])} r="5" fill={C.teal} />
            <circle cx={xAt(TURNS)} cy={yAt(BRANCH_B[TURNS])} r="5" fill={C.rust} />
          </>
        )}
      </svg>
      <text x={xAt(FORK_TURN)} y={padTop - 8} fill={C.amber} fontSize="11" fontFamily={C.mono} textAnchor="middle" style={{ pointerEvents: 'none' }}>
      </text>
      <div style={{
        position: 'absolute',
        left: padX + (xAt(FORK_TURN) - padX),
        top: 14, transform: 'translateX(-50%)',
        fontFamily: C.mono, fontSize: 11, color: C.amber,
        opacity: trunkPhase >= FORK_TURN / TURNS ? 1 : 0,
      }}>FORK</div>
    </div>
  );
};

const Verdict: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 24,
    opacity, transform: `translateY(${(1 - opacity) * 8}px)`,
  }}>
    <Outcome color={C.text2} label="trunk · cautious" final="0.50" delta="−0.12" tone="neutral" />
    <Outcome color={C.teal}  label="branch A · pragmatist" final="0.66" delta="+0.04" tone="up" />
    <Outcome color={C.rust}  label="branch B · bold" final="0.31" delta="−0.31" tone="down" />
  </div>
);

const Outcome: React.FC<{ color: string; label: string; final: string; delta: string; tone: 'up'|'down'|'neutral' }> = ({ color, label, final, delta, tone }) => {
  const toneColor = tone === 'up' ? C.ok : tone === 'down' ? C.rust : C.text3;
  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`,
      padding: '14px 18px', borderRadius: 6,
    }}>
      <div style={{ color: C.text3, fontFamily: C.mono, fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color }}>{final}</span>
        <span style={{ fontFamily: C.mono, fontSize: 13, color: toneColor, fontWeight: 700 }}>{delta}</span>
      </div>
    </div>
  );
};

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
