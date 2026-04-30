/**
 * Radial constellation layout for N actors. Each actor is a node on a
 * circle; every pair has an edge whose opacity = (1 - normalized
 * HEXACO distance), so close-personality pairs render bright and
 * divergent pairs fade. Click any node to drill into its full report.
 *
 * Pure SVG, no D3, no canvas. The position table + distance map are
 * memoized on actorIds.length so a 50-actor sim re-rendering at SSE
 * cadence stays under 16ms.
 *
 * @module paracosm/dashboard/sim/ConstellationView
 */
import * as React from 'react';
import styles from './ConstellationView.module.scss';
import { computeHexacoDistances } from './computeHexacoDistances.js';
import { getActorColorVar } from '../../hooks/useGameState.js';
import type { GameState } from '../../hooks/useGameState.js';

export interface ConstellationViewProps {
  state: GameState;
  onActorClick: (name: string) => void;
}

const NODE_RADIUS = 18;
const LABEL_MARGIN = 80;

/** Polar layout. Actor 0 sits at 12 o'clock; rest fan clockwise. */
function computePositions(actorCount: number): Array<{ cx: number; cy: number; angle: number }> {
  if (actorCount === 0) return [];
  const radius = Math.min(460, Math.max(120, 60 + 12 * actorCount));
  const center = radius + LABEL_MARGIN;
  const positions: Array<{ cx: number; cy: number; angle: number }> = [];
  for (let i = 0; i < actorCount; i += 1) {
    const angle = (i / Math.max(1, actorCount)) * 2 * Math.PI - Math.PI / 2;
    positions.push({
      cx: center + radius * Math.cos(angle),
      cy: center + radius * Math.sin(angle),
      angle,
    });
  }
  return positions;
}

function svgSize(actorCount: number): number {
  if (actorCount === 0) return 0;
  const radius = Math.min(460, Math.max(120, 60 + 12 * actorCount));
  return (radius + LABEL_MARGIN) * 2;
}

export function ConstellationView({ state, onActorClick }: ConstellationViewProps): JSX.Element {
  const actorIds = state.actorIds;

  const positions = React.useMemo(() => computePositions(actorIds.length), [actorIds.length]);

  const traits = React.useMemo(
    () => actorIds.map((id) => {
      const leader = state.actors[id]?.leader;
      return { name: id, hexaco: leader?.hexaco ?? {} };
    }),
    [actorIds, state.actors],
  );
  const traitsSig = traits.map((t) => `${t.name}:${Object.values(t.hexaco).join(',')}`).join('|');
  const distances = React.useMemo(() => computeHexacoDistances(traits), [traitsSig]);

  const pairLookup = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of distances.pairs) {
      m.set(`${p.a}|${p.b}`, p.normalized);
      m.set(`${p.b}|${p.a}`, p.normalized);
    }
    return m;
  }, [distances]);

  if (actorIds.length === 0) {
    return (
      <div className={styles.empty}>
        Constellation will appear when actors are launched.
      </div>
    );
  }

  const size = svgSize(actorIds.length);

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={`Constellation of ${actorIds.length} actors`}
      >
        {actorIds.map((idA, i) => actorIds.slice(i + 1).map((idB) => {
          const pa = positions[i];
          const pb = positions[actorIds.indexOf(idB)];
          if (!pa || !pb) return null;
          const norm = pairLookup.get(`${idA}|${idB}`) ?? 0;
          const opacity = Math.max(0.06, Math.min(0.95, 1 - norm));
          return (
            <line
              key={`${idA}|${idB}`}
              data-edge={`${idA}|${idB}`}
              className={styles.edge}
              x1={pa.cx}
              y1={pa.cy}
              x2={pb.cx}
              y2={pb.cy}
              strokeOpacity={opacity}
              strokeWidth={1.5}
            />
          );
        }))}

        {actorIds.map((id, i) => {
          const pos = positions[i];
          if (!pos) return null;
          const color = getActorColorVar(i);
          const leader = state.actors[id]?.leader;
          const archetype = leader?.archetype ?? '';
          const labelDistance = NODE_RADIUS + 14;
          const lx = pos.cx + Math.cos(pos.angle) * labelDistance;
          const ly = pos.cy + Math.sin(pos.angle) * labelDistance;
          const anchor = pos.angle > -Math.PI / 2 && pos.angle < Math.PI / 2 ? 'start' : 'end';
          return (
            <g key={id}>
              <circle
                data-actor={id}
                className={styles.node}
                cx={pos.cx}
                cy={pos.cy}
                r={NODE_RADIUS}
                fill={color}
                onClick={() => onActorClick(id)}
                onKeyDown={(e) => {
                  // Mirror native button semantics: Enter or Space
                  // activates the node. preventDefault stops Space
                  // from page-scrolling the SVG container.
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActorClick(id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Open report for ${id}`}
              >
                <title>{`${id}${archetype ? ` · ${archetype}` : ''}`}</title>
              </circle>
              <text
                className={styles.label}
                x={lx}
                y={ly}
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
