import type { CrisisInfo, Side } from '../../hooks/useGameState';

interface CrisisHeaderProps {
  side: Side;
  crisis: CrisisInfo | null;
}

/**
 * Single-line crisis header at the top of each leader's column. The full
 * crisis description appears in the EventCard list below; this header is
 * a compact ticker-style summary that ellipses when it doesn't fit.
 *
 * Native browser tooltip (title attribute) is the only hover affordance —
 * no floating popup, no scrollable overlay.
 */
export function CrisisHeader({ side, crisis }: CrisisHeaderProps) {
  if (!crisis) return null;

  const fullText = crisis.description || crisis.turnSummary || '';
  const titleAttr = [
    `T${crisis.turn}: ${crisis.title}`,
    `${crisis.category}${crisis.emergent ? ' · emergent' : ''}`,
    `Year ${crisis.year} · ${side === 'a' ? 'Leader A' : 'Leader B'}`,
    fullText,
  ].filter(Boolean).join('\n');

  return (
    <div
      title={titleAttr}
      style={{
        padding: '6px 12px', lineHeight: 1.5, fontSize: '13px', color: 'var(--text-1)',
        background: 'linear-gradient(135deg, rgba(224,101,48,.1), transparent)',
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
      }}
    >
      <span style={{ fontWeight: 800, color: 'var(--rust)', fontSize: '14px', flexShrink: 0 }}>
        T{crisis.turn}: {crisis.title}
      </span>
      <span style={{
        fontSize: '10px', color: 'var(--text-3)', background: 'var(--bg-deep)',
        padding: '1px 6px', borderRadius: '3px',
        fontFamily: 'var(--mono)', flexShrink: 0,
      }}>
        {crisis.category}
      </span>
      {crisis.emergent && (
        <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
          EMERGENT
        </span>
      )}
      {fullText && (
        <span style={{
          fontSize: '12px', color: 'var(--text-2)', fontStyle: 'italic',
          marginLeft: 4, minWidth: 0, flex: 1,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {fullText}
        </span>
      )}
    </div>
  );
}
