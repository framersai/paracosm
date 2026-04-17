import { DEPARTMENT_COLORS } from './viz-types.js';

/**
 * Persistent legend strip explaining tile vocabulary. Replaces the
 * bottom-right legend block that previously listed the four modes
 * behind hidden key shortcuts.
 */
export function Legend() {
  const depts = Object.entries(DEPARTMENT_COLORS);
  return (
    <div
      role="complementary"
      aria-label="Legend"
      style={{
        display: 'flex', gap: 10, flexWrap: 'wrap',
        padding: '4px 12px',
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-3)',
      }}
    >
      <span>Dept:</span>
      {depts.map(([dept, color]) => (
        <span key={dept} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />
          {dept}
        </span>
      ))}
      <span>{'\u00b7'} ghost = deceased</span>
      <span>{'\u00b7'} pod = family</span>
      <span>{'\u00b7'} rust tint = diverged</span>
    </div>
  );
}
