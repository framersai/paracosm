import type { TurnSnapshot } from '../viz-types.js';
import { useMediaQuery, NARROW_QUERY } from './useMediaQuery.js';
import { DeptDonut } from './DeptDonut.js';

/**
 * Full colony metrics strip rendered above the living grid. Same
 * morale bar + mood-mix histogram + age distribution + family counts
 * the legacy SwarmPanel exposed — kept as a standalone component so
 * both viz modes render it consistently. Collapses to 2 columns on
 * narrow screens so nothing overflows on phone widths.
 */
export function GridMetricsStrip({
  snapshot,
  sideColor,
}: {
  snapshot: TurnSnapshot;
  sideColor: string;
}) {
  const narrow = useMediaQuery(NARROW_QUERY);
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
  const ageBuckets = [0, 0, 0, 0];
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
  const moraleColor =
    morale >= 60 ? 'var(--green)' : morale >= 30 ? 'var(--amber)' : 'var(--rust)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: narrow ? '1fr 1fr' : 'auto 1.1fr 1fr auto auto',
        gap: narrow ? 8 : 10,
        alignItems: 'stretch',
        padding: '8px 10px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'var(--text-3)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 90 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ letterSpacing: '0.5px', fontWeight: 700 }}>MORALE</span>
          <span style={{ color: moraleColor, fontWeight: 800, fontSize: 13 }}>{morale}%</span>
        </div>
        <div
          style={{
            height: 4,
            background: 'var(--bg-deep)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.max(2, morale)}%`,
              height: '100%',
              background: moraleColor,
              transition: 'width 500ms cubic-bezier(0.2, 0.9, 0.3, 1), background 400ms ease',
            }}
          />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ letterSpacing: '0.5px', fontWeight: 700 }}>MOOD MIX</span>
          <span style={{ color: 'var(--text-2)' }}>{alive.length} alive</span>
        </div>
        {alive.length === 0 ? (
          <div style={{ fontSize: 9, color: 'var(--text-4)' }}>no survivors</div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                height: 8,
                borderRadius: 2,
                overflow: 'hidden',
                background: 'var(--bg-deep)',
              }}
            >
              {moodOrder.map(m => {
                const c = moodCounts[m] || 0;
                if (c === 0) return null;
                const pct = (c / totalMood) * 100;
                return (
                  <div
                    key={m}
                    title={`${m}: ${c}`}
                    style={{
                      width: `${pct}%`,
                      background: moodColors[m] || 'var(--text-4)',
                      transition:
                        'width 500ms cubic-bezier(0.2, 0.9, 0.3, 1)',
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                fontSize: 9,
                color: 'var(--text-3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {moodOrder
                .filter(m => (moodCounts[m] || 0) > 0)
                .map(m => `${Math.round(((moodCounts[m] || 0) / totalMood) * 100)}% ${m}`)
                .slice(0, 3)
                .join(' · ')}
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ letterSpacing: '0.5px', fontWeight: 700 }}>AGE</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22 }}>
          {ageBuckets.map((n, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                minWidth: 0,
              }}
            >
              <div
                title={`${['<20', '20-40', '40-60', '60+'][i]}: ${n} colonists`}
                style={{
                  width: '100%',
                  height: `${(n / ageMax) * 100}%`,
                  minHeight: n > 0 ? 2 : 0,
                  background: n > 0 ? sideColor : 'transparent',
                  borderRadius: '2px 2px 0 0',
                  opacity: 0.85,
                  transition: 'height 500ms cubic-bezier(0.2, 0.9, 0.3, 1)',
                }}
              />
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 8,
            color: 'var(--text-4)',
          }}
        >
          <span>{'<20'}</span>
          <span>20</span>
          <span>40</span>
          <span>60+</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 80 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ letterSpacing: '0.5px', fontWeight: 700 }}>PAIRED</span>
          <span style={{ color: 'var(--text-2)' }}>
            {partnered}/{alive.length}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>EARTH</span>
          <span style={{ color: 'var(--text-2)' }}>{earthBorn}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>NATIVE</span>
          <span style={{ color: sideColor, fontWeight: 700 }}>
            {alive.length - earthBorn}
          </span>
        </div>
      </div>
      {!narrow && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
          aria-label="Department breakdown"
        >
          <DeptDonut cells={snapshot.cells} size={44} />
          <span
            style={{
              fontSize: 8,
              color: 'var(--text-4)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Depts
          </span>
        </div>
      )}
    </div>
  );
}
