import { useCitationContext, type CitationEntry } from '../../hooks/useCitationRegistry';
import { Tooltip } from './Tooltip';

interface CitationPillsProps {
  citations: Array<{ text?: string; url?: string; doi?: string }>;
  /** Override the leading label. Empty string hides the label. */
  label?: string;
  /** When true, no top border / padding — for use inline within a header. */
  inline?: boolean;
}

/**
 * Compact `[1] [2] [3]` numbered pills replacing verbose inline citation
 * lists. Each pill is wrapped in a Tooltip showing the full claim, source,
 * DOI, and URL on hover. Click opens the URL (or scrolls to the matching
 * `#cite-N` entry in the References section when no URL is available).
 *
 * If no citations resolve to registry numbers, renders nothing.
 */
export function CitationPills({ citations, label = 'sources', inline = false }: CitationPillsProps) {
  const registry = useCitationContext();
  if (!citations || citations.length === 0) return null;

  // Resolve to unique registry numbers, preserving first-seen order
  const seen = new Set<number>();
  const numbered: Array<{ n: number; entry: CitationEntry | { text: string; url: string; doi?: string } }> = [];
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
      display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap',
      gap: 4,
      marginTop: inline ? 0 : 6,
      paddingTop: inline ? 0 : 6,
      borderTop: inline ? 'none' : '1px solid var(--border)',
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
      {numbered.map(({ n, entry }) => (
        <CitationPill key={n} n={n} entry={entry} />
      ))}
    </div>
  );
}

function CitationPill({ n, entry }: { n: number; entry: CitationEntry | { text: string; url: string; doi?: string } }) {
  const url = entry.url || '';
  const text = entry.text || url || `Source [${n}]`;
  const doi = entry.doi;
  // Provenance fields exist only on registry entries; pills derived from
  // raw payloads still render basic info.
  const departments = (entry as CitationEntry).departments
    ? [...(entry as CitationEntry).departments]
    : [];
  const sides = (entry as CitationEntry).sides
    ? [...(entry as CitationEntry).sides]
    : [];

  const popover = (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 800,
        color: 'var(--amber)', letterSpacing: '0.06em', marginBottom: 4,
      }}>
        REFERENCE [{n}]
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5, marginBottom: 6 }}>
        {text}
      </div>
      {url && (
        <div style={{ fontSize: 11, marginBottom: 4 }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--teal)', wordBreak: 'break-all', textDecoration: 'underline' }}
          >
            {url}
          </a>
        </div>
      )}
      {doi && (
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
          DOI:{doi}
        </div>
      )}
      {(departments.length > 0 || sides.length > 0) && (
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          {departments.length > 0 && <>cited by {departments.join(', ')} · </>}
          {sides.length > 0 && <>leader {sides.length === 2 ? 'A · B' : sides[0].toUpperCase()}</>}
        </div>
      )}
      <div style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: 6, fontStyle: 'italic' }}>
        Click to open source · or scroll to References below
      </div>
    </div>
  );

  return (
    <Tooltip content={popover}>
      <a
        href={url || `#cite-${n}`}
        target={url ? '_blank' : undefined}
        rel={url ? 'noopener noreferrer' : undefined}
        onClick={(e) => {
          // Always scroll the matching reference into view, even when the
          // pill also opens a URL in a new tab.
          const ref = document.getElementById(`cite-${n}`);
          if (ref) {
            if (!url) e.preventDefault();
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
    </Tooltip>
  );
}
