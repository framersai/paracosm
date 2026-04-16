import { useCitationContext } from '../../hooks/useCitationRegistry';

interface CitationPillsProps {
  citations: Array<{ text?: string; url?: string; doi?: string }>;
  /** Override the leading label. Empty string hides the label. */
  label?: string;
}

/**
 * Compact `[1] [2] [3]` numbered pills replacing verbose inline citation
 * lists. Each pill is a clickable link that scrolls to the matching
 * `#cite-N` entry in the References section, and hover reveals the full
 * source on the title attribute.
 *
 * If no citations resolve to registry numbers, renders nothing.
 */
export function CitationPills({ citations, label = 'sources' }: CitationPillsProps) {
  const registry = useCitationContext();
  if (!citations || citations.length === 0) return null;

  // Resolve to unique registry numbers, preserving first-seen order
  const seen = new Set<number>();
  const numbered: Array<{ n: number; entry: { text: string; url: string; doi?: string } }> = [];
  for (const c of citations) {
    const url = (c.url || '').trim();
    const text = (c.text || '').trim();
    if (!url && !text) continue;
    if (!url && text === 'Seed document') continue;
    const lookup = url || text;
    const n = registry.getNumber(lookup);
    if (n === 0 || seen.has(n)) continue;
    seen.add(n);
    const entry = registry.getEntry(lookup);
    numbered.push({
      n,
      entry: entry ?? { text: text || url, url, doi: c.doi },
    });
  }

  if (numbered.length === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      gap: 4, marginTop: 6, paddingTop: 6,
      borderTop: '1px solid var(--border)',
    }}>
      {label && (
        <span style={{
          fontSize: 9, fontWeight: 800, fontFamily: 'var(--mono)',
          color: 'var(--text-3)', letterSpacing: '0.06em',
          textTransform: 'uppercase', marginRight: 4,
        }}>
          {label}
        </span>
      )}
      {numbered.map(({ n, entry }) => {
        const tooltip = `${entry.text}${entry.doi ? ` (DOI:${entry.doi})` : ''}${entry.url ? `\n${entry.url}` : ''}`;
        return (
          <a
            key={n}
            href={entry.url || `#cite-${n}`}
            target={entry.url ? '_blank' : undefined}
            rel={entry.url ? 'noopener noreferrer' : undefined}
            title={tooltip}
            onClick={(e) => {
              // Always also scroll to the references section, even when the
              // pill opens the URL in a new tab.
              const ref = document.getElementById(`cite-${n}`);
              if (ref) {
                if (!entry.url) e.preventDefault();
                ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
                ref.style.transition = 'background 0.4s';
                ref.style.background = 'rgba(232,180,74,0.18)';
                setTimeout(() => { ref.style.background = ''; }, 1200);
              }
            }}
            style={{
              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
              color: 'var(--amber)', textDecoration: 'none',
              padding: '1px 6px', borderRadius: 3,
              border: '1px solid rgba(232,180,74,0.35)',
              background: 'rgba(232,180,74,0.06)',
              lineHeight: 1.4, whiteSpace: 'nowrap',
            }}
          >
            [{n}]
          </a>
        );
      })}
    </div>
  );
}
