import { useState, useRef, useCallback, type ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** Show a small amber dot indicator that this element has a tooltip */
  dot?: boolean;
}

export function Tooltip({ content, children, dot }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((e: React.MouseEvent) => {
    clearTimeout(timer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Position below and to the right, clamped to viewport
    let x = rect.left;
    let y = rect.bottom + 6;
    if (x + 380 > window.innerWidth) x = window.innerWidth - 390;
    if (x < 10) x = 10;
    if (y + 200 > window.innerHeight) y = rect.top - 6; // flip above
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
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
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
          style={{
            position: 'fixed', left: pos.x, top: pos.y, zIndex: 99999,
            background: 'var(--bg-card)', border: '2px solid var(--amber)', borderRadius: '8px',
            padding: '14px 18px', fontSize: '12px', color: 'var(--text-1)', lineHeight: 1.6,
            width: '380px', maxWidth: '90vw', maxHeight: '70vh', overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,.4)', pointerEvents: 'none',
            whiteSpace: 'normal',
            animation: 'fadeUp 0.15s ease both',
          }}
        >
          {content}
        </div>
      )}
    </span>
  );
}
