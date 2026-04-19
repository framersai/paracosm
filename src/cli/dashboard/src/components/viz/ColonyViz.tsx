import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, LeaderInfo } from '../../hooks/useGameState.js';
import { useScenarioContext } from '../../App';
import { useToast } from '../shared/Toast';
import type { AutomatonMode } from './automaton/shared.js';

const AUTOMATON_MODE_KEY = 'paracosm:vizAutomatonMode';
const AUTOMATON_COLLAPSED_KEY = 'paracosm:vizAutomatonCollapsed';
const AUTOMATON_MAXIMIZED_KEY = 'paracosm:vizAutomatonMaximized';
const AUTOMATON_NUDGE_KEY = 'paracosm:automatonNudgeSeen';

function readStoredMode(): AutomatonMode {
  try {
    const raw = localStorage.getItem(AUTOMATON_MODE_KEY);
    if (raw === 'mood' || raw === 'forge' || raw === 'ecology') return raw;
  } catch { /* silent */ }
  return 'mood';
}
function readStoredCollapsed(): boolean {
  try { return localStorage.getItem(AUTOMATON_COLLAPSED_KEY) === '1'; }
  catch { return false; }
}
import { useVizSnapshots } from './useVizSnapshots.js';
import { ColonyPanel } from './ColonyPanel.js';
import { TurnBanner } from './TurnBanner.js';
import { ClusterToggleRow } from './ClusterToggleRow.js';
import { Legend } from './Legend.js';
import { DrilldownPanel } from './DrilldownPanel.js';
import { VizControls } from './VizControls.js';
import { LivingColonyGrid } from './grid/LivingColonyGrid.js';
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

  // Automaton mode + collapsed flag. Lifted to the viz root so both
  // leader panels render in the same lens simultaneously. Seeded from
  // localStorage so the user's last-picked mode persists.
  const [automatonMode, setAutomatonModeState] = useState<AutomatonMode>(() => readStoredMode());
  const [automatonCollapsed, setAutomatonCollapsedState] = useState<boolean>(() => readStoredCollapsed());
  const [automatonMaximized, setAutomatonMaximizedState] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTOMATON_MAXIMIZED_KEY) === '1'; }
    catch { return false; }
  });
  const setAutomatonMaximized = useCallback((next: boolean) => {
    setAutomatonMaximizedState(next);
    try { localStorage.setItem(AUTOMATON_MAXIMIZED_KEY, next ? '1' : '0'); } catch { /* silent */ }
  }, []);
  const setAutomatonMode = useCallback((m: AutomatonMode) => {
    setAutomatonModeState(m);
    try { localStorage.setItem(AUTOMATON_MODE_KEY, m); } catch { /* silent */ }
  }, []);
  const toggleAutomatonCollapsed = useCallback(() => {
    setAutomatonCollapsedState(prev => {
      const next = !prev;
      try { localStorage.setItem(AUTOMATON_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* silent */ }
      return next;
    });
  }, []);

  // First-run nudge: single toast explaining the automaton the first
  // time the user lands on the viz tab with a completed (or in-flight)
  // run. Dismisses itself and persists so it never fires again.
  const { toast } = useToast();
  useEffect(() => {
    if (maxTurn === 0) return;
    try {
      if (localStorage.getItem(AUTOMATON_NUDGE_KEY) === '1') return;
      localStorage.setItem(AUTOMATON_NUDGE_KEY, '1');
    } catch { return; }
    toast('info', 'Automaton view', 'Press 1 / 2 / 3 to switch modes (mood · forge · ecology), A to collapse the band.');
  }, [maxTurn, toast]);
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
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); toggleAutomatonCollapsed(); }
      else if (e.key === '1') { e.preventDefault(); setAutomatonMode('mood'); }
      else if (e.key === '2') { e.preventDefault(); setAutomatonMode('forge'); }
      else if (e.key === '3') { e.preventDefault(); setAutomatonMode('ecology'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStepBack, handleStepForward, handlePlayPause, setAutomatonMode, toggleAutomatonCollapsed]);

  // Per-side snapshot resolution with lag tolerance. Two leaders run in
  // parallel via Promise.all, but one side can lag by 10-30 seconds
  // mid-turn (LLM calls are not perfectly synchronized). When the
  // playhead auto-advances to max(snapsA.length, snapsB.length) - 1,
  // the lagging side's `snaps[currentTurn]` is undefined and the grid
  // renders the empty "No snapshot yet" state even though that leader
  // has plenty of earlier snapshots to show. Fall back to the most
  // recent snapshot that side has so both columns always render real
  // colony data. The lag indicator below the header (turn N, lagging)
  // tells the viewer when the two sides are not at the same playhead.
  const snapA = snapsA[currentTurn] ?? snapsA[snapsA.length - 1];
  const snapB = snapsB[currentTurn] ?? snapsB[snapsB.length - 1];
  const snapATurn = snapA?.turn ?? 0;
  const snapBTurn = snapB?.turn ?? 0;

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
  /**
   * Per-side forge attempt + reuse ledger. Derived from the raw event
   * stream so the forge automaton mode sees every birth, rejection,
   * and cross-dept reuse call as particles / tracers / orbits.
   * Idempotent via the forge state's seenForgeKeys set, so this can
   * rebuild on each render without duplicate particles.
   */
  const forgeFeeds = useMemo(() => {
    type Attempt = { turn: number; eventIndex: number; department: string; name: string; approved: boolean; confidence?: number };
    type Reuse = { turn: number; originDept: string; callingDept: string; name: string };
    const feed: Record<'a' | 'b', { attempts: Attempt[]; reuses: Reuse[] }> = {
      a: { attempts: [], reuses: [] },
      b: { attempts: [], reuses: [] },
    };
    for (const side of ['a', 'b'] as const) {
      const firstByName = new Map<string, string>();
      for (const evt of state[side].events) {
        if (evt.type === 'forge_attempt') {
          const d = evt.data || {};
          feed[side].attempts.push({
            turn: Number(d.turn ?? 0),
            eventIndex: Number(d.eventIndex ?? 0),
            department: String(d.department || ''),
            name: String(d.name || ''),
            approved: d.approved === true || d.approved === 'true',
            confidence: typeof d.confidence === 'number' ? d.confidence : undefined,
          });
          if (d.name && d.department && d.approved === true && !firstByName.has(String(d.name))) {
            firstByName.set(String(d.name), String(d.department));
          }
          continue;
        }
        if (evt.type !== 'dept_done') continue;
        const d = evt.data || {};
        const dept = String(d.department || '');
        const tools = Array.isArray(d.forgedTools) ? d.forgedTools : [];
        for (const t of tools) {
          const tt = t as Record<string, unknown>;
          const name = String(tt.name || '');
          if (!name || name === 'unnamed') continue;
          const firstDept = typeof tt.firstForgedDepartment === 'string'
            ? String(tt.firstForgedDepartment)
            : firstByName.get(name);
          const firstTurn = typeof tt.firstForgedTurn === 'number'
            ? (tt.firstForgedTurn as number)
            : undefined;
          const thisTurn = Number(evt.turn ?? d.turn ?? 0);
          if (firstDept && firstTurn !== undefined && firstTurn < thisTurn) {
            feed[side].reuses.push({
              turn: thisTurn,
              originDept: firstDept,
              callingDept: dept,
              name,
            });
          } else if (firstDept && firstDept !== dept) {
            // Cross-dept mention on same turn counts as reuse too.
            feed[side].reuses.push({
              turn: thisTurn,
              originDept: firstDept,
              callingDept: dept,
              name,
            });
          }
        }
      }
    }
    return feed;
  }, [state]);

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
      <div className="viz-content" style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)', fontSize: 13,
      }}>
        Run a simulation to see the colony visualization.
      </div>
    );
  }

  // Fall back to the scenario's default preset leaders when the live
  // sim state hasn't populated them yet. Matches the SimView pattern
  // so the Viz tab surfaces Aria Chen / Dietrich Voss identities
  // rather than generic "Leader A" / "Leader B" placeholders.
  const scenario = useScenarioContext();
  const defaultPreset = scenario.presets.find(p => p.id === 'default');
  const presetA: LeaderInfo | null = defaultPreset?.leaders?.[0]
    ? { name: defaultPreset.leaders[0].name, archetype: defaultPreset.leaders[0].archetype, colony: 'Colony Alpha', hexaco: defaultPreset.leaders[0].hexaco, instructions: defaultPreset.leaders[0].instructions, quote: '' }
    : null;
  const presetB: LeaderInfo | null = defaultPreset?.leaders?.[1]
    ? { name: defaultPreset.leaders[1].name, archetype: defaultPreset.leaders[1].archetype, colony: 'Colony Beta', hexaco: defaultPreset.leaders[1].hexaco, instructions: defaultPreset.leaders[1].instructions, quote: '' }
    : null;
  const leaderA = state.a.leader ?? presetA;
  const leaderB = state.b.leader ?? presetB;

  const diffLine = snapA && snapB
    ? `A vs B: ${snapB.population - snapA.population >= 0 ? '+' : ''}${snapB.population - snapA.population} pop, ${Math.round((snapB.morale - snapA.morale) * 100)}% morale, ${snapB.foodReserve - snapA.foodReserve > 0 ? '+' : ''}${(snapB.foodReserve - snapA.foodReserve).toFixed(1)}mo food`
    : '';

  // Feature flag: VITE_NEW_GRID controls which viz renders. Default is
  // the living-colony grid. Set VITE_NEW_GRID=0 to opt back to the legacy
  // ColonyPanel tile grid.
  const useNewGrid = import.meta.env.VITE_NEW_GRID !== '0';
  if (useNewGrid) {
    const prevSnapA = currentTurn > 0
      ? (snapsA[currentTurn - 1] ?? snapsA[snapsA.length - 2])
      : undefined;
    const prevSnapB = currentTurn > 0
      ? (snapsB[currentTurn - 1] ?? snapsB[snapsB.length - 2])
      : undefined;
    return (
      <div className="viz-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <TurnBanner state={state} currentTurn={currentTurn} />
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
          <LivingColonyGrid
            snapshot={snapA}
            previousSnapshot={prevSnapA}
            leaderName={leaderA?.name ?? 'Leader A'}
            leaderArchetype={leaderA?.archetype ?? ''}
            leaderColony={leaderA?.colony ?? ''}
            sideColor="var(--vis)"
            side="a"
            lagTurns={snapATurn < snapBTurn ? snapBTurn - snapATurn : 0}
          />
          <LivingColonyGrid
            snapshot={snapB}
            previousSnapshot={prevSnapB}
            leaderName={leaderB?.name ?? 'Leader B'}
            leaderArchetype={leaderB?.archetype ?? ''}
            leaderColony={leaderB?.colony ?? ''}
            sideColor="var(--eng)"
            side="b"
            lagTurns={snapBTurn < snapATurn ? snapATurn - snapBTurn : 0}
          />
        </div>
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
      </div>
    );
  }

  return (
    <div className="viz-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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
          leaderColony={leaderA?.colony ?? ''}
          leaderBio={leaderA?.instructions ?? ''}
          sideColor="var(--vis)"
          mode={mode}
          selectedId={selectedId}
          divergedIds={divergedIds?.aliveOnlyA}
          onSelect={setSelectedId}
          lagTurns={snapATurn < snapBTurn ? snapBTurn - snapATurn : 0}
          side="a"
          hexacoById={hexacoById}
          automatonMode={automatonMode}
          automatonCollapsed={automatonCollapsed}
          onAutomatonModeChange={setAutomatonMode}
          onAutomatonCollapseToggle={toggleAutomatonCollapsed}
          forgeAttempts={forgeFeeds.a.attempts}
          reuseCalls={forgeFeeds.a.reuses}
          scenarioDepartments={scenario.departments.map(d => d.id)}
          automatonMaximized={automatonMaximized}
          onAutomatonMaximizedChange={setAutomatonMaximized}
        />
        <ColonyPanel
          snapshot={snapB}
          leaderName={leaderB?.name ?? 'Leader B'}
          leaderArchetype={leaderB?.archetype ?? ''}
          leaderColony={leaderB?.colony ?? ''}
          leaderBio={leaderB?.instructions ?? ''}
          sideColor="var(--eng)"
          mode={mode}
          selectedId={selectedId}
          divergedIds={divergedIds?.aliveOnlyB}
          onSelect={setSelectedId}
          lagTurns={snapBTurn < snapATurn ? snapATurn - snapBTurn : 0}
          side="b"
          hexacoById={hexacoById}
          automatonMode={automatonMode}
          automatonCollapsed={automatonCollapsed}
          onAutomatonModeChange={setAutomatonMode}
          onAutomatonCollapseToggle={toggleAutomatonCollapsed}
          forgeAttempts={forgeFeeds.b.attempts}
          reuseCalls={forgeFeeds.b.reuses}
          scenarioDepartments={scenario.departments.map(d => d.id)}
          automatonMaximized={automatonMaximized}
          onAutomatonMaximizedChange={setAutomatonMaximized}
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
