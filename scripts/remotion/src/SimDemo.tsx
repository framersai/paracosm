import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { C } from './colors';

const TURNS = 8;
const TRAJ_A = [0.62, 0.66, 0.71, 0.74, 0.72, 0.68, 0.61, 0.55, 0.50];
const TRAJ_B = [0.62, 0.65, 0.68, 0.66, 0.61, 0.55, 0.48, 0.41, 0.34];

export const SimDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const total = 240;

  const codePhase = clamp01(frame / 60);
  const runPulse = Math.sin(((frame - 55) / 6) * Math.PI) * Math.exp(-Math.max(0, frame - 55) / 12);
  const turnFloat = clamp(((frame - 70) / 130) * TURNS, 0, TURNS);
  const labelOpacity = clamp01((frame - 200) / 25);
  const ghostOpacity = interpolate(frame, [total - 18, total - 1], [1, 0]);

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: C.sans, color: C.text1, opacity: ghostOpacity }}>
      <Bg />
      <Header />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '88px 56px 56px' }}>
        <Code phase={codePhase} runPulse={Math.max(0, runPulse)} />
        <Plot turnFloat={turnFloat} labelOpacity={labelOpacity} />
      </div>
    </AbsoluteFill>
  );
};

const Bg: React.FC = () => (
  <AbsoluteFill style={{
    background: `radial-gradient(circle at 30% 20%, ${C.bgPanel} 0%, ${C.bg} 60%)`,
  }} />
);

const Header: React.FC = () => (
  <div style={{ position: 'absolute', top: 24, left: 56, right: 56, display: 'flex', alignItems: 'center', gap: 14 }}>
    <Logo />
    <span style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 800, letterSpacing: '0.5px' }}>
      PARACOSM<span style={{ color: C.amber }}>·</span>
    </span>
    <span style={{ fontFamily: C.mono, color: C.text3, fontSize: 13, letterSpacing: '0.5px' }}>
      counterfactual world model · seeded kernel · HEXACO leaders
    </span>
  </div>
);

const Logo: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 64 64">
    <g opacity="0.5" stroke={C.text3} strokeWidth="2.4" strokeLinecap="round">
      <line x1="32" y1="32" x2="37.63" y2="10.98" />
      <line x1="32" y1="32" x2="53.02" y2="26.37" />
      <line x1="32" y1="32" x2="47.39" y2="47.39" />
      <line x1="32" y1="32" x2="26.37" y2="53.02" />
      <line x1="32" y1="32" x2="10.98" y2="37.63" />
      <line x1="32" y1="32" x2="16.61" y2="16.61" />
    </g>
    <circle cx="32" cy="32" r="11" fill={C.amber} opacity="0.15" />
    <circle cx="32" cy="32" r="5" fill={C.amber} />
    <circle cx="37.63" cy="10.98" r="3.5" fill={C.rust} />
    <circle cx="53.02" cy="26.37" r="3.5" fill={C.amber} />
    <circle cx="47.39" cy="47.39" r="3.5" fill={C.teal} />
    <circle cx="26.37" cy="53.02" r="3.5" fill={C.rust} />
    <circle cx="10.98" cy="37.63" r="3.5" fill={C.teal} />
    <circle cx="16.61" cy="16.61" r="3.5" fill={C.amber} />
  </svg>
);

type CodeSeg = { kind: 'tok'; t: string; c: string } | { kind: 'br' };
const CODE_LINES: CodeSeg[] = [
  { kind: 'tok', t: 'import', c: C.rust },
  { kind: 'tok', t: ' { WorldModel } ', c: C.text1 },
  { kind: 'tok', t: 'from', c: C.rust },
  { kind: 'tok', t: " 'paracosm';", c: C.amber },
  { kind: 'br' },
  { kind: 'tok', t: 'const', c: C.rust },
  { kind: 'tok', t: ' world ', c: C.text1 },
  { kind: 'tok', t: '=', c: C.text2 },
  { kind: 'tok', t: ' WorldModel.fromScenario(marsScenario);', c: C.text1 },
  { kind: 'br' },
  { kind: 'tok', t: '// trunk: cautious leader, seed=42', c: C.text3 },
  { kind: 'br' },
  { kind: 'tok', t: 'const', c: C.rust },
  { kind: 'tok', t: ' trunk ', c: C.text1 },
  { kind: 'tok', t: '=', c: C.text2 },
  { kind: 'tok', t: ' ', c: C.text1 },
  { kind: 'tok', t: 'await', c: C.rust },
  { kind: 'tok', t: ' world.simulate(cautious, ', c: C.text1 },
  { kind: 'tok', t: '{', c: C.text2 },
  { kind: 'tok', t: ' seed: ', c: C.text1 },
  { kind: 'tok', t: '42', c: C.amber },
  { kind: 'tok', t: ' });', c: C.text2 },
  { kind: 'br' },
  { kind: 'tok', t: '// branch: pragmatist on the same world', c: C.text3 },
  { kind: 'br' },
  { kind: 'tok', t: 'const', c: C.rust },
  { kind: 'tok', t: ' branch ', c: C.text1 },
  { kind: 'tok', t: '=', c: C.text2 },
  { kind: 'tok', t: ' ', c: C.text1 },
  { kind: 'tok', t: 'await', c: C.rust },
  { kind: 'tok', t: ' world.simulate(pragmatist, ', c: C.text1 },
  { kind: 'tok', t: '{', c: C.text2 },
  { kind: 'tok', t: ' seed: ', c: C.text1 },
  { kind: 'tok', t: '42', c: C.amber },
  { kind: 'tok', t: ' });', c: C.text2 },
];

