import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TurnSnapshot, ClusterMode, CellSnapshot } from '../viz-types.js';
import { computeGridPositions } from './gridPositions.js';
import { computeChemistryParams, computeInjections } from './simToChemistry.js';
import { drawSeeds } from './SeedLayer.js';
import { drawGlyphs } from './GlyphLayer.js';
import { drawFlares } from './FlareLayer.js';
import { drawHud } from './HudLayer.js';
import { drawLines } from './LinesLayer.js';
import { drawDeptRings } from './DeptRingsLayer.js';
import { drawGhostTrail } from './GhostTrailLayer.js';
import {
  drawForgeHeatmap,
  drawEcologyResourceMap,
  drawDivergenceHighlight,
} from './ModeOverlayLayer.js';
import {
  createGolState,
  seedFromColonists,
  tickGol,
  drawGol,
  DEFAULT_GOL_CONFIG,
  type GolState,
} from './GameOfLifeLayer.js';
import { useGridState, type ForgeAttempt, type ReuseCall } from './useGridState.js';
import { computeDeptCenters } from './deptCenters.js';
import { GridRenderer } from '../../../lib/webgl/gridRenderer.js';
import { flaresToDeposits } from '../../../lib/webgl/events.js';
import { GridMetricsStrip } from './GridMetricsStrip.js';
import { hitTestGlyph } from './hitTest.js';
import type { GridMode } from './GridModePills.js';
import { ClickPopover, type ClickPopoverPayload } from './ClickPopover.js';
import { useMediaQuery, NARROW_QUERY, REDUCED_MOTION_QUERY } from './useMediaQuery.js';
import { DEFAULT_GRID_SETTINGS, type GridSettings } from './GridSettingsDrawer.js';
import { RosterDrawer } from './RosterDrawer.js';
import { FeaturedSpotlight } from './FeaturedSpotlight.js';
import { useScenarioLabels } from '../../../hooks/useScenarioLabels.js';

interface HexacoShape { O: number; C: number; E: number; A: number; Em: number; HH: number }

interface LivingSwarmGridProps {
  snapshot: TurnSnapshot | undefined;
  previousSnapshot?: TurnSnapshot | undefined;
  /** Full snapshot history for this side; enables recent-memory lookup. */
  snapshotHistory?: TurnSnapshot[];
  leaderName: string;
  leaderArchetype: string;
  leaderColony?: string;
  /** First year of the scenario for HUD "Yr N" readout. */
  startYear?: number;
  sideColor: string;
  side: 'a' | 'b';
  lagTurns?: number;
  clusterMode?: ClusterMode;
  initialPopulation?: number;
  /** Shared grid mode across both leaders. */
  mode: GridMode;
  /** HEXACO profiles keyed by agentId for the popover radar. */
  hexacoById?: Map<string, HexacoShape>;
  /**
   * Leader's own HEXACO profile. When supplied, the Gray-Scott
   * chemistry nudges F/k based on the leader's archetype so the two
   * panels diverge visibly from turn 1 even when colony stats are
   * identical — addressing user feedback that both sides rendered
   * identically because the field inputs (morale/food/pop) were the
   * same on both colonies at launch.
   */
  leaderHexaco?: HexacoShape;
  /** Cumulative forge attempts for this side — drives forge flares. */
  forgeAttempts?: ForgeAttempt[];
  /** Cumulative reuse calls — drives reuse arcs. */
  reuseCalls?: ReuseCall[];
  /** Colonists alive on this side but dead on the other at the same
   *  turn. Highlighted in DIVERGENCE mode + tinted in all other modes
   *  when non-empty. */
  divergedIds?: Set<string>;
  /** agentId currently hovered on the SIBLING panel. Shown as a
   *  sympathetic ring on this side so the same colonist is easy to
   *  compare across panels. */
  siblingHoveredId?: string | null;
  /** Fires when the user hovers a colonist on this panel. Lifted so
   *  the sibling panel can render a sympathetic ring. */
  onHoverChange?: (agentId: string | null) => void;
  /** Case-insensitive name substring. When non-empty, matching glyphs
   *  get a bright halo and non-matches dim. */
  searchQuery?: string;
  /** Display-shader palette: 0=amber, 1=cool, 2=mono. */
  palette?: 0 | 1 | 2;
  /** User-tunable viz settings (anim speed, rings, lines, dust, crosshair). */
  settings?: GridSettings;
  /** Full-screen state — if `this` is the active full-screen side,
   *  `'a'` or `'b'`. When focused side is not this panel, we hide. */
  focusedSide?: 'a' | 'b' | null;
  /** Fires when the focus-toggle is clicked. Parent decides whether
   *  this panel becomes sole focus or both return to side-by-side. */
  onToggleFocus?: (side: 'a' | 'b') => void;
  /** Invoked when the user chooses "Open chat" inside the popover. */
  onOpenChat?: (colonistName: string) => void;
  /**
   * Active event-kind filter from the EventChronicle strip. When set
   * to anything other than `'all'`, flares whose kind doesn't match
   * are dropped from the canvas — the user's filter choice propagates
   * through to the main visualization instead of only hiding
   * chronicle rows. `'all'` (default when omitted) is a passthrough.
   */
  eventFilter?: 'all' | 'birth' | 'death' | 'forge' | 'crisis';
  /**
   * The chronicle pill the user is currently hovering (or null when
   * the cursor left the strip). When the hovered pill's `side`
   * matches this panel's side, the panel border briefly pulses in
   * the event's category color — making the chronicle row feel
   * directly connected to the canvas.
   */
  chronicleHover?: { kind: 'birth' | 'death' | 'forge' | 'crisis'; side: 'a' | 'b'; turn: number } | null;
}

