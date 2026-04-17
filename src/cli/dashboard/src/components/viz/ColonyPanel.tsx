import { useMemo } from 'react';
import type { ClusterMode, TurnSnapshot } from './viz-types.js';
import { computeLayout } from './viz-layout.js';
import { Tile } from './Tile.js';
import { FamilyPod } from './FamilyPod.js';
import { DeptBand } from './DeptBand.js';
import { GhostLayer } from './GhostLayer.js';

interface ColonyPanelProps {
  snapshot: TurnSnapshot | undefined;
  leaderName: string;
  leaderArchetype: string;
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
  const { snapshot, leaderName, leaderArchetype, mode, selectedId, divergedIds, onSelect, lagTurns = 0 } = props;

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
          <span>Morale {Math.round(snapshot.morale * 100)}%</span>
          {lagTurns > 0 && (
            <span style={{ color: 'var(--amber)', fontStyle: 'italic' }} title={`This side is ${lagTurns} turn${lagTurns === 1 ? '' : 's'} behind; showing most recent snapshot`}>
              lagging {lagTurns}
            </span>
          )}
        </div>
      </div>
      {layout.featured.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
      )}
      {layout.pods.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
      <GhostLayer ghosts={layout.ghosts} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
