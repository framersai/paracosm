import type { TurnEventInfo } from '../../hooks/useGameState';
import { Tooltip } from '../shared/Tooltip';

interface TurnEventHeaderProps {
  leaderIndex: number;
  event: TurnEventInfo | null;
}

/**
 * Per-turn narrative event header at the top of each leader's column.
 * Scenario label `labels.eventNounSingular` controls what a user sees
 * (e.g. "crisis" for Mars, "incident" for a submarine sim) but the
 * internal contract is generic: `TurnEventInfo`.
 *
 * Layout: two-line-clamped header bar. Label pills (T#, category,
 * EMERGENT) on line 1; description clamps to line 2 via
 * `-webkit-line-clamp: 2`. Hover popover shows the full context.
 */
export function TurnEventHeader({ leaderIndex, event }: TurnEventHeaderProps) {
  if (!event) return null;

  const fullText = event.description || event.turnSummary || '';

  const popover = (
    <div>
      <b style={{ color: 'var(--rust)', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
        T{event.turn}: {event.title}
      </b>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '10px', padding: '1px 6px', borderRadius: '3px',
          background: 'var(--bg-deep)', color: 'var(--text-3)', fontFamily: 'var(--mono)',
        }}>
          {event.category}
        </span>
        {event.emergent && (
          <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)' }}>
            EMERGENT
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
          Year {event.year} &middot; Leader {String.fromCharCode(65 + leaderIndex)}
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
        padding: '6px 12px', lineHeight: 1.4, fontSize: '13px', color: 'var(--text-1)',
        background: 'linear-gradient(135deg, rgba(224,101,48,.1), transparent)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontWeight: 800, color: 'var(--rust)', fontSize: '14px', flexShrink: 0 }}>
            T{event.turn}: {event.title}
          </span>
          <span style={{
            fontSize: '10px', color: 'var(--text-3)', background: 'var(--bg-deep)',
            padding: '1px 6px', borderRadius: '3px',
            fontFamily: 'var(--mono)', flexShrink: 0,
          }}>
            {event.category}
          </span>
          {event.emergent && (
            <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
              EMERGENT
            </span>
          )}
        </div>
        {fullText && (
          <span style={{
            fontSize: '12px', color: 'var(--text-2)', fontStyle: 'italic',
            minWidth: 0,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            lineHeight: 1.45,
            wordBreak: 'break-word',
          }}>
            {fullText}
          </span>
        )}
      </div>
    </Tooltip>
  );
}