function resolveRgb(color: string, element: HTMLElement | null): [number, number, number] {
  let hex = color.trim();
  if (hex.startsWith('var(') && element) {
    const varName = hex.slice(4, -1).trim();
    const computed = getComputedStyle(element).getPropertyValue(varName).trim();
    if (computed) hex = computed;
  }
  if (hex.startsWith('#')) {
    const n = parseInt(hex.slice(1), 16);
    if (hex.length === 7) {
      return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
    }
    if (hex.length === 4) {
      const r = (n >> 8) & 0xf;
      const g = (n >> 4) & 0xf;
      const b = n & 0xf;
      return [(r * 17) / 255, (g * 17) / 255, (b * 17) / 255];
    }
  }
  const rgbMatch = hex.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 3) {
      return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
    }
  }
  return [0.35, 0.28, 0.2];
}

function resolveCssColor(color: string, element: HTMLElement | null): string {
  if (color.startsWith('var(') && element) {
    const varName = color.slice(4, -1).trim();
    const computed = getComputedStyle(element).getPropertyValue(varName).trim();
    if (computed) return computed;
  }
  return color;
}

const GRID_W = 384;
const GRID_H = 240;

/**
 * Per-leader living swarm grid. WebGL2 Gray-Scott field in back,
 * Canvas2D overlay in front (seeds, glyphs, flares, dept labels, HUD),
 * GridMetricsStrip DOM layer above. Hover tooltip tracks the nearest
 * agent under cursor. Named "swarm" rather than "colony" so the
 * component reads cleanly for non-Mars scenarios (corporate org,
 * military unit, research lab, etc.) — the underlying semantics are
 * scenario-agnostic; only the `scenarioLabels` hook localizes the
 * population-noun ("colonist" / "employee" / "soldier" / ...).
 */