const Code: React.FC<{ phase: number; runPulse: number }> = ({ phase, runPulse }) => {
  const totalChars = CODE_LINES.reduce((n, l) => n + (l.kind === 'br' ? 0 : l.t.length), 0);
  const visibleChars = Math.floor(phase * totalChars);
  let consumed = 0;
  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '20px 24px',
      fontFamily: C.mono,
      fontSize: 17,
      lineHeight: 1.7,
      letterSpacing: '0.2px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Dot color="#ff5f57" />
        <Dot color="#febc2e" />
        <Dot color={C.ok} />
        <span style={{ marginLeft: 10, color: C.text3, fontSize: 12, fontFamily: C.mono }}>
          counterfactual.ts
        </span>
      </div>
      <div>
        {CODE_LINES.map((seg, i) => {
          if (seg.kind === 'br') return <br key={i} />;
          const segStart = consumed;
          const segEnd = consumed + seg.t.length;
          consumed = segEnd;
          if (visibleChars <= segStart) return null;
          const sliceEnd = Math.min(seg.t.length, visibleChars - segStart);
          return (
            <span key={i} style={{ color: seg.c }}>{seg.t.slice(0, sliceEnd)}</span>
          );
        })}
        <Caret on={phase > 0 && phase < 1} />
      </div>
      <div style={{
        position: 'absolute', right: 18, bottom: 16,
        padding: '6px 14px',
        background: `rgba(232, 180, 74, ${0.18 + runPulse * 0.4})`,
        color: C.amber,
        border: `1px solid ${C.amber}`,
        borderRadius: 4,
        fontFamily: C.mono,
        fontSize: 12,
        letterSpacing: '1.5px',
        fontWeight: 700,
        opacity: phase >= 1 ? 1 : 0,
        transform: `scale(${1 + runPulse * 0.05})`,
      }}>RUN</div>
    </div>
  );
};

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ width: 12, height: 12, borderRadius: 6, background: color }} />
);

const Caret: React.FC<{ on: boolean }> = ({ on }) =>
  on ? <span style={{ background: C.amber, color: C.bg, padding: '0 1px' }}>▍</span> : null;

const Plot: React.FC<{ turnFloat: number; labelOpacity: number }> = ({ turnFloat, labelOpacity }) => {
  const W = 540, H = 420;
  const padX = 60, padTop = 60, padBot = 70;
  const xAt = (turn: number) => padX + (turn / (TURNS - 1)) * (W - padX * 2);
  const yAt = (v: number) => padTop + (1 - v) * (H - padTop - padBot);

  const pathFor = (data: number[]) => {
    const visible = Math.min(turnFloat, TURNS - 1);
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

  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '20px 24px',
      fontFamily: C.mono,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ color: C.text2, fontSize: 13, letterSpacing: '0.5px' }}>OUTCOME · MORALE TRAJECTORY</span>
        <span style={{ color: C.text3, fontSize: 12 }}>seed=42 · turns 0..7</span>
      </div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <line x1={padX} y1={H - padBot} x2={W - padX} y2={H - padBot} stroke={C.border} strokeWidth="1" />
        <line x1={padX} y1={padTop} x2={padX} y2={H - padBot} stroke={C.border} strokeWidth="1" />
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={padX} y1={yAt(g)} x2={W - padX} y2={yAt(g)} stroke={C.border} strokeWidth="0.6" opacity="0.5" />
        ))}
        {Array.from({ length: TURNS }).map((_, i) => (
          <text key={i} x={xAt(i)} y={H - padBot + 22} fill={C.text3} fontSize="11" textAnchor="middle">{i}</text>
        ))}
        <text x={padX - 10} y={yAt(0.25) + 4} fill={C.text3} fontSize="11" textAnchor="end">.25</text>
        <text x={padX - 10} y={yAt(0.5) + 4} fill={C.text3} fontSize="11" textAnchor="end">.50</text>
        <text x={padX - 10} y={yAt(0.75) + 4} fill={C.text3} fontSize="11" textAnchor="end">.75</text>
        <path d={pathFor(TRAJ_A)} stroke={C.amber} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathFor(TRAJ_B)} stroke={C.teal} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {turnFloat >= TRAJ_A.length - 0.5 && (
          <>
            <circle cx={xAt(TURNS - 1)} cy={yAt(TRAJ_A[TURNS - 1])} r="5" fill={C.amber} />
            <circle cx={xAt(TURNS - 1)} cy={yAt(TRAJ_B[TURNS - 1])} r="5" fill={C.teal} />
          </>
        )}
      </svg>
      <div style={{
        position: 'absolute',
        right: 24, bottom: 18,
        display: 'flex', flexDirection: 'column', gap: 6,
        opacity: labelOpacity,
        fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Swatch c={C.amber} /><span style={{ color: C.text2 }}>cautious leader</span><span style={{ color: C.amber, fontWeight: 700 }}>0.50</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Swatch c={C.teal} /><span style={{ color: C.text2 }}>pragmatist leader</span><span style={{ color: C.teal, fontWeight: 700 }}>0.34</span>
        </div>
        <div style={{ color: C.text3, marginTop: 4, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
          divergence at turn 3 · same world, swapped variable
        </div>
      </div>
    </div>
  );
};

const Swatch: React.FC<{ c: string }> = ({ c }) => (
  <div style={{ width: 14, height: 3, background: c, borderRadius: 2 }} />
);

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v: number) { return clamp(v, 0, 1); }
