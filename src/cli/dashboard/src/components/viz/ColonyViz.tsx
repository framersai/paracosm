import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../hooks/useGameState.js';
import { useVizSnapshots } from './useVizSnapshots.js';
import { ColonyPanel } from './ColonyPanel.js';
import { TurnBanner } from './TurnBanner.js';
import { ClusterToggleRow } from './ClusterToggleRow.js';
import { Legend } from './Legend.js';
import { DrilldownPanel } from './DrilldownPanel.js';
import { VizControls } from './VizControls.js';
import {
  computeDivergence,
  type ClusterMode,
  type CellSnapshot,
  type TurnSnapshot,
} from './viz-types.js';

interface HexacoShape { O: number; C: number; E: number; A: number; Em: number; HH: number }

interface ColonyVizProps {
  state: GameState;
  onNavigateToChat?: (colonistName: string) => void;
}

const CLUSTER_MODES: ClusterMode[] = ['families', 'departments', 'mood', 'age'];

/**
 * VIZ tab composition root. Owns playhead state, cluster mode,
 * selected colonist, divergence tint toggle. Delegates everything
 * visual to ColonyPanel, DrilldownPanel, TurnBanner, Legend.
 */
export function ColonyViz({ state, onNavigateToChat }: ColonyVizProps) {
  const { a: snapsA, b: snapsB } = useVizSnapshots(state);
  const maxTurn = Math.max(snapsA.length, snapsB.length);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<ClusterMode>('families');
  const [showDivergence, setShowDivergence] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timerRef = useRef<number>(0);
  const prevMaxTurnRef = useRef(0);

  useEffect(() => {
    const prev = prevMaxTurnRef.current;
    prevMaxTurnRef.current = maxTurn;
    if (maxTurn > prev && !playing) setCurrentTurn(maxTurn - 1);
  }, [maxTurn, playing]);

  useEffect(() => {
    if (!playing) return;
    const interval = 2000 / speed;
    timerRef.current = window.setInterval(() => {
      setCurrentTurn(prev => {
        if (prev >= maxTurn - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, interval);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, maxTurn]);

  const handlePlayPause = useCallback(() => {
    if (maxTurn <= 1) return;
    setPlaying(p => {
      if (!p && currentTurn >= maxTurn - 1) setCurrentTurn(0);
      return !p;
    });
  }, [currentTurn, maxTurn]);

  const handleStepBack = useCallback(() => {
    setPlaying(false);
    setCurrentTurn(t => Math.max(0, t - 1));
  }, []);

  const handleStepForward = useCallback(() => {
    setPlaying(false);
    setCurrentTurn(t => Math.min(maxTurn - 1, t + 1));
  }, [maxTurn]);

  const handleTurnChange = useCallback((turn: number) => {
    setPlaying(false);
    setCurrentTurn(turn);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleStepBack(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleStepForward(); }
      else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); handlePlayPause(); }
      else if (e.key === 'm' || e.key === 'M') {
        setMode(curr => CLUSTER_MODES[(CLUSTER_MODES.indexOf(curr) + 1) % CLUSTER_MODES.length]);
      }
      else if (e.key === 'd' || e.key === 'D') setShowDivergence(d => !d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStepBack, handleStepForward, handlePlayPause]);

  const snapA = snapsA[currentTurn];
  const snapB = snapsB[currentTurn];

  const divergenceData = useMemo(() => computeDivergence(snapA, snapB), [snapA, snapB]);
  const divergedIds = showDivergence ? divergenceData : null;

  const allSnapshotsForSelected = useMemo(
    () => (selectedId ? snapsA.concat(snapsB) : []),
    [selectedId, snapsA, snapsB],
  );

  const byId = useMemo(() => {
    const m = new Map<string, CellSnapshot>();
    const pool: TurnSnapshot[] = snapsA.concat(snapsB);
    for (const s of pool) for (const c of s.cells) m.set(c.agentId, c);
    return m;
  }, [snapsA, snapsB]);

  /**
   * HEXACO lookup is built from agent_reactions events, which carry a
   * full trait vector per colonist per turn. CellSnapshot does not
   * include hexaco, so we scan events on each side and capture the
   * latest HEXACO seen for each name/agentId.
   */
  const hexacoById = useMemo(() => {
    const m = new Map<string, HexacoShape>();
    for (const side of ['a', 'b'] as const) {
      for (const evt of state[side].events) {
        if (evt.type !== 'agent_reactions') continue;
        const reactions = (evt.data?.reactions as Array<Record<string, unknown>>) || [];
        for (const r of reactions) {
          const h = r.hexaco as HexacoShape | undefined;
          if (!h) continue;
          const id = (r.agentId as string) || (r.name as string);
          if (id) m.set(id, h);
        }
      }
    }
    return m;
  }, [state]);

  const handleOpenChat = useCallback((name: string) => {
    onNavigateToChat?.(name);
    setSelectedId(null);
  }, [onNavigateToChat]);

  if (maxTurn === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)', fontSize: 13,
      }}>
        Run a simulation to see the colony visualization.
      </div>
    );
  }

  const leaderA = state.a.leader;
  const leaderB = state.b.leader;

  const diffLine = snapA && snapB
    ? `A vs B: ${snapB.population - snapA.population >= 0 ? '+' : ''}${snapB.population - snapA.population} pop, ${Math.round((snapB.morale - snapA.morale) * 100)}% morale, ${snapB.foodReserve - snapA.foodReserve > 0 ? '+' : ''}${(snapB.foodReserve - snapA.foodReserve).toFixed(1)}mo food`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <TurnBanner state={state} currentTurn={currentTurn} />
      <ClusterToggleRow mode={mode} onChange={setMode} />
      {diffLine && (
        <div style={{
          padding: '4px 12px', fontSize: 10, fontFamily: 'var(--mono)',
          color: 'var(--text-3)', background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
        }}>
          {diffLine}
        </div>
      )}
      <div className="leaders-row" style={{ display: 'flex', flex: 1, minHeight: 0, gap: 4, overflow: 'hidden' }}>
        <ColonyPanel
          snapshot={snapA}
          leaderName={leaderA?.name ?? 'Leader A'}
          leaderArchetype={leaderA?.archetype ?? ''}
          mode={mode}
          selectedId={selectedId}
          divergedIds={divergedIds?.aliveOnlyA}
          onSelect={setSelectedId}
        />
        <ColonyPanel
          snapshot={snapB}
          leaderName={leaderB?.name ?? 'Leader B'}
          leaderArchetype={leaderB?.archetype ?? ''}
          mode={mode}
          selectedId={selectedId}
          divergedIds={divergedIds?.aliveOnlyB}
          onSelect={setSelectedId}
        />
      </div>
      <Legend />
      <VizControls
        currentTurn={currentTurn}
        maxTurn={maxTurn}
        year={snapA?.year ?? snapB?.year ?? 0}
        playing={playing}
        speed={speed}
        onTurnChange={handleTurnChange}
        onPlayPause={handlePlayPause}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onSpeedChange={setSpeed}
      />
      <DrilldownPanel
        selectedId={selectedId}
        snapshots={allSnapshotsForSelected}
        byId={byId}
        hexacoById={hexacoById}
        onClose={() => setSelectedId(null)}
        onSelect={setSelectedId}
        onJumpToTurn={(turn: number) => setCurrentTurn(Math.max(0, Math.min(maxTurn - 1, turn - 1)))}
        onOpenChat={handleOpenChat}
      />
    </div>
  );
}
