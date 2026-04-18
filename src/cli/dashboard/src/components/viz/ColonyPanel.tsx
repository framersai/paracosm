import { useMemo } from 'react';
import type { ClusterMode, TurnSnapshot } from './viz-types.js';
import { computeLayout } from './viz-layout.js';
import { Tile } from './Tile.js';
import { FamilyPod } from './FamilyPod.js';
import { DeptBand } from './DeptBand.js';
import { GhostLayer } from './GhostLayer.js';
import { AutomatonBand } from './automaton/AutomatonBand.js';
import type { AutomatonMode } from './automaton/shared.js';

interface HexacoShape { O: number; C: number; E: number; A: number; Em: number; HH: number }

/**
 * Compact metrics strip rendered at the top of every ColonyPanel. Gives
 * the user per-leader views of morale, mood mix, age distribution, and
 * family structure that complement the per-tile detail below. Both
 * panels always render this with matching structure so the two sides
 * remain visually symmetric even when their underlying rosters diverge.
 */
function ColonyMetricsStrip({ snapshot, sideColor }: { snapshot: TurnSnapshot; sideColor: string }) {
  const alive = snapshot.cells.filter(c => c.alive);
  const moodCounts = alive.reduce<Record<string, number>>((m, c) => {
    const key = c.mood || 'neutral';
    m[key] = (m[key] ?? 0) + 1;
    return m;
  }, {});
  const moodOrder = ['positive', 'hopeful', 'neutral', 'anxious', 'negative', 'defiant', 'resigned'];
  const moodColors: Record<string, string> = {
    positive: 'var(--green)',
    hopeful: '#9acd60',
    neutral: 'var(--text-4)',
    anxious: 'var(--amber)',
    negative: 'var(--rust)',
    defiant: '#c44a1e',
    resigned: 'var(--text-3)',
  };
  const totalMood = alive.length || 1;
  const ageBuckets = [0, 0, 0, 0]; // <20, 20-40, 40-60, 60+
  for (const c of alive) {
    const a = c.age ?? 30;
    if (a < 20) ageBuckets[0]++;
    else if (a < 40) ageBuckets[1]++;
    else if (a < 60) ageBuckets[2]++;
    else ageBuckets[3]++;
  }
  const ageMax = Math.max(1, ...ageBuckets);
  const partnered = alive.filter(c => !!c.partnerId).length;
  const earthBorn = alive.filter(c => (c.generation ?? 0) === 0).length;
  const morale = Math.round(snapshot.morale * 100);
  const moraleColor = morale >= 60 ? 'var(--green)' : morale >= 30 ? 'var(--amber)' : 'var(--rust)';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1.1fr 1fr auto',
      gap: 10, alignItems: 'stretch',
      padding: '8px 10px', background: 'var(--bg-panel)',
      border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6,
      fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)',
    }}>
      {/* Morale + food + deaths column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 90 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ letterSpacing: '0.5px', fontWeight: 700 }}>MORALE</span>
          <span style={{ color: moraleColor, fontWeight: 800, fontSize: 13 }}>{morale}%</span>
        </div>
        <div style={{ height: 4, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(2, morale)}%`, height: '100%', background: moraleColor }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>FOOD</span>
          <span style={{ color: 'var(--text-2)' }}>{snapshot.foodReserve.toFixed(1)}mo</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>DEATHS</span>
          <span style={{ color: 'var(--rust)' }}>{snapshot.deaths}</span>
        </div>
      </div>
      {/* Mood distribution column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ letterSpacing: '0.5px', fontWeight: 700 }}>MOOD MIX</span>
          <span style={{ color: 'var(--text-2)' }}>{alive.length} alive</span>
        </div>
        {alive.length === 0 ? (
          <div style={{ fontSize: 9, color: 'var(--text-4)' }}>no survivors</div>
        ) : (
          <>
            <div style={{ display: 'flex', height: 8, borderRadius: 2, overflow: 'hidden', background: 'var(--bg-deep)' }}>
              {moodOrder.map(m => {
                const c = moodCounts[m] || 0;
                if (c === 0) return null;
                const pct = (c / totalMood) * 100;
                return <div key={m} title={`${m}: ${c}`} style={{ width: `${pct}%`, background: moodColors[m] || 'var(--text-4)' }} />;
              })}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {moodOrder
                .filter(m => (moodCounts[m] || 0) > 0)
                .map(m => `${Math.round(((moodCounts[m] || 0) / totalMood) * 100)}% ${m}`)
                .slice(0, 3)
                .join(' · ')}
            </div>
          </>
        )}
      </div>
      {/* Age histogram column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ letterSpacing: '0.5px', fontWeight: 700 }}>AGE</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22 }}>
          {ageBuckets.map((n, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
              <div title={`${['<20', '20-40', '40-60', '60+'][i]}: ${n} colonists`} style={{
                width: '100%', height: `${(n / ageMax) * 100}%`,
                minHeight: n > 0 ? 2 : 0,
                background: n > 0 ? sideColor : 'transparent',
                borderRadius: '2px 2px 0 0', opacity: 0.85,
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-4)' }}>
          <span>{'<20'}</span>
          <span>20</span>
          <span>40</span>
          <span>60+</span>
        </div>
      </div>
      {/* Family + generation column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 80 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ letterSpacing: '0.5px', fontWeight: 700 }}>PAIRED</span>
          <span style={{ color: 'var(--text-2)' }}>{partnered}/{alive.length}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>EARTH</span>
          <span style={{ color: 'var(--text-2)' }}>{earthBorn}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>NATIVE</span>
          <span style={{ color: sideColor, fontWeight: 700 }}>{alive.length - earthBorn}</span>
        </div>
      </div>
    </div>
  );
}

interface ColonyPanelProps {
  snapshot: TurnSnapshot | undefined;
  leaderName: string;
  leaderArchetype: string;
  /** Settlement the leader commands (e.g. "Colony Alpha"). Empty
   *  when state.leader is null and no preset fallback resolved. */
  leaderColony?: string;
  /** Full bio/instructions string from the leader config. Rendered
   *  as a collapsible bio block so the Viz tab shows who is leading
   *  each colony without hiding the personality behind a tooltip. */
  leaderBio?: string;
  /** Panel accent color. Matches the leader's side color so the
   *  header rule, age histogram, and counters tint consistently. */
  sideColor: string;
  mode: ClusterMode;
  selectedId: string | null;
  divergedIds: Set<string> | undefined;
  onSelect: (agentId: string) => void;
  /** Side indicator so the automaton band knows which column it is. */
  side: 'a' | 'b';
  /** HEXACO profiles keyed by agent id. Drives per-cell empathy gating
   *  in the mood propagation automaton. */
  hexacoById?: Map<string, HexacoShape>;
  /** Shared automaton mode. Lifted to ColonyViz so both leader panels
   *  always render the same lens. */
  automatonMode: AutomatonMode;
  /** Shared collapsed flag. Same lifting rationale. */
  automatonCollapsed: boolean;
  onAutomatonModeChange: (mode: AutomatonMode) => void;
  onAutomatonCollapseToggle: () => void;
  /** Forge automaton inputs derived from the SSE event ledger. */
  forgeAttempts?: Array<{ turn: number; eventIndex: number; department: string; name: string; approved: boolean; confidence?: number }>;
  reuseCalls?: Array<{ turn: number; originDept: string; callingDept: string; name: string }>;
  /** Department ids from the scenario — used by the ecology hex grid. */
  scenarioDepartments?: string[];
  /** When true, the automaton band fills the panel and tile sections
   *  hide. Lifted to ColonyViz so both sides maximize together. */
  automatonMaximized?: boolean;
  onAutomatonMaximizedChange?: (next: boolean) => void;
  /**
   * Non-zero when this side's latest snapshot is older than the other
   * leader's (e.g. the other side finished turn 5 but this side is
   * still processing turn 4). Rendered as a subtle "T4 · lagging" hint
   * in the header so viewers understand why the two grids may show
   * different turn numbers momentarily.
   */
  lagTurns?: number;
}

