import { useState, useRef, useCallback, type ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** Show a small amber dot indicator that this element has a tooltip */
  dot?: boolean;
  /** Render the wrapper as block-level so it fills its container (used by
   *  full-width row triggers like CrisisHeader where the inline-flex
   *  default would otherwise shrink-to-content). */
  block?: boolean;
}

export function Tooltip({ content, children, dot, block }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((e: React.MouseEvent) => {
    clearTimeout(timer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tooltipW = Math.min(380, window.innerWidth - 20);
    let x = rect.left;
    // Default: position ABOVE the element
    const tooltipHeight = 250;
    let y = rect.top - tooltipHeight - 6;
    // If no room above, flip below
    if (y < 10) y = rect.bottom + 6;
    // Clamp to viewport
    if (x + tooltipW > window.innerWidth - 10) x = window.innerWidth - tooltipW - 10;
    if (x < 10) x = 10;
    if (y + tooltipHeight > window.innerHeight - 10) y = window.innerHeight - tooltipHeight - 10;
    if (y < 10) y = 10;
    setPos({ x, y });
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timer.current = setTimeout(() => setVisible(false), 100);
  }, []);

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      style={{
        position: 'relative',
        display: block ? 'block' : 'inline-flex',
        alignItems: block ? undefined : 'center',
        width: block ? '100%' : undefined,
        minWidth: block ? 0 : undefined,
        cursor: 'pointer',
      }}
      role="button"
      tabIndex={0}
      aria-describedby={visible ? 'paracosm-tooltip' : undefined}
      onFocus={show as unknown as React.FocusEventHandler}
      onBlur={hide}
    >
      {children}
      {dot && (
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)',
          opacity: visible ? 0.8 : 0, marginLeft: '3px', transition: 'opacity 0.15s',
          flexShrink: 0, display: 'inline-block', verticalAlign: 'middle',
        }} aria-hidden="true" />
      )}
      {visible && (
        <div
          id="paracosm-tooltip"
          role="tooltip"
          onMouseEnter={() => { clearTimeout(timer.current); setVisible(true); }}
          onMouseLeave={hide}
          style={{
            position: 'fixed', left: pos.x, top: pos.y, zIndex: 99999,
            background: 'var(--bg-card)', border: '2px solid var(--amber)', borderRadius: '8px',
            padding: '14px 18px', fontSize: '12px', color: 'var(--text-1)', lineHeight: 1.6,
            width: '420px', maxWidth: '90vw',
            // No internal scrollbar — content sizes naturally and the
            // tooltip stays a single self-contained card.
            boxShadow: '0 8px 40px rgba(0,0,0,.4)', pointerEvents: 'auto',
            whiteSpace: 'normal', wordBreak: 'break-word',
            animation: 'fadeUp 0.15s ease both',
          }}
        >
          {content}
        </div>
      )}
    </span>
  );
}
