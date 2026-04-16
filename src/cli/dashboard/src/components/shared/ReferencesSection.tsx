import type { CitationRegistry } from '../../hooks/useCitationRegistry';

interface ReferencesSectionProps {
  registry: CitationRegistry;
  /** Optional title override — defaults to "References". */
  title?: string;
  /** When true, render as a collapsible details element. */
  collapsible?: boolean;
}

/**
 * Numbered references list rendered at the bottom of a report or sim flow.
 * Each entry's number matches the inline `[N]` pill rendered in dept_done
 * citation rows. Departments that referenced each source are listed for
 * provenance.
 */
export function ReferencesSection({ registry, title = 'References', collapsible = false }: ReferencesSectionProps) {
  if (registry.list.length === 0) return null;

  const inner = (
    <ol style={{
      margin: 0, padding: 0, listStyle: 'none',
      // Two-column layout matches the side-by-side leader columns above.
      // Drops to one column on narrow screens.
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
      gap: 6,
    }}>
      {registry.list.map(entry => {
        const depts = [...entry.departments].join(', ');
        const sidesLabel = entry.sides.size === 2 ? 'A · B' : entry.sides.has('a') ? 'A' : 'B';
        return (
          <li
            key={entry.n}
            id={`cite-${entry.n}`}
            style={{
              display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8,
              fontSize: 12, lineHeight: 1.55,
              padding: '6px 8px', borderRadius: 4,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
            }}
          >
            <span style={{
              fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--amber)',
              textAlign: 'right',
            }}>
              [{entry.n}]
            </span>
            <span>
              {entry.url ? (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-1)', textDecoration: 'underline', textUnderlineOffset: 2 }}
                >
                  {entry.text}
                </a>
              ) : (
                <span style={{ color: 'var(--text-1)' }}>{entry.text}</span>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                {entry.doi && <>DOI:{entry.doi} · </>}
                {depts && <>cited by {depts} · </>}
                <span title="Which leader's run referenced this source">leader {sidesLabel}</span>
              </div>
            </span>
          </li>
        );
      })}
    </ol>
  );

  const header = (
    <h3 style={{
      fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800,
      color: 'var(--amber)', letterSpacing: '0.06em',
      margin: '0 0 8px', textTransform: 'uppercase',
    }}>
      {title} · {registry.list.length}
    </h3>
  );

  if (collapsible) {
    return (
      <details style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)' }}>
        <summary style={{
          fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800,
          color: 'var(--amber)', letterSpacing: '0.06em',
          cursor: 'pointer', textTransform: 'uppercase', marginBottom: 8,
        }}>
          {title} · {registry.list.length}
        </summary>
        {inner}
      </details>
    );
  }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)' }}>
      {header}
      {inner}
    </div>
  );
}
