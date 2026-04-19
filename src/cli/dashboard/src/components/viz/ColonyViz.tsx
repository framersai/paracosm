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
import { GridModePills, gridModeHint, type GridMode } from './grid/GridModePills.js';
import { GridHelpOverlay } from './grid/GridHelpOverlay.js';
import { useMediaQuery, NARROW_QUERY } from './grid/useMediaQuery.js';
import { TimelineSparkline } from './grid/TimelineSparkline.js';
import { EventChronicle } from './grid/EventChronicle.js';
import { TurnProgress } from './grid/TurnProgress.js';
import { ColonistSearch, type SearchMatch } from './grid/ColonistSearch.js';
import {
  GridSettingsDrawer,
  DEFAULT_GRID_SETTINGS,
  type GridSettings,
} from './grid/GridSettingsDrawer.js';

/** Tiny keyboard-shortcut chip for the footer legend. Kept local since
 *  it's only used in the viz tab footer. */
function Kbd({ k, v }: { k: string; v: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <kbd
        style={{
          padding: '1px 5px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 2,
          fontFamily: 'var(--mono)',
          fontSize: 8,
          color: 'var(--text-3)',
        }}
      >
        {k}
      </kbd>
      <span style={{ color: 'var(--text-4)' }}>{v}</span>
    </span>
  );
}
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

  // Grid mode (new living-colony grid). Shared across both leaders so
  // tabs toggle in lockstep. Persisted to localStorage so the user's
  // last-picked mode survives a page reload.
  const [gridMode, setGridModeState] = useState<GridMode>(() => {
    try {
      const raw = localStorage.getItem('paracosm:gridMode');
      if (raw === 'living' || raw === 'mood' || raw === 'forge' || raw === 'ecology' || raw === 'divergence') {
        return raw;
      }
    } catch { /* silent */ }
    return 'living';
  });
  const setGridMode = useCallback((m: GridMode) => {
    setGridModeState(m);
    try { localStorage.setItem('paracosm:gridMode', m); } catch { /* silent */ }
  }, []);

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

  const [helpOpen, setHelpOpen] = useState(false);
  const scenario = useScenarioContext();
  const [hoveredA, setHoveredA] = useState<string | null>(null);
  const [hoveredB, setHoveredB] = useState<string | null>(null);
  const [hoveredTurn, setHoveredTurn] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Latest crisis event that hasn't been dismissed — drives the toast
  // banner. Keyed by turn + category so the same crisis is announced
  // once per turn across both leaders.
  const [crisisToast, setCrisisToast] = useState<{
    key: string;
    side: 'a' | 'b';
    turn: number;
    category: string;
    title: string;
    expiresAt: number;
  } | null>(null);

  // Scan both event streams for the most recent un-toasted crisis.
  useEffect(() => {
    const crisisKinds = new Set(['event_start', 'director_crisis']);
    const seen = new Set<string>();
    type Evt = { type: string; turn?: number; data?: Record<string, unknown> };
    const findLatest = () => {
      let best: { key: string; side: 'a' | 'b'; turn: number; category: string; title: string } | null = null;
      for (const side of ['a', 'b'] as const) {
        const events = state[side].events as Evt[];
        for (let i = events.length - 1; i >= 0; i--) {
          const e = events[i];
          if (!crisisKinds.has(e.type)) continue;
          const turn = Number(e.turn ?? e.data?.turn ?? 0);
          const cat = typeof e.data?.category === 'string' ? e.data.category : '';
          if (!cat) continue;
          const key = `${side}:${turn}:${cat}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const title = typeof e.data?.title === 'string' ? e.data.title : '';
          if (!best || turn > best.turn) {
            best = { key, side, turn, category: cat, title };
          }
          break;
        }
      }
      return best;
    };
    const latest = findLatest();
    if (!latest) return;
    setCrisisToast(prev => {
      if (prev && prev.key === latest.key) return prev;
      return { ...latest, expiresAt: performance.now() + 5500 };
    });
  }, [state.a.events, state.b.events]);

  // Dismiss crisis toast after timeout.
  useEffect(() => {
    if (!crisisToast) return;
    const remaining = crisisToast.expiresAt - performance.now();
    if (remaining <= 0) {
      setCrisisToast(null);
      return;
    }
    const id = setTimeout(() => setCrisisToast(null), remaining);
    return () => clearTimeout(id);
  }, [crisisToast]);

  // Palette cycler — cycles through warm amber (default), cool cyan,
  // monochrome. Persists to localStorage.
  type PaletteKey = 'amber' | 'cool' | 'mono';
  const [palette, setPaletteState] = useState<PaletteKey>(() => {
    try {
      const raw = localStorage.getItem('paracosm:gridPalette');
      if (raw === 'cool' || raw === 'mono' || raw === 'amber') return raw;
    } catch {
      /* silent */
    }
    return 'amber';
  });
  const setPalette = useCallback((p: PaletteKey) => {
    setPaletteState(p);
    try {
      localStorage.setItem('paracosm:gridPalette', p);
    } catch {
      /* silent */
    }
  }, []);
  const cyclePalette = useCallback(() => {
    setPalette(palette === 'amber' ? 'cool' : palette === 'cool' ? 'mono' : 'amber');
  }, [palette, setPalette]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gridSettings, setGridSettingsState] = useState<GridSettings>(() => {
    try {
      const raw = localStorage.getItem('paracosm:gridSettings');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GridSettings>;
        return { ...DEFAULT_GRID_SETTINGS, ...parsed };
      }
    } catch {
      /* silent */
    }
    return DEFAULT_GRID_SETTINGS;
  });
  const setGridSettings = useCallback((next: GridSettings) => {
    setGridSettingsState(next);
    try {
      localStorage.setItem('paracosm:gridSettings', JSON.stringify(next));
    } catch {
      /* silent */
    }
  }, []);

  // Export the current viz as a composed PNG. Rasterises TurnBanner +
  // the two canvases into an offscreen canvas at 2x for retina
  // downloads.
  const vizRootRef = useRef<HTMLDivElement | null>(null);
  const handleExportPng = useCallback(() => {
    const root = vizRootRef.current;
    if (!root) return;
    const allCanvases = Array.from(root.querySelectorAll('canvas')) as HTMLCanvasElement[];
    if (allCanvases.length === 0) return;
    const rootRect = root.getBoundingClientRect();
    const scale = 2;
    const out = document.createElement('canvas');
    out.width = Math.round(rootRect.width * scale);
    out.height = Math.round(rootRect.height * scale);
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = getComputedStyle(root).getPropertyValue('--bg-deep').trim() || '#0a0806';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.scale(scale, scale);
    for (const c of allCanvases) {
      const r = c.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      ctx.drawImage(c, r.left - rootRect.left, r.top - rootRect.top, r.width, r.height);
    }
    out.toBlob(
      blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `paracosm-viz-t${currentTurn + 1}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      'image/png',
    );
  }, [currentTurn]);
  // Scene-transition vignette — briefly dims the whole viz when the
  // user jumps the playhead more than 1 turn in either direction.
  const [vignetteKey, setVignetteKey] = useState(0);
  const lastTurnRef = useRef<number>(-1);
  useEffect(() => {
    if (lastTurnRef.current === -1) {
      lastTurnRef.current = currentTurn;
      return;
    }
    if (Math.abs(currentTurn - lastTurnRef.current) >= 2) {
      setVignetteKey(k => k + 1);
    }
    lastTurnRef.current = currentTurn;
  }, [currentTurn]);
  useEffect(() => {
    const useNewGridFlag = import.meta.env.VITE_NEW_GRID !== '0';
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleStepBack(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleStepForward(); }
      else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); handlePlayPause(); }
      else if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); setHelpOpen(h => !h); }
      else if (e.key === 'Escape' && helpOpen) { e.preventDefault(); setHelpOpen(false); }
      else if (useNewGridFlag) {
        if (e.key === '1') { e.preventDefault(); setGridMode('living'); }
        else if (e.key === '2') { e.preventDefault(); setGridMode('mood'); }
        else if (e.key === '3') { e.preventDefault(); setGridMode('forge'); }
        else if (e.key === '4') { e.preventDefault(); setGridMode('ecology'); }
        else if (e.key === '5') { e.preventDefault(); setGridMode('divergence'); }
      } else {
        if (e.key === 'm' || e.key === 'M') {
          setMode(curr => CLUSTER_MODES[(CLUSTER_MODES.indexOf(curr) + 1) % CLUSTER_MODES.length]);
        }
        else if (e.key === 'd' || e.key === 'D') setShowDivergence(d => !d);
        else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); toggleAutomatonCollapsed(); }
        else if (e.key === '1') { e.preventDefault(); setAutomatonMode('mood'); }
        else if (e.key === '2') { e.preventDefault(); setAutomatonMode('forge'); }
        else if (e.key === '3') { e.preventDefault(); setAutomatonMode('ecology'); }
      }
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
  const narrow = useMediaQuery(NARROW_QUERY);
  if (useNewGrid) {
    const prevSnapA = currentTurn > 0
      ? (snapsA[currentTurn - 1] ?? snapsA[snapsA.length - 2])
      : undefined;
    const prevSnapB = currentTurn > 0
      ? (snapsB[currentTurn - 1] ?? snapsB[snapsB.length - 2])
      : undefined;
    const q = searchQuery.trim().toLowerCase();
    const searchMatches: SearchMatch[] = q
      ? [
          ...(snapA?.cells ?? [])
            .filter(c => c.alive && c.name.toLowerCase().includes(q))
            .map(cell => ({
              cell,
              side: 'a' as const,
              leaderName: leaderA?.name ?? 'Leader A',
              sideColor: '#e8b44a',
            })),
          ...(snapB?.cells ?? [])
            .filter(c => c.alive && c.name.toLowerCase().includes(q))
            .map(cell => ({
              cell,
              side: 'b' as const,
              leaderName: leaderB?.name ?? 'Leader B',
              sideColor: '#4ecdc4',
            })),
        ]
      : [];
    return (
      <div
        ref={vizRootRef}
        className="viz-content"
        style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}
      >
        <TurnBanner state={state} currentTurn={currentTurn} />
        <div
          style={{
            padding: '6px 10px 4px',
            background: 'var(--bg-deep)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <GridModePills
                mode={gridMode}
                onChange={setGridMode}
                counts={{
                  forge:
                    forgeFeeds.a.attempts.filter(a => a.approved).length +
                    forgeFeeds.b.attempts.filter(a => a.approved).length,
                  divergence:
                    (divergenceData.aliveOnlyA?.size ?? 0) +
                    (divergenceData.aliveOnlyB?.size ?? 0),
                }}
              />
            </div>
            <button
              type="button"
              onClick={cyclePalette}
              aria-label={`Palette: ${palette}. Click to cycle.`}
              title={`Palette: ${palette.toUpperCase()} (click to cycle)`}
              style={{
                padding: '0 8px',
                background:
                  palette === 'amber'
                    ? 'linear-gradient(135deg, #e8b44a 0 40%, #c44a1e 100%)'
                    : palette === 'cool'
                    ? 'linear-gradient(135deg, #4ecdc4 0 40%, #9b6bd8 100%)'
                    : 'linear-gradient(135deg, #f5f0e4 0 40%, #6b5f50 100%)',
                color: palette === 'mono' ? '#0a0806' : '#0a0806',
                border: '1px solid var(--border)',
                borderRadius: 3,
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {palette}
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              aria-label="Export current frame as PNG"
              title="Export PNG"
              style={{
                padding: '0 10px',
                background: 'var(--bg-card)',
                color: 'var(--text-3)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              PNG
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(o => !o)}
              aria-label="Open grid settings"
              aria-expanded={settingsOpen}
              title="Viz settings"
              style={{
                padding: '0 10px',
                background: settingsOpen ? 'var(--amber)' : 'var(--bg-card)',
                color: settingsOpen ? 'var(--bg-deep)' : 'var(--text-3)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {'\u2699'}
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Open help overlay (shortcut: ?)"
              title="Help — what do these colors / symbols mean? (press ?)"
              style={{
                padding: '0 10px',
                background: 'var(--bg-card)',
                color: 'var(--text-3)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              ?
            </button>
          </div>
          <div
            style={{
              fontSize: 9,
              color: 'var(--text-4)',
              fontFamily: 'var(--mono)',
              letterSpacing: '0.04em',
              minHeight: 12,
            }}
          >
            {gridModeHint(gridMode)}
          </div>
        </div>
        <ColonistSearch
          value={searchQuery}
          onChange={setSearchQuery}
          matches={searchMatches}
          onPick={m => {
            // Narrow the query to exactly this colonist so the bright
            // ring lands on a single glyph. Click the glyph for full
            // drilldown / chat.
            setSearchQuery(m.cell.name);
          }}
        />
        <TurnProgress
          eventsA={state.a.events as Array<{ type: string; turn?: number; data?: Record<string, unknown> }>}
          eventsB={state.b.events as Array<{ type: string; turn?: number; data?: Record<string, unknown> }>}
          totalDepartments={scenario.departments.length}
        />
        <EventChronicle
          eventsA={state.a.events as Array<{ type: string; turn?: number; data?: Record<string, unknown> }>}
          eventsB={state.b.events as Array<{ type: string; turn?: number; data?: Record<string, unknown> }>}
          currentTurn={currentTurn}
          onJumpToTurn={handleTurnChange}
          hoveredTurn={hoveredTurn}
          onHoverTurnChange={setHoveredTurn}
        />
        <TimelineSparkline
          snapsA={snapsA}
          snapsB={snapsB}
          currentTurn={currentTurn}
          onJumpToTurn={handleTurnChange}
          hoveredTurn={hoveredTurn}
          onHoverTurnChange={setHoveredTurn}
        />
        {diffLine && (
          <div style={{
            padding: '4px 12px', fontSize: 10, fontFamily: 'var(--mono)',
            color: 'var(--text-3)', background: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border)',
          }}>
            {diffLine}
          </div>
        )}
        <div
          className="leaders-row"
          style={{
            display: 'flex',
            flexDirection: narrow ? 'column' : 'row',
            flex: 1,
            minHeight: 0,
            gap: 4,
            overflow: narrow ? 'auto' : 'hidden',
          }}
        >
          <LivingColonyGrid
            snapshot={snapA}
            previousSnapshot={prevSnapA}
            snapshotHistory={snapsA}
            leaderName={leaderA?.name ?? 'Leader A'}
            leaderArchetype={leaderA?.archetype ?? ''}
            leaderColony={leaderA?.colony ?? ''}
            sideColor="var(--vis)"
            side="a"
            lagTurns={snapATurn < snapBTurn ? snapBTurn - snapATurn : 0}
            mode={gridMode}
            hexacoById={hexacoById}
            forgeAttempts={forgeFeeds.a.attempts}
            reuseCalls={forgeFeeds.a.reuses}
            divergedIds={divergenceData.aliveOnlyA}
            siblingHoveredId={hoveredB}
            onHoverChange={setHoveredA}
            searchQuery={searchQuery}
            palette={palette === 'cool' ? 1 : palette === 'mono' ? 2 : 0}
            settings={gridSettings}
            onOpenChat={handleOpenChat}
          />
          <LivingColonyGrid
            snapshot={snapB}
            previousSnapshot={prevSnapB}
            snapshotHistory={snapsB}
            leaderName={leaderB?.name ?? 'Leader B'}
            leaderArchetype={leaderB?.archetype ?? ''}
            leaderColony={leaderB?.colony ?? ''}
            sideColor="var(--eng)"
            side="b"
            lagTurns={snapBTurn < snapATurn ? snapATurn - snapBTurn : 0}
            mode={gridMode}
            hexacoById={hexacoById}
            forgeAttempts={forgeFeeds.b.attempts}
            reuseCalls={forgeFeeds.b.reuses}
            divergedIds={divergenceData.aliveOnlyB}
            siblingHoveredId={hoveredA}
            onHoverChange={setHoveredB}
            searchQuery={searchQuery}
            palette={palette === 'cool' ? 1 : palette === 'mono' ? 2 : 0}
            settings={gridSettings}
            onOpenChat={handleOpenChat}
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
        <div
          style={{
            padding: '2px 10px 4px',
            background: 'var(--bg-deep)',
            borderTop: '1px solid var(--border)',
            fontSize: 8,
            fontFamily: 'var(--mono)',
            color: 'var(--text-4)',
            letterSpacing: '0.08em',
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <Kbd k="?" v="help" />
          <Kbd k="1-5" v="mode" />
          <Kbd k="\u2190 \u2192" v="scrub turn" />
          <Kbd k="space" v="play / pause" />
          <Kbd k="click" v="colonist drilldown" />
          <Kbd k="esc" v="close popover" />
        </div>
        {/* Off-screen aria-live region announces turn deltas to
            screen readers without visual change. Only updates when
            the turn index changes. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {snapA && snapB
            ? `Turn ${Math.max(snapA.turn, snapB.turn)}. ${leaderA?.name ?? 'A'} colony: ${snapA.cells.filter(c => c.alive).length} alive, ${snapA.births} born, ${snapA.deaths} died, morale ${Math.round(snapA.morale * 100)}%. ${leaderB?.name ?? 'B'} colony: ${snapB.cells.filter(c => c.alive).length} alive, ${snapB.births} born, ${snapB.deaths} died, morale ${Math.round(snapB.morale * 100)}%.`
            : ''}
        </div>
        <GridHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
        <GridSettingsDrawer
          open={settingsOpen}
          settings={gridSettings}
          onChange={setGridSettings}
          onClose={() => setSettingsOpen(false)}
        />
        {crisisToast && (
          <div
            key={crisisToast.key}
            role="status"
            aria-live="polite"
            onClick={() => setCrisisToast(null)}
            style={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              maxWidth: 520,
              width: 'calc(100% - 24px)',
              padding: '8px 14px',
              background: 'rgba(14, 11, 9, 0.92)',
              border: `1px solid ${crisisToast.side === 'a' ? 'var(--vis)' : 'var(--eng)'}`,
              borderLeft: '3px solid var(--rust)',
              borderRadius: 4,
              fontFamily: 'var(--sans)',
              fontSize: 12,
              color: 'var(--text-1)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6)',
              zIndex: 30,
              cursor: 'pointer',
              animation: 'paracosm-toast-in 280ms ease-out',
            }}
            title="Click to dismiss"
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 9,
                fontFamily: 'var(--mono)',
                letterSpacing: '0.12em',
                color: 'var(--rust)',
                textTransform: 'uppercase',
                marginBottom: 2,
              }}
            >
              <span>\u26A1 Crisis</span>
              <span style={{ color: 'var(--text-3)' }}>
                {crisisToast.side.toUpperCase()} · T{crisisToast.turn} · {crisisToast.category}
              </span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.3 }}>
              {crisisToast.title || `${crisisToast.category} crisis unfolding`}
            </div>
          </div>
        )}
        {vignetteKey > 0 && (
          <div
            key={vignetteKey}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'radial-gradient(circle at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
              animation: 'paracosm-vignette 450ms ease-out forwards',
              zIndex: 50,
            }}
          />
        )}
        <style>{`
          @keyframes paracosm-vignette {
            0% { opacity: 0; }
            25% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes paracosm-toast-in {
            0% { opacity: 0; transform: translate(-50%, -8px); }
            100% { opacity: 1; transform: translate(-50%, 0); }
          }
        `}</style>
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