export function LivingSwarmGrid(props: LivingSwarmGridProps) {
  const {
    snapshot,
    previousSnapshot,
    snapshotHistory,
    leaderName,
    leaderArchetype,
    startYear,
    sideColor,
    side,
    lagTurns,
    clusterMode = 'departments',
    initialPopulation = 20,
    mode,
    hexacoById,
    leaderHexaco,
    forgeAttempts,
    reuseCalls,
    divergedIds,
    siblingHoveredId,
    onHoverChange,
    searchQuery = '',
    palette = 0,
    settings = DEFAULT_GRID_SETTINGS,
    focusedSide = null,
    onToggleFocus,
    onOpenChat,
    eventFilter = 'all',
    chronicleHover = null,
  } = props;
  const isFocused = focusedSide === side;

  const narrow = useMediaQuery(NARROW_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const scenarioLabels = useScenarioLabels();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GridRenderer | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [webglFailed, setWebglFailed] = useState(false);
  const [hovered, setHovered] = useState<{
    cell: CellSnapshot;
    x: number;
    y: number;
  } | null>(null);
  // Raw cursor position in overlay-canvas pixel space. Used to draw a
  // dim crosshair + "nearest colonist" reading even when the cursor
  // is between glyphs (i.e. no glyph hit but cursor is still on-canvas).
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [popover, setPopover] = useState<ClickPopoverPayload | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  /** Turn-transition pulse value in [0, 1], decays per frame. Non-
   *  reactive so it doesn't force re-render on every decay step —
   *  the render effect reads `.current` inline. */
  const pulseRef = useRef<number>(0);
  const lastTurnRef = useRef<number>(-1);
  /**
   * Mount-time staged reveal. Uses a CSS-driven cover-div approach
   * rather than canvas globalAlpha because the canvas layers mutate
   * alpha internally via save/restore, which would clobber any
   * outer alpha. The cover div starts opaque (hiding the canvas
   * entirely) then transitions to transparent over 400ms — gives
   * the tab a smooth "curtain rise" on mount without requiring any
   * per-frame redraw. Reduced-motion users get instant reveal.
   */
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    // Start on next frame so the CSS transition fires (setting
    // revealed=true synchronously would skip the transition).
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);
  // Conway Game of Life overlay state. Persistent across renders so
  // the discrete-cell pattern evolves continuously rather than
  // resetting every frame. Re-seeded on turn change or when the
  // grid is empty; evolves via classic B3/S23 in between.
  const golStateRef = useRef<GolState>(createGolState(DEFAULT_GOL_CONFIG.cols, DEFAULT_GOL_CONFIG.rows));
  // Separate last-seen-turn ref for GoL so the GoL re-seed logic is
  // independent of the RD pulse ref (which updates earlier in the
  // same effect). Sharing one ref caused turnChanged to always read
  // false by the time GoL ran → grid never seeded → empty canvas.
  const lastGolTurnRef = useRef<number>(-1);
  // Relationship-flare: when a colonist is clicked, brighten their
  // partner/child arcs briefly (~1s decay). Ref, not state, so the
  // decay itself doesn't force re-render — consumed in the render
  // effect alongside the RD pulse.
  const relationshipFlareRef = useRef<{ id: string | null; intensity: number }>({
    id: null,
    intensity: 0,
  });

  // Resize observer on the canvas wrapper (not the full container — the
  // container also holds the metrics strip DOM above the canvas).
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(1, Math.round(e.contentRect.width));
        const h = Math.max(1, Math.round(e.contentRect.height));
        setSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0 || rendererRef.current) return;
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    try {
      rendererRef.current = new GridRenderer({ canvas, width: GRID_W, height: GRID_H });
    } catch (err) {
      console.warn('[LivingSwarmGrid] WebGL2 init failed', err);
      setWebglFailed(true);
    }
    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [size.w, size.h]);

  useEffect(() => {
    const c = overlayCanvasRef.current;
    if (!c || size.w === 0 || size.h === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [size.w, size.h]);

  const positions = useMemo(() => {
    if (!snapshot || size.w === 0) return new Map<string, { x: number; y: number }>();
    return computeGridPositions(snapshot.cells, clusterMode, size.w, size.h);
  }, [snapshot, clusterMode, size.w, size.h]);

  const gridPositions = useMemo(() => {
    if (!snapshot) return new Map<string, { x: number; y: number }>();
    return computeGridPositions(snapshot.cells, clusterMode, GRID_W, GRID_H);
  }, [snapshot, clusterMode]);

  const deptCentersOverlay = useMemo(() => {
    if (!snapshot) return new Map<string, { x: number; y: number }>();
    return computeDeptCenters(snapshot.cells, positions);
  }, [snapshot, positions]);

  const gridState = useGridState(
    {
      snapshot,
      previousSnapshot,
      forgeAttempts,
      reuseCalls,
      eventCategories: snapshot?.eventCategories,
    },
    canvasWrapRef,
    () => positions,
    () => deptCentersOverlay,
  );

  // Mode-driven rendering. Prior behaviour only nudged fieldIntensity
  // by ~0.45 between modes, so pressing LIVING / MOOD / FORGE / ECOLOGY
  // / DIVERGENCE produced near-identical visual output — the mode
  // switcher read as a no-op to users. Each mode now drives a much
  // stronger delta across fieldIntensity + seedIntensity + glyph
  // visibility + palette + sideTint source so the canvas clearly
  // reconfigures on each pill press:
  //
  //   LIVING     : full field + glyphs + lines, default palette. The
  //                "default dashboard" view.
  //   MOOD       : cool (teal/violet) palette, sideTint re-derived
  //                from dominant alive-colonist mood. Seeds still
  //                visible; lines visible. Reads as emotional-state
  //                field rather than side-affiliation.
  //   FORGE      : field dimmed hard (0.2×), palette flipped to mono.
  //                Glyphs also dimmed so forge-flare pulses dominate.
  //                Reads as "where in the colony is forging happening".
  //   ECOLOGY    : field very dim (0.25×), glyphs hidden entirely.
  //                Lets the metrics strip + crisis shockwaves carry
  //                the story. Reads as pure resource / event stream.
  //   DIVERGENCE : field medium-dim, palette default, glyphs fully
  //                bright so the diverged-only highlight rings pop.
  //                Reads as "who died / survived that the other side
  //                did the opposite of".
  const modeConfig = (() => {
    switch (mode) {
      case 'mood':
        return { fieldIntensity: 0.9, seedIntensity: 1.1, glyphIntensity: 1.0, palette: 1 as 0 | 1 | 2 };
      case 'forge':
        return { fieldIntensity: 0.2, seedIntensity: 0.4, glyphIntensity: 0.7, palette: 2 as 0 | 1 | 2 };
      case 'ecology':
        return { fieldIntensity: 0.25, seedIntensity: 0.0, glyphIntensity: 0.0, palette: 0 as 0 | 1 | 2 };
      case 'divergence':
        return { fieldIntensity: 0.7, seedIntensity: 1.0, glyphIntensity: 1.0, palette: palette };
      case 'living':
      default:
        return { fieldIntensity: 1.0, seedIntensity: 1.0, glyphIntensity: 1.0, palette: palette };
    }
  })();
  const fieldIntensity = modeConfig.fieldIntensity;
  const seedIntensity = modeConfig.seedIntensity;
  const glyphIntensity = modeConfig.glyphIntensity;
  const effectivePalette = modeConfig.palette;

  // MOOD mode re-derives the field tint from the dominant alive-cell
  // mood rather than side affiliation. Both leader panels end up
  // visually distinct from each other when their mood distributions
  // diverge (e.g. Aria's visionary colony trending anxious while
  // Voss's engineer colony holds neutral). Falls back to sideColor
  // on empty / null snapshots.
  const moodTintedSideColor = useMemo(() => {
    if (mode !== 'mood' || !snapshot) return sideColor;
    const alive = snapshot.cells.filter(c => c.alive);
    if (alive.length === 0) return sideColor;
    const moodCounts: Record<string, number> = {};
    for (const c of alive) {
      moodCounts[c.mood] = (moodCounts[c.mood] || 0) + 1;
    }
    let dominantMood = 'neutral';
    let bestCount = 0;
    for (const [m, n] of Object.entries(moodCounts)) {
      if (n > bestCount) { bestCount = n; dominantMood = m; }
    }
    // Map to CSS color vars so theme switching still works. Tokens
    // here match the Toast / MetricsStrip mood palette used elsewhere.
    switch (dominantMood) {
      case 'positive':
      case 'hopeful': return 'var(--green)';
      case 'anxious': return 'var(--amber)';
      case 'negative':
      case 'defiant': return 'var(--rust)';
      case 'resigned': return 'var(--text-3)';
      default: return sideColor;
    }
  }, [mode, snapshot, sideColor]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const overlay = overlayCanvasRef.current;
    if (!renderer || !overlay || !snapshot) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // Turn transition pulse: spike the pulse value on turn change, then
    // decay by ~0.05/frame (≈600ms at 30fps) back to 0. Used to brighten
    // the field tint and thicken the panel glow briefly.
    if (snapshot.turn !== lastTurnRef.current) {
      lastTurnRef.current = snapshot.turn;
      if (!reducedMotion) pulseRef.current = 1.0;
    } else {
      pulseRef.current = Math.max(0, pulseRef.current - 0.05);
    }
    const pulse = pulseRef.current;

    // Thread the leader's HEXACO into the chemistry resolver so the
    // Gray-Scott F/k lands in a personality-shifted spot within its
    // safe band. This is the visible fix for "both sides look
    // identical on turn 1" — the morale/food/pop inputs are the same
    // at launch, but Visionary (high O+E) and Engineer (high C, low
    // E) leaders now compute different F/k targets from the start.
    const leaderPersonality = leaderHexaco
      ? {
          openness: leaderHexaco.O,
          conscientiousness: leaderHexaco.C,
          extraversion: leaderHexaco.E,
          agreeableness: leaderHexaco.A,
          emotionality: leaderHexaco.Em,
          honestyHumility: leaderHexaco.HH,
        }
      : undefined;
    const { F, k } = computeChemistryParams(snapshot, initialPopulation, leaderPersonality);
    const injections = computeInjections(snapshot.cells, gridPositions);
    const colonistDeposits = injections.map(i => ({
      x: i.x,
      y: i.y,
      channel: i.channel,
      strength: i.strength * seedIntensity,
      radius: 1,
    } as const));
    // Apply the chronicle-strip filter here so the user's "show me
    // only forges" / "only crises" choice propagates through to the
    // main canvas. The flare `.kind` vocabulary is broader than the
    // chronicle's — forge covers approved, rejected, AND reuse calls
    // so a "forges" filter keeps the whole forge narrative intact.
    const flareMatchesFilter = (f: { kind: string }): boolean => {
      if (eventFilter === 'all') return true;
      if (eventFilter === 'birth') return f.kind === 'birth';
      if (eventFilter === 'death') return f.kind === 'death';
      if (eventFilter === 'crisis') return f.kind === 'crisis';
      if (eventFilter === 'forge') {
        return f.kind === 'forge_approved' || f.kind === 'forge_rejected' || f.kind === 'reuse';
      }
      return true;
    };
    const visibleFlares = gridState.flares.filter(flareMatchesFilter);
    // Flares are stored in overlay-space pixels; rescale to grid-space
    // for WebGL deposits. Overlay continues to render with the original
    // pixel coords so flare rings land under the cursor correctly.
    const scaleX = GRID_W / Math.max(1, size.w);
    const scaleY = GRID_H / Math.max(1, size.h);
    const flaresGridSpace = visibleFlares.map(f => ({
      ...f,
      x: f.x * scaleX,
      y: f.y * scaleY,
      endX: typeof f.endX === 'number' ? f.endX * scaleX : undefined,
      endY: typeof f.endY === 'number' ? f.endY * scaleY : undefined,
    }));
    const flareDepositsGrid = flaresToDeposits(flaresGridSpace, GRID_W, GRID_H);

    // MOOD mode swaps the field tint from side-affiliation color to
    // the dominant-mood color resolved above. All other modes keep
    // their configured sideColor so the left/right split reads as
    // leader A vs leader B.
    const tintSource = mode === 'mood' ? moodTintedSideColor : sideColor;
    const tintBase = resolveRgb(tintSource, containerRef.current);
    // Pulse boosts tint briefly on each new turn so the field "breathes"
    // when fresh data lands.
    const pulseBoost = 1 + pulse * 0.7;
    const tintScaled: [number, number, number] = [
      Math.min(1, tintBase[0] * fieldIntensity * pulseBoost),
      Math.min(1, tintBase[1] * fieldIntensity * pulseBoost),
      Math.min(1, tintBase[2] * fieldIntensity * pulseBoost),
    ];
    // Reduced motion: render one tick per snapshot change (no ongoing
    // animation), stepsPerFrame=0 stops RD evolution. Event flares still
    // decay visually but the field itself freezes between turns.
    const baseSteps = reducedMotion ? 0 : 2;
    const scaledSteps = Math.max(0, Math.round(baseSteps * settings.animSpeed));
    renderer.tick({
      F: F * fieldIntensity,
      k,
      deposits: [...colonistDeposits, ...flareDepositsGrid],
      sideTint: tintScaled,
      stepsPerFrame: scaledSteps,
      palette: effectivePalette,
    });

    const resolvedSide = resolveCssColor(sideColor, containerRef.current);
    // Resolve theme-dependent colors from CSS vars FIRST. The ghost-trail
    // block below consumes `cs` + `hexToRgba`, and `drawGlyphs` consumes
    // `textMuted` — both were previously declared lower in this function,
    // which became a TDZ ("Cannot access 'wn' before initialization") the
    // moment Vite's prod minifier reordered statements around them. Keep
    // this block ABOVE every draw call that uses its outputs.
    const cs = containerRef.current ? getComputedStyle(containerRef.current) : null;
    const hexToRgba = (hex: string, alpha: number): string | null => {
      if (!hex.startsWith('#') || hex.length !== 7) return null;
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 0xff;
      const g = (n >> 8) & 0xff;
      const b = n & 0xff;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    const labelBg =
      (cs && hexToRgba(cs.getPropertyValue('--bg-deep').trim(), 0.85)) ||
      'rgba(10, 8, 6, 0.85)';
    const textMuted =
      (cs && hexToRgba(cs.getPropertyValue('--text-2').trim(), 0.8)) ||
      'rgba(216, 204, 176, 0.75)';
    const crosshairStroke =
      (cs && hexToRgba(cs.getPropertyValue('--text-2').trim(), 0.22)) ||
      'rgba(216, 204, 176, 0.22)';
    // Bumped from 0.4/0.7 → 0.7/0.95 so the "→ Name" tracer reads at
    // a glance over dense Conway tiles. Prior values were correct for
    // a near-empty canvas but lost against the new GoL-tile backdrop.
    const crosshairTracerStroke =
      (cs && hexToRgba(cs.getPropertyValue('--text-2').trim(), 0.7)) ||
      'rgba(216, 204, 176, 0.7)';
    const crosshairTracerFill =
      (cs && hexToRgba(cs.getPropertyValue('--text-2').trim(), 0.95)) ||
      'rgba(216, 204, 176, 0.95)';
    ctx.clearRect(0, 0, size.w, size.h);
    // Conway Game of Life pass — discrete-cell pattern layered UNDER
    // the seeds / glyphs / HUD so the colonist markers still read as
    // the primary foreground.
    //
    // Strategy: on turn change (or first mount), seed the grid from
    // colonist positions AND run a burst of ~12 generations
    // synchronously to let the Conway pattern stabilize into its
    // period-2 oscillators, gliders, and still-lifes. Then STOP
    // ticking — the rendered pattern stays static until the next
    // turn change. This addresses user feedback that per-frame
    // evolution looked like "weird animations" on tab open, and that
    // a completed run should present a static final pattern rather
    // than an indefinitely-running simulation inside a simulation.
    //
    // Reduced-motion users get a shorter warmup (6 generations) for
    // the same static result but at lower CPU cost.
    const gol = golStateRef.current;
    const turnChanged = snapshot.turn !== lastGolTurnRef.current;
    let gridEmpty = true;
    for (let i = 0; i < gol.grid.length; i += 1) {
      if (gol.grid[i] > 0) { gridEmpty = false; break; }
    }
    if (turnChanged || gridEmpty) {
      lastGolTurnRef.current = snapshot.turn;
      seedFromColonists(gol, snapshot.cells, positions, size.w, size.h);
      // Shorter warmup — just enough for the seed patterns to bloom
      // into recognizable oscillators without evolving into a late-
      // stage random soup. 5 ticks preserves blinkers / gliders /
      // still-lifes near their initial placement, so the pattern
      // reads as "seeded by the turn state" not "random chaos".
      const warmup = reducedMotion ? 3 : 5;
      for (let i = 0; i < warmup; i += 1) tickGol(gol);
    }
    // No per-frame ticking. The pattern is drawn once per render but
    // does not evolve until the turn changes again.
    // GoL layer dims with the same mode-config as the RD field so
    // ecology / forge don't drown the strip / forge-flare overlays.
    // Canvas 2D's ctx.fillStyle does NOT resolve `var(--x)` CSS
    // variables — assigning an unresolved value silently drops the
    // fill (this was the bug that made the GoL overlay invisible).
    // Always pass a concrete rgb/hex string resolved upfront.
    const golColor = mode === 'mood'
      ? resolveCssColor(moodTintedSideColor, containerRef.current)
      : resolvedSide;
    drawGol(
      ctx,
      gol,
      size.w,
      size.h,
      golColor,
      fieldIntensity * 0.9,
    );
    if (mode !== 'ecology') drawSeeds(ctx, snapshot.cells, positions);
    if (mode !== 'ecology' && settings.deptRings) drawDeptRings(ctx, snapshot.cells, positions);
    if (settings.ghostTrail && previousSnapshot) {
      const prevPositions = computeGridPositions(
        previousSnapshot.cells,
        clusterMode,
        size.w,
        size.h,
      );
      const ghostColors = {
        outline:
          (cs && hexToRgba(cs.getPropertyValue('--text-2').trim(), 0.32)) ||
          'rgba(216, 204, 176, 0.32)',
        arrowLine:
          (cs && hexToRgba(cs.getPropertyValue('--text-2').trim(), 0.25)) ||
          'rgba(216, 204, 176, 0.25)',
        arrowHead:
          (cs && hexToRgba(cs.getPropertyValue('--text-2').trim(), 0.5)) ||
          'rgba(216, 204, 176, 0.5)',
      };
      drawGhostTrail(
        ctx,
        snapshot.cells,
        positions,
        previousSnapshot.cells,
        prevPositions,
        ghostColors,
      );
    }
    // Relationship lines render in two distinct modes:
    //
    //  - `settings.lines` ON: full relationship graph (every partner
    //    arc + every parent/child line on the grid).
    //  - `settings.lines` OFF (default): only draw the focused
    //    network for a recently-clicked colonist, via the
    //    relationshipFlare ref. Users who click a glyph get to see
    //    just THAT colonist's partners/children highlighted in
    //    side-color for ~1s, with zero background clutter from
    //    unrelated colonists. Addresses the pattern where the
    //    always-on relationship graph read as "weird diamond
    //    animations" over a dense grid.
    if (mode === 'living' || mode === 'mood') {
      // Decay relationship flare ~0.03/frame → ~1s total at 30fps.
      relationshipFlareRef.current.intensity = Math.max(
        0,
        relationshipFlareRef.current.intensity - 0.03,
      );
      const flareActive =
        !settings.lines &&
        relationshipFlareRef.current.id !== null &&
        relationshipFlareRef.current.intensity > 0.05;
      if (settings.lines || flareActive) {
        drawLines(ctx, snapshot.cells, positions, resolvedSide, {
          flareAgentId: relationshipFlareRef.current.id,
          flareIntensity: relationshipFlareRef.current.intensity,
          focusOnly: !settings.lines,
        });
      }
    }
    // Draw the filtered flare subset on the overlay. Using the
    // pre-filtered `visibleFlares` keeps the main canvas in lock-step
    // with what the chronicle strip is showing — hiding a kind in one
    // widget hides it in both.
    drawFlares(ctx, visibleFlares);
    if (mode !== 'ecology')
      drawGlyphs(
        ctx,
        snapshot.cells,
        positions,
        resolvedSide,
        glyphIntensity,
        divergedIds,
        mode === 'divergence',
        reducedMotion ? 0 : performance.now(),
        searchQuery,
        true, // always-on labels for featured + diverged
        textMuted,
      );
    // Mode-specific overlays. Each runs AFTER the base layers so its
    // own visual signature rides on top of the RD/GoL backdrop, and
    // BEFORE the HUD so the corner readouts stay readable.
    if (mode === 'forge' && forgeAttempts && forgeAttempts.length > 0) {
      drawForgeHeatmap(
        ctx,
        snapshot.cells,
        positions,
        forgeAttempts.map(f => ({
          department: f.department,
          turn: f.turn,
          approved: f.approved,
        })),
        resolvedSide,
      );
    }
    if (mode === 'ecology') {
      drawEcologyResourceMap(ctx, snapshot, size.w, size.h);
    }
    if (mode === 'divergence') {
      drawDivergenceHighlight(
        ctx,
        snapshot.cells,
        positions,
        divergedIds,
        reducedMotion ? 0 : performance.now(),
        resolvedSide,
      );
    }
    drawHud(ctx, snapshot, {
      leaderName,
      leaderArchetype,
      startYear,
      sideColor: resolvedSide,
      width: size.w,
      height: size.h,
      lagTurns,
      cells: snapshot.cells,
      positions,
      previousSnapshot,
      labelBg,
      textMuted,
      deptLabels: settings.deptLabels,
    });

    // Hover ring on top of HUD so it reads as "selected".
    if (hovered) {
      const pos = positions.get(hovered.cell.agentId);
      if (pos) {
        ctx.save();
        ctx.strokeStyle = resolvedSide;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    // Dim crosshair following the cursor when it's over the canvas
    // but not hovering any glyph directly. Gives the user a precise
    // positional reference when reading the field.
    if (cursor && !hovered && settings.crosshair) {
      ctx.save();
      ctx.strokeStyle = crosshairStroke;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, cursor.y);
      ctx.lineTo(size.w, cursor.y);
      ctx.moveTo(cursor.x, 0);
      ctx.lineTo(cursor.x, size.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // Nearest alive colonist within a 40px radius — show their name
      // as a tiny ghost label so the user can orient.
      let nearest: { id: string; name: string; dx: number; dy: number; d2: number } | null = null;
      for (const c of snapshot.cells) {
        if (!c.alive) continue;
        const pos = positions.get(c.agentId);
        if (!pos) continue;
        const dx = pos.x - cursor.x;
        const dy = pos.y - cursor.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1600) continue; // >40px
        if (!nearest || d2 < nearest.d2) nearest = { id: c.agentId, name: c.name, dx, dy, d2 };
      }
      if (nearest) {
        ctx.save();
        ctx.strokeStyle = crosshairTracerStroke;
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(cursor.x, cursor.y);
        ctx.lineTo(cursor.x + nearest.dx, cursor.y + nearest.dy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = crosshairTracerFill;
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`\u2192 ${nearest.name.split(' ')[0]}`, cursor.x + 6, cursor.y + 6);
        ctx.restore();
      }
    }
    // Sympathetic ring: same colonist is being hovered on the sibling
    // panel. Dashed + dimmer so it reads as secondary.
    if (siblingHoveredId && siblingHoveredId !== hovered?.cell.agentId) {
      const pos = positions.get(siblingHoveredId);
      if (pos) {
        ctx.save();
        ctx.strokeStyle = 'rgba(232, 180, 74, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }, [
    gridState.tickClock,
    snapshot,
    positions,
    gridPositions,
    size.w,
    size.h,
    sideColor,
    leaderName,
    initialPopulation,
    lagTurns,
    gridState.flares,
    mode,
    fieldIntensity,
    seedIntensity,
    glyphIntensity,
    hovered,
    divergedIds,
    siblingHoveredId,
    reducedMotion,
    searchQuery,
    palette,
    cursor,
    settings,
    leaderArchetype,
    startYear,
  ]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!snapshot) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCursor({ x, y });
      const hit = hitTestGlyph(snapshot.cells, positions, x, y);
      if (hit) {
        setHovered(prev =>
          prev && prev.cell.agentId === hit.agentId ? prev : { cell: hit, x, y },
        );
        onHoverChange?.(hit.agentId);
      } else if (hovered) {
        setHovered(null);
        onHoverChange?.(null);
      }
    },
    [snapshot, positions, hovered, onHoverChange],
  );
  const onMouseLeave = useCallback(() => {
    setHovered(null);
    setCursor(null);
    onHoverChange?.(null);
  }, [onHoverChange]);
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!snapshot) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestGlyph(snapshot.cells, positions, x, y);
      if (hit) {
        setPopover({ cell: hit, x, y });
        setHovered(null);
        relationshipFlareRef.current = { id: hit.agentId, intensity: 1 };
      }
    },
    [snapshot, positions],
  );

  // Close popover when the selected colonist vanishes (death during
  // scrub/live update). Keeps the UI from showing stale drilldowns.
  useEffect(() => {
    if (!popover || !snapshot) return;
    const stillAlive = snapshot.cells.find(c => c.agentId === popover.cell.agentId);
    if (!stillAlive) setPopover(null);
  }, [popover, snapshot]);

  return (
    <div
      ref={containerRef}
      data-testid={`living-colony-grid-${side}`}
      role="region"
      aria-label={`${leaderName} ${scenarioLabels.place} viz`}
      style={{
        flex: narrow ? '0 0 auto' : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        minWidth: 0,
        minHeight: narrow ? 420 : 0,
        overflow: 'hidden',
      }}
    >
      {snapshot && <GridMetricsStrip snapshot={snapshot} sideColor={sideColor} />}
      <div
        ref={canvasWrapRef}
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          overflow: 'hidden',
          // Background star dust layer: repeating radial-gradient sim-
          // ulates a very faint satellite-scan speckle so empty grid
          // space doesn't read as flat black. Toggleable via settings.
          background: settings.dust
            ? `radial-gradient(1px 1px at 12% 28%, rgba(216, 204, 176, 0.12), transparent 60%), ` +
              `radial-gradient(1px 1px at 37% 73%, rgba(216, 204, 176, 0.08), transparent 60%), ` +
              `radial-gradient(1px 1px at 64% 14%, rgba(216, 204, 176, 0.1), transparent 60%), ` +
              `radial-gradient(1px 1px at 82% 52%, rgba(216, 204, 176, 0.07), transparent 60%), ` +
              `radial-gradient(1px 1px at 51% 90%, rgba(216, 204, 176, 0.09), transparent 60%), ` +
              `radial-gradient(1px 1px at 7% 61%, rgba(216, 204, 176, 0.06), transparent 60%), ` +
              `radial-gradient(1px 1px at 93% 84%, rgba(216, 204, 176, 0.08), transparent 60%), ` +
              `var(--bg-deep)`
            : 'var(--bg-deep)',
          backgroundSize: settings.dust
            ? '140px 140px, 160px 160px, 130px 130px, 170px 170px, 150px 150px, 180px 180px, 165px 165px, auto'
            : 'auto',
          // Border + boxShadow cycle between the morale-derived
          // default and a chronicle-hover override. When the user
          // hovers a chronicle pill that belongs to THIS side, the
          // panel pulses in the event's category color so the two
          // UI surfaces read as connected. Fades back to the morale
          // color on pointer leave via the 400ms border-color
          // transition already in place.
          border: `2px solid ${
            chronicleHover && chronicleHover.side === side
              ? ({
                  birth: 'rgba(154, 205, 96, 0.95)',
                  death: 'rgba(200, 95, 80, 0.95)',
                  forge: 'rgba(232, 180, 74, 0.95)',
                  crisis: 'rgba(196, 74, 30, 0.95)',
                } as const)[chronicleHover.kind]
              : snapshot
              ? snapshot.morale >= 0.6
                ? 'rgba(106, 173, 72, 0.55)'
                : snapshot.morale >= 0.3
                ? 'rgba(232, 180, 74, 0.55)'
                : 'rgba(196, 74, 30, 0.65)'
              : `${sideColor}33`
          }`,
          borderRadius: 4,
          boxShadow: chronicleHover && chronicleHover.side === side
            ? `0 0 24px ${({
                birth: 'rgba(154, 205, 96, 0.55)',
                death: 'rgba(200, 95, 80, 0.55)',
                forge: 'rgba(232, 180, 74, 0.55)',
                crisis: 'rgba(196, 74, 30, 0.55)',
              } as const)[chronicleHover.kind]}`
            : snapshot
            ? snapshot.morale >= 0.6
              ? '0 0 16px rgba(106, 173, 72, 0.18)'
              : snapshot.morale >= 0.3
              ? '0 0 16px rgba(232, 180, 74, 0.12)'
              : '0 0 20px rgba(196, 74, 30, 0.25)'
            : 'none',
          transition: 'border-color 200ms ease, box-shadow 200ms ease',
        }}
      >
        <canvas
          ref={webglCanvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: webglFailed ? 'none' : 'block',
            imageRendering: 'pixelated',
          }}
        />
        <canvas
          ref={overlayCanvasRef}
          role="img"
          aria-label={
            snapshot
              ? `${leaderName} ${scenarioLabels.place}, turn ${snapshot.turn}. ${snapshot.cells.filter(c => c.alive).length} alive, morale ${Math.round(snapshot.morale * 100)}%, food reserve ${snapshot.foodReserve.toFixed(1)} months. ${snapshot.births} births, ${snapshot.deaths} deaths this turn. Click a ${scenarioLabels.person} glyph for drilldown.`
              : `${leaderName} ${scenarioLabels.place} — waiting for first turn.`
          }
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            cursor: hovered ? 'pointer' : 'default',
          }}
        />
        {webglFailed && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-4)',
              fontSize: 11,
              fontFamily: 'var(--mono)',
            }}
          >
            WebGL2 unavailable
          </div>
        )}
        {/* Staged fade-in cover. Starts opaque on mount, transitions
            to transparent so the canvas emerges over 400ms with a
            slight radial reveal — feels intentional instead of
            popping all layers on cold. CSS-driven to avoid per-frame
            state churn; pointer-events:none so it never intercepts
            hover / click on the canvas beneath. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(circle at 50% 50%, rgba(10,8,6,0) 0%, rgba(10,8,6,0.6) 60%, rgba(10,8,6,1) 100%)',
            opacity: revealed ? 0 : 1,
            transition: 'opacity 400ms cubic-bezier(0.22, 0.61, 0.36, 1)',
            zIndex: 2,
          }}
        />
        {/* Legend caption — bottom-right of each panel. Explains the
            two visual layers users are seeing so hovering specific
            Conway cells doesn't feel like a broken UI. Clicking
            opens a fuller explanation in the help overlay. Kept
            small + faint so it reads as a hint, not content.
            Without this, users correctly called out that hovering
            the discrete tiles felt broken ("hovering makes no sense
            no tooltips"). Now the caption proactively tells them
            which surfaces ARE interactive (glyphs) and which are
            ambient (the Conway tiles + RD biome). */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            padding: '4px 8px',
            background: 'rgba(10, 8, 6, 0.6)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 9,
            fontFamily: 'var(--mono)',
            color: 'var(--text-3)',
            lineHeight: 1.4,
            pointerEvents: 'none',
            maxWidth: 180,
            letterSpacing: '0.02em',
          }}
          aria-hidden="true"
        >
          Conway tiles + RD biome are ambient. Click a {scenarioLabels.person} glyph for drilldown.
        </div>
        <button
          type="button"
          onClick={() => setRosterOpen(v => !v)}
          aria-label={rosterOpen ? 'Close roster' : 'Open roster'}
          title={rosterOpen ? 'Close roster' : 'Open roster'}
          style={{
            position: 'absolute',
            top: 8,
            right: onToggleFocus ? 36 : 8,
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            background: 'var(--bg-panel)',
            color: rosterOpen ? 'var(--amber)' : 'var(--text-3)',
            border: `1px solid ${rosterOpen ? 'var(--amber)' : 'var(--border)'}`,
            borderRadius: 3,
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1,
            zIndex: 6,
          }}
        >
          {'\u2630'}
        </button>
        {onToggleFocus && (
          <button
            type="button"
            onClick={() => onToggleFocus(side)}
            aria-label={isFocused ? 'Restore split view' : 'Focus this panel'}
            title={isFocused ? 'Restore split view' : 'Focus this panel'}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              background: 'var(--bg-panel)',
              color: isFocused ? 'var(--amber)' : 'var(--text-3)',
              border: `1px solid ${isFocused ? 'var(--amber)' : 'var(--border)'}`,
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              lineHeight: 1,
              zIndex: 6,
            }}
          >
            {isFocused ? '\u2921' : '\u2922'}
          </button>
        )}
        <FeaturedSpotlight
          snapshot={snapshot}
          previousSnapshot={previousSnapshot}
          sideColor={resolveCssColor(sideColor, containerRef.current)}
          onSelect={c => {
            const pos = positions.get(c.agentId);
            if (pos) setPopover({ cell: c, x: pos.x, y: pos.y });
          }}
        />
        <RosterDrawer
          open={rosterOpen}
          cells={snapshot?.cells ?? []}
          leaderName={leaderName}
          sideColor={resolveCssColor(sideColor, containerRef.current)}
          searchQuery={searchQuery}
          hoveredId={hovered?.cell.agentId ?? siblingHoveredId ?? null}
          onHover={id => {
            if (id) {
              const c = snapshot?.cells.find(x => x.agentId === id);
              const pos = c ? positions.get(id) : null;
              if (c && pos) {
                setHovered({ cell: c, x: pos.x, y: pos.y });
                onHoverChange?.(id);
                return;
              }
            }
            setHovered(null);
            onHoverChange?.(null);
          }}
          onSelect={c => {
            const pos = positions.get(c.agentId);
            if (pos) setPopover({ cell: c, x: pos.x, y: pos.y });
          }}
          onClose={() => setRosterOpen(false)}
        />
        {mode === 'divergence' && snapshot && (divergedIds?.size ?? 0) === 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 16,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 4,
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                background: 'rgba(10, 8, 6, 0.85)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--text-3)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Both timelines identical this turn — no divergence yet
            </div>
          </div>
        )}
        {hovered && !popover && (() => {
          const ttW = 200;
          const ttH = 80;
          const margin = 8;
          const left = Math.min(
            Math.max(margin, hovered.x + 12),
            Math.max(margin, size.w - ttW - margin),
          );
          const top = Math.min(
            Math.max(margin, hovered.y - ttH - 8),
            Math.max(margin, size.h - ttH - margin),
          );
          return (
          <div
            style={{
              position: 'absolute',
              left,
              top,
              padding: '6px 10px',
              background: 'var(--bg-panel)',
              border: `1px solid ${sideColor}66`,
              borderRadius: 4,
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--text-2)',
              pointerEvents: 'none',
              zIndex: 5,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              maxWidth: ttW,
            }}
          >
            <div style={{ color: sideColor, fontWeight: 700, fontSize: 11 }}>
              {hovered.cell.name}
              {hovered.cell.featured && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 8,
                    padding: '1px 4px',
                    borderRadius: 2,
                    background: `${sideColor}33`,
                    color: sideColor,
                  }}
                >
                  FEATURED
                </span>
              )}
            </div>
            <div style={{ color: 'var(--text-3)', marginTop: 2 }}>
              {hovered.cell.department.toUpperCase()} · {hovered.cell.role}
              {typeof hovered.cell.age === 'number' ? ` · age ${hovered.cell.age}` : ''}
            </div>
            <div style={{ marginTop: 2 }}>
              mood: <span style={{ color: 'var(--text-2)' }}>{hovered.cell.mood}</span>
              {typeof hovered.cell.psychScore === 'number'
                ? ` · psych ${Math.round(hovered.cell.psychScore * 100)}%`
                : ''}
            </div>
            {snapshotHistory && snapshotHistory.length >= 2 && (() => {
              const sW = 140;
              const sH = 20;
              const pad = 2;
              const trail: number[] = [];
              for (const s of snapshotHistory) {
                const match = s.cells.find(c => c.agentId === hovered.cell.agentId);
                if (match && typeof match.psychScore === 'number') {
                  trail.push(Math.max(0, Math.min(1, match.psychScore)));
                }
              }
              if (trail.length < 2) return null;
              const stepX = (sW - pad * 2) / Math.max(1, trail.length - 1);
              const path = trail
                .map((v, i) => {
                  const x = pad + i * stepX;
                  const y = pad + (1 - v) * (sH - pad * 2);
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(' ');
              return (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 7, color: 'var(--text-4)', letterSpacing: '0.1em' }}>
                    PSYCH TRAJECTORY
                  </div>
                  <svg
                    viewBox={`0 0 ${sW} ${sH}`}
                    preserveAspectRatio="none"
                    style={{
                      display: 'block',
                      width: sW,
                      height: sH,
                      background: 'var(--bg-deep)',
                      borderRadius: 2,
                      marginTop: 2,
                    }}
                  >
                    <line
                      x1={pad}
                      x2={sW - pad}
                      y1={pad + (sH - pad * 2) / 2}
                      y2={pad + (sH - pad * 2) / 2}
                      stroke="var(--border)"
                      strokeWidth={0.4}
                      strokeDasharray="2 2"
                    />
                    <path d={path} fill="none" stroke={sideColor} strokeWidth={1} />
                    <circle
                      cx={pad + (trail.length - 1) * stepX}
                      cy={pad + (1 - trail[trail.length - 1]) * (sH - pad * 2)}
                      r={1.6}
                      fill={sideColor}
                    />
                  </svg>
                </div>
              );
            })()}
            <div style={{ marginTop: 3, fontSize: 8, color: 'var(--text-4)' }}>
              click for drilldown
            </div>
          </div>
          );
        })()}
        <ClickPopover
          payload={popover}
          containerW={size.w}
          containerH={size.h}
          sideColor={resolveCssColor(sideColor, containerRef.current)}
          hexacoById={hexacoById}
          snapshots={snapshotHistory}
          onClose={() => setPopover(null)}
          onOpenChat={onOpenChat}
        />
      </div>
    </div>
  );
}
