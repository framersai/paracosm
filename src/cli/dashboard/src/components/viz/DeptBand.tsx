import type { LayoutTile } from './viz-types.js';
import { Tile } from './Tile.js';

interface DeptBandProps {
  label: string;
  tiles: LayoutTile[];
  selectedId: string | null;
  divergedIds: Set<string> | undefined;
  onSelect: (agentId: string) => void;
}

/**
 * Horizontal band with a text label, count, and row of small tiles.
 * In families mode bands only hold unpartnered colonists; in
 * departments / mood / age modes they hold everyone alive under the
 * chosen bucket key.
 */
export function DeptBand({ label, tiles, selectedId, divergedIds, onSelect }: DeptBandProps) {
  if (tiles.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={`${label}, ${tiles.length} colonists`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
    >
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'var(--text-3)',
        minWidth: 60,
      }}>
        {label.toUpperCase()} {tiles.length}
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {tiles.map(t => (
          <Tile
            key={t.agentId}
            tile={t}
            selected={selectedId === t.agentId}
            diverged={divergedIds?.has(t.agentId)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
