import { useMemo } from 'react';
import type { ClusterMode, TurnSnapshot } from './viz-types.js';
import { computeLayout } from './viz-layout.js';
import { Tile } from './Tile.js';
import { FamilyPod } from './FamilyPod.js';
import { DeptBand } from './DeptBand.js';
import { GhostLayer } from './GhostLayer.js';

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
  /** Panel accent color. Matches the leader's side color so the
   *  header rule, age histogram, and counters tint consistently. */
  sideColor: string;
  mode: ClusterMode;
  selectedId: string | null;
  divergedIds: Set<string> | undefined;
  onSelect: (agentId: string) => void;
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
  const { snapshot, leaderName, leaderArchetype, sideColor, mode, selectedId, divergedIds, onSelect, lagTurns = 0 } = props;

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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 8, minWidth: 0, overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{leaderName}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{leaderArchetype}</div>
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

      <ColonyMetricsStrip snapshot={snapshot} sideColor={sideColor} />

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

      <div>
        {sectionHeader('Deceased', layout.ghosts.length)}
        {layout.ghosts.length > 0 ? (
          <GhostLayer ghosts={layout.ghosts} selectedId={selectedId} onSelect={onSelect} />
        ) : emptySlot('deceased colonists')}
      </div>
    </div>
  );
}
