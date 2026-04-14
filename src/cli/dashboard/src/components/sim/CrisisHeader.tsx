import type { CrisisInfo, Side } from '../../hooks/useGameState';

interface CrisisHeaderProps {
  side: Side;
  crisis: CrisisInfo | null;
}

export function CrisisHeader({ side, crisis }: CrisisHeaderProps) {
  if (!crisis) return null;

  return (
    <div style={{
      padding: '6px 12px', lineHeight: 1.5, fontSize: '13px', color: 'var(--text-1)',
      background: 'linear-gradient(135deg, rgba(224,101,48,.1), transparent)',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontWeight: 800, color: 'var(--rust)', fontSize: '14px' }}>
        T{crisis.turn}: {crisis.title}
      </span>
      <span style={{
        fontSize: '10px', color: 'var(--text-3)', background: 'var(--bg-deep)',
        padding: '1px 6px', borderRadius: '3px', marginLeft: '6px',
        fontFamily: 'var(--mono)', verticalAlign: 'middle',
      }}>
        {crisis.category}
      </span>
      {crisis.emergent && (
        <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', marginLeft: '6px', fontFamily: 'var(--mono)' }}>
          EMERGENT
        </span>
      )}
      {/* Full crisis description, not just the summary */}
      {crisis.description && (
        <span style={{ fontSize: '12px', color: 'var(--text-2)', fontStyle: 'italic', marginLeft: '8px' }}>
          {crisis.description}
        </span>
      )}
      {!crisis.description && crisis.turnSummary && (
        <span style={{ fontSize: '12px', color: 'var(--text-2)', fontStyle: 'italic', marginLeft: '8px' }}>
          {crisis.turnSummary}
        </span>
      )}
    </div>
  );
}
