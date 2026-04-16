import type { CrisisInfo, Side } from '../../hooks/useGameState';
import { Tooltip } from '../shared/Tooltip';

interface CrisisHeaderProps {
  side: Side;
  crisis: CrisisInfo | null;
}

/**
 * Crisis header at the top of each leader's column.
 *
 * Layout: a two-line-clamped header bar. Label pills (T#, category,
 * EMERGENT) sit on the first line; the crisis description wraps to
 * line 2 and clamps there via `-webkit-line-clamp: 2`. Longer text
 * ellipses at the end of line 2. On hover, the popover surfaces the
 * full title, category, year, leader, and complete crisis description.
 *
 * Previously the whole bar was single-line with `whiteSpace: nowrap +
 * textOverflow: ellipsis`, which hid most of the crisis context unless
 * the user hovered. Two lines gives users the full arc of most crises
 * at a glance without needing to mouse over.
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
      {/* Container is now a vertical flex so label row (line 1) and
          description (line 2) stack. Dropped whiteSpace:nowrap +
          textOverflow:ellipsis from the outer container so children
          can control their own wrap behavior. */}
      <div style={{
        padding: '6px 12px', lineHeight: 1.4, fontSize: '13px', color: 'var(--text-1)',
        background: 'linear-gradient(135deg, rgba(224,101,48,.1), transparent)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, width: '100%',
      }}>
        {/* Line 1: label pills. Flex-row with wrap so on very narrow
            viewports the pills flow naturally instead of forcing a
            horizontal scroll. Keeps alignment tight via gap:6. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
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
        </div>
        {/* Line 2: description, clamped to 2 rendered lines with
            ellipsis on overflow. -webkit-line-clamp is well-supported
            across modern browsers and degrades to showing all lines
            unclamped on older ones (still better than single-line
            truncation). */}
        {fullText && (
          <span style={{
            fontSize: '12px', color: 'var(--text-2)', fontStyle: 'italic',
            minWidth: 0,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            lineHeight: 1.45,
            // wordBreak helps gracefully break long unbroken strings
            // (URLs, agent IDs) without overflowing horizontally.
            wordBreak: 'break-word',
          }}>
            {fullText}
          </span>
        )}
      </div>
    </Tooltip>
  );
}
