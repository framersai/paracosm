/**
 * Right-rail sticky nav for the Reports tab. Collapses to a horizontal
 * sticky strip on widths below 1024px. IntersectionObserver drives the
 * active-item highlight based on which `<section id="...">` is most
 * visible in the scroll viewport.
 *
 * @module paracosm/dashboard/reports/ReportSideNav
 */
import { useEffect, useMemo, useState } from 'react';

export interface SideNavItem {
  id: string;
  label: string;
}

export interface ReportSideNavProps {
  items: SideNavItem[];
  /** Scroll container element whose scroll position drives the active id.
   *  When undefined, falls back to the window viewport. */
  scrollRoot?: HTMLElement | null;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

export function ReportSideNav(props: ReportSideNavProps) {
  const { items, scrollRoot } = props;
  const [activeId, setActiveId] = useState<string | undefined>(items[0]?.id);
  const desktop = useIsDesktop();

  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) return;
    const elements = items
      .map(i => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el != null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { root: scrollRoot ?? null, rootMargin: '-80px 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [items, scrollRoot]);

  const linkStyle = useMemo((): React.CSSProperties => ({
    display: 'block', padding: '4px 10px', fontSize: 11, fontFamily: 'var(--mono)',
    fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    color: 'var(--text-3)', textDecoration: 'none', borderRadius: 3,
  }), []);

  if (items.length === 0) return null;

  if (desktop) {
    return (
      <nav
        aria-label="Report sections"
        style={{
          position: 'sticky',
          top: 12,
          alignSelf: 'flex-start',
          width: 160,
          marginLeft: 12,
          padding: '10px 6px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
        }}
      >
        {items.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            style={{
              ...linkStyle,
              color: activeId === item.id ? 'var(--amber)' : 'var(--text-3)',
              background: activeId === item.id ? 'color-mix(in srgb, var(--bg-canvas) 80%, var(--amber) 20%)' : 'transparent',
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Report sections"
      style={{
        // Non-sticky: on narrow viewports the parent `.reports-layout`
        // flips to column-stacking and positions this nav ABOVE the
        // scrolling content div via CSS `order: -1`. Since the content
        // div is the scroll container, a sticky rule here has no
        // scrolling ancestor to stick against and would misbehave
        // (sitting at the top of the page scroll instead of the
        // reports viewport).
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        padding: '6px 8px',
        marginBottom: 12,
        overflowX: 'auto',
        display: 'flex',
        gap: 4,
        flexShrink: 0,
      }}
    >
      {items.map(item => (
        <a
          key={item.id}
          href={`#${item.id}`}
          style={{
            ...linkStyle,
            flexShrink: 0,
            color: activeId === item.id ? 'var(--amber)' : 'var(--text-3)',
            borderBottom: activeId === item.id ? '2px solid var(--amber)' : '2px solid transparent',
          }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