/**
 * One leader's column: header, featured row, family pod cluster, dept
 * bands, ghost layer. Uses the pure layout function so identical
 * snapshots render identically across turn scrubs.
 */
export function ColonyPanel(props: ColonyPanelProps) {
  const {
    snapshot, leaderName, leaderArchetype, leaderColony = '', leaderBio = '',
    sideColor, mode, selectedId, divergedIds, onSelect, lagTurns = 0,
    side, hexacoById, automatonMode, automatonCollapsed,
    onAutomatonModeChange, onAutomatonCollapseToggle,
    forgeAttempts, reuseCalls, scenarioDepartments,
    automatonMaximized, onAutomatonMaximizedChange,
  } = props;

  const layout = useMemo(
    () => (snapshot ? computeLayout(snapshot, mode) : null),
    [snapshot, mode],
  );

  if (!layout || !snapshot) {
    return (
      <div style={{ flex: 1, padding: 12, color: 'var(--text-3)', fontSize: 12 }}>
        No snapshot yet for {leaderName}.
      </div>
    );
  }

  // Section wrapper that always renders, emitting a subtle "(empty)"
  // placeholder when there's nothing to show for that axis. Keeps the
  // two leader panels visually symmetric across the run: a commander
  // whose roster has no featured colonists this turn still sees the
  // FEATURED header taking up the same vertical space the other side's
  // populated section occupies.
  const sectionHeader = (label: string, count: number) => (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '2px 4px', borderBottom: '1px solid var(--border)',
      fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em',
      color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase',
    }}>
      <span>{label}</span>
      <span style={{ color: count > 0 ? sideColor : 'var(--text-4)' }}>{count}</span>
    </div>
  );
  const emptySlot = (label: string) => (
    <div style={{ fontSize: 9, color: 'var(--text-4)', fontStyle: 'italic', padding: '4px 6px' }}>
      no {label} this turn
    </div>
  );

  // Trim the "You are X, ..." preamble + HEXACO boilerplate that
  // usually prefixes the instructions string so the bio reads as a
  // short personality statement rather than a prompt fragment.
  const bioClean = leaderBio
    .replace(/^You are [^.]+\.\s*/i, '')
    .replace(/^"[^"]+"\.\s*/i, '')
    .replace(/Your HEXACO profile drives your leadership.*$/i, '')
    .trim();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 8, minWidth: 0, overflow: 'auto' }}>
      <div style={{ paddingBottom: 6, borderBottom: `1px solid ${sideColor}33` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: sideColor, letterSpacing: '0.02em' }}>{leaderName}</span>
            {leaderArchetype && (
              <span style={{
                fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
                padding: '2px 7px', borderRadius: 3, letterSpacing: '0.08em',
                color: sideColor, background: `${sideColor}18`, border: `1px solid ${sideColor}55`,
                textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>
                {leaderArchetype.replace(/^The\s+/i, '')}
              </span>
            )}
            {leaderColony && (
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                {leaderColony}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span>T{snapshot.turn}</span>
            <span>Pop {snapshot.population}</span>
            {lagTurns > 0 && (
              <span style={{ color: 'var(--amber)', fontStyle: 'italic' }} title={`This side is ${lagTurns} turn${lagTurns === 1 ? '' : 's'} behind; showing most recent snapshot`}>
                lagging {lagTurns}
              </span>
            )}
          </div>
        </div>
        {bioClean && (
          <div
            title={bioClean}
            style={{
              fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic',
              marginTop: 4, lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {bioClean}
          </div>
        )}
      </div>

      <ColonyMetricsStrip snapshot={snapshot} sideColor={sideColor} />

      <AutomatonBand
        snapshot={snapshot}
        hexacoById={hexacoById}
        side={side}
        sideColor={sideColor}
        mode={automatonMode}
        collapsed={automatonCollapsed}
        onModeChange={onAutomatonModeChange}
        onCollapseToggle={onAutomatonCollapseToggle}
        eventCategories={snapshot.eventCategories}
        eventIntensity={snapshot.deaths > 0 ? 0.75 : 0.45}
        forgeAttempts={forgeAttempts}
        reuseCalls={reuseCalls}
        scenarioDepartments={scenarioDepartments}
        onSelectAgent={onSelect}
        maximized={automatonMaximized}
        onMaximizedChange={onAutomatonMaximizedChange}
      />

      {/* Tile sections hide entirely when the automaton is maximized so
          the canvas can fill the full panel height. */}
      {!automatonMaximized && (
        <>

      <div>
        {sectionHeader('Featured', layout.featured.length)}
        {layout.featured.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 0' }}>
            {layout.featured.map(t => (
              <Tile
                key={t.agentId}
                tile={t}
                selected={selectedId === t.agentId}
                diverged={divergedIds?.has(t.agentId)}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : emptySlot('featured colonists')}
      </div>

      <div>
        {sectionHeader('Family Pods', layout.pods.length)}
        {layout.pods.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 0' }}>
            {layout.pods.map(pod => (
              <FamilyPod
                key={pod.id}
                pod={pod}
                selectedId={selectedId}
                divergedIds={divergedIds}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : emptySlot('family pods')}
      </div>

      <div>
        {sectionHeader('Departments', Object.keys(layout.deptBands).length)}
        {Object.keys(layout.deptBands).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0' }}>
            {Object.entries(layout.deptBands).map(([key, tiles]) => (
              <DeptBand
                key={key}
                label={key}
                tiles={tiles}
                selectedId={selectedId}
                divergedIds={divergedIds}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : emptySlot('department clusters')}
      </div>

      <details style={{ border: 'none' }}>
        <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
          {sectionHeader('Deceased (click to expand)', layout.ghosts.length)}
        </summary>
        {layout.ghosts.length > 0 ? (
          <div style={{ paddingTop: 6 }}>
            <GhostLayer ghosts={layout.ghosts} selectedId={selectedId} onSelect={onSelect} />
          </div>
        ) : emptySlot('deceased colonists')}
      </details>
        </>
      )}
    </div>
  );
}
