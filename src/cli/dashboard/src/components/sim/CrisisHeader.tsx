import type { CrisisInfo, Side } from '../../hooks/useGameState';
import { Tooltip } from '../shared/Tooltip';

interface CrisisHeaderProps {
  side: Side;
  crisis: CrisisInfo | null;
}

/**
 * Single-line crisis header at the top of each leader's column.
 *
 * The bar itself ellipses with `whiteSpace:nowrap + textOverflow:ellipsis`
 * (no horizontal scrollbar, no wrapped lines). On hover, a popover surfaces
 * the full title, category, year, leader, and crisis description. The
 * popover sizes naturally to content — no internal scrollbar.
 */
export function CrisisHeader({ side, crisis }: CrisisHeaderProps) {
  if (!crisis) return null;

  const fullText = crisis.description || crisis.turnSummary || '';

  const popover = (
    <div>
      <b style={{ color: 'var(--rust)', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
        T{crisis.turn}: {crisis.title}
      </b>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '10px', padding: '1px 6px', borderRadius: '3px',
          background: 'var(--bg-deep)', color: 'var(--text-3)', fontFamily: 'var(--mono)',
        }}>
          {crisis.category}
        </span>
        {crisis.emergent && (
          <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)' }}>
            EMERGENT
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
          Year {crisis.year} &middot; {side === 'a' ? 'Leader A' : 'Leader B'}
        </span>
      </div>
      {fullText && (
        <div style={{ fontSize: '13px', color: 'var(--text-1)', lineHeight: 1.7 }}>
          {fullText}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip content={popover} block>
      <div style={{
        padding: '6px 12px', lineHeight: 1.5, fontSize: '13px', color: 'var(--text-1)',
        background: 'linear-gradient(135deg, rgba(224,101,48,.1), transparent)',
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, width: '100%',
      }}>
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
    </Tooltip>
  );
}
