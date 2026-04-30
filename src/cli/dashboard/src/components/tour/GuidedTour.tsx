/**
 * GuidedTour — Scrimless walkthrough of the Paracosm dashboard.
 *
 * Highlights the target element with a pulsing amber outline.
 * No dark overlay — the full UI stays visible and alive.
 * A floating card annotates each highlighted section.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

export type TourTab = 'quickstart' | 'studio' | 'sim' | 'viz' | 'chat' | 'reports' | 'library' | 'settings';

export interface TourStep {
  target: string;
  tab: TourTab;
  title: string;
  description: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-quickstart-seed]',
    tab: 'quickstart',
    title: 'Quickstart — author from a brief',
    description: 'Paste a brief, drop a PDF, or supply a URL. Paracosm grounds the prompt with web research, generates three distinct actors with HEXACO personalities, and runs them against the same scenario in parallel. The Twin demo card below runs a single subject against a single intervention if that\'s your use case.',
  },
  {
    target: '[role="tablist"][aria-label="Studio sub-navigation"]',
    tab: 'studio',
    title: 'Studio — author + branches',
    description: 'Drop any saved Paracosm artifact or bundle here to inspect, fork, and re-run. The Branches sub-tab forks an actor at any turn N and re-runs from that checkpoint with a new HEXACO profile, so you can probe alternate histories from a shared starting state.',
  },
  {
    target: '.topbar',
    tab: 'sim',
    title: 'Top Bar',
    description: 'Scenario name on the left. RUN, status, theme toggle, and HOW IT WORKS (replay this tour) on the right. The T / Y / S tokens in the center show turn, in-sim time, and deterministic seed — hover each for what they mean. A "⋯" menu reveals Save / Copy / Clear once a run has started.',
  },
  {
    target: '.tab-bar',
    tab: 'sim',
    title: 'Navigation',
    description: 'Quickstart and Studio for authoring. Sim, Viz, Chat for the live run. Reports and Library for analysis. Settings holds config (Event Log lives there as a sub-tab). Labels collapse to icons below 900px so the row never wraps onto two lines.',
  },
  {
    target: '[role="group"][aria-label="Sim layout"]',
    tab: 'sim',
    title: 'Sim layout',
    description: 'Side-by-side for 2 actors, Constellation for 3+. Constellation auto-engages above 3 actors because two columns physically can\'t fit them. Click any node in the Constellation graph to drill into one actor\'s decisions, departments, and tools. The tour pins side-by-side so you can see leader cards and event streams as they\'d render for a 2-actor run.',
  },
  {
    target: '.leaders-row',
    tab: 'sim',
    title: 'Leader cards',
    description: 'Each actor renders with its name, archetype, HEXACO profile, and a population + morale sparkline. Left is amber, right is teal. Glyph color, Conway tiles, and chronicle pills downstream all pick up these same colors so you always know which side you\'re looking at.',
  },
  {
    target: '.sim-columns',
    tab: 'sim',
    title: 'Event streams',
    description: 'Each turn, both leaders face events the Director generated based on accumulated state. Departments analyze in parallel and may forge new tools. Commanders decide. Tools tint by side. Every forged tool card gets a "↗ LOG" button that jumps to the Event Log filtered to that tool.',
  },
  {
    target: '[aria-label="Divergence rail"]',
    tab: 'sim',
    title: 'Divergence rail',
    description: 'How far the actors have diverged at the current turn. Shows decision texts and outcomes side by side in plain language. Same seed, different histories — because HEXACO shaped every LLM call.',
  },
  {
    target: '.viz-content',
    tab: 'viz',
    title: 'Viz — living canvas',
    description: 'Mirrored canvases, one per actor. Conway-style cellular tiles render underneath to encode mood (BLOCK = calm, GLIDER = agitated) while colonist glyphs sit on top as the primary signal. Hover a tile or a glyph for a tooltip; click either to drill into the colonist. Use the mode pills (LIVING / MOOD / FORGE / ECOLOGY / DIVERGENCE) and event filters above the canvas to reshape the read.',
  },
  {
    target: '.chat-layout',
    tab: 'chat',
    title: 'Character chat',
    description: 'Talk to any colonist from the run. Each carries their HEXACO profile, the memories they formed during the sim, and their relationships. The Viz drilldown popover has a direct Chat handoff that preselects the colonist here.',
  },
  {
    target: '.reports-content',
    tab: 'reports',
    title: 'Reports',
    description: 'Turn-by-turn rollup: commander decisions, department analyses, forged toolbox across both sides, agent reactions, verdict comparison. Every forged tool has a "↗ LOG" button that scopes the Event Log sub-tab to just that tool\'s history.',
  },
  {
    target: '[role="group"][aria-label="View mode"]',
    tab: 'library',
    title: 'Library — saved runs',
    description: 'Every run you launch is saved here. Filter by scenario, leader configuration, or free-text search. Gallery view shows hero stats; Table view shows everything. Open any run to inspect, or promote it into Studio to fork a new branch.',
  },
  {
    target: '[role="tablist"][aria-label="Settings sub-navigation"]',
    tab: 'settings',
    title: 'Settings + event log',
    description: 'Configure actors with HEXACO sliders, pick a scenario, set turns and population, and drop in your own OpenAI or Anthropic key to bypass the hosted-demo caps. The Event Log sub-tab shows the raw SSE stream (status, turn_start, specialist_done, decision_made, outcome, reaction, forge_attempt) and is what the "↗ LOG" buttons elsewhere link into.',
  },
  {
    target: '.topbar',
    tab: 'sim',
    title: 'Ready to launch',
    description: 'That was demo data. Hit RUN in the top bar to launch a live simulation against the host caps, or paste your own API key in Settings for full-scope runs. When the run finishes, a "Run Complete" banner lands at the top with the verdict and a jump to the Reports tab.',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_W = 360;
const HIGHLIGHT_CLASS = 'tour-highlight';

const TOUR_STYLES = `
/* The highlighted element gets a bright luminous amber glow */
.${HIGHLIGHT_CLASS} {
  outline: 3px solid var(--amber) !important;
  outline-offset: 8px !important;
  box-shadow:
    0 0 20px rgba(232,180,74,.7),
    0 0 50px rgba(232,180,74,.4),
    0 0 100px rgba(232,180,74,.2),
    inset 0 0 30px rgba(232,180,74,.08) !important;
  position: relative !important;
  z-index: 99998 !important;
  filter: brightness(1.15) !important;
  animation: tour-pulse 2s ease-in-out infinite !important;
}
@keyframes tour-pulse {
  0%, 100% {
    outline-color: var(--amber);
    box-shadow: 0 0 20px rgba(232,180,74,.7), 0 0 50px rgba(232,180,74,.4), 0 0 100px rgba(232,180,74,.2), inset 0 0 30px rgba(232,180,74,.08);
  }
  50% {
    outline-color: rgba(232,180,74,1);
    box-shadow: 0 0 30px rgba(232,180,74,.9), 0 0 70px rgba(232,180,74,.55), 0 0 120px rgba(232,180,74,.3), inset 0 0 40px rgba(232,180,74,.12);
  }
}
`;

interface GuidedTourProps {
  /** The dashboard's currently-active tab. Threaded in so the tour can
   *  defer its DOM lookup until React has actually committed the tab
   *  change requested by onTabChange — without this, the lookup races
   *  ahead of the new tab's mount on slow viewports and lands on either
   *  the previous tab's elements or a stale empty container. */
  activeTab: TourTab | string;
  /** Whether the active scenario exposes Character Chat. When false the
   *  TabBar hides the Chat tab entirely; the tour drops its Chat step
   *  to match so it doesn't navigate to a tab the user can't reach
   *  via any other path. */
  chatEnabled?: boolean;
  onTabChange: (tab: TourTab) => void;
  onClose: () => void;
  onRun?: () => void;
}

export function GuidedTour({ activeTab, chatEnabled = true, onTabChange, onClose, onRun }: GuidedTourProps) {
  // Drop the Chat step on scenarios where Character Chat is disabled.
  // Without this filter the tour would fire onTabChange('chat') and the
  // ChatPanel (always mounted but hidden) would surface a tab the user
  // has no other way to reach.
  const steps = useMemo(
    () => (chatEnabled ? TOUR_STEPS : TOUR_STEPS.filter(s => s.tab !== 'chat')),
    [chatEnabled],
  );
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  // Re-render the card layout when the viewport crosses the mobile
  // breakpoint (e.g. user rotates device). The measure() resize handler
  // already re-positions the highlight; this state ensures the card's
  // mobile/desktop branch also flips on the same boundary.
  const [viewportW, setViewportW] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
  const prevElRef = useRef<Element | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const rafRef = useRef(0);
  const current = steps[step];

  // Inject tour styles on mount, remove on unmount
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = TOUR_STYLES;
    document.head.appendChild(style);
    styleRef.current = style;
    return () => {
      style.remove();
      document.querySelector(`.${HIGHLIGHT_CLASS}`)?.classList.remove(HIGHLIGHT_CLASS);
    };
  }, []);

  // Drive the tab change as a separate effect so it fires the moment
  // step changes, independent of any other dep. Earlier this was bundled
  // into measure() and the lookup race, which left a window where the
  // user could observe a step that hadn't yet pushed its onTabChange
  // through to App.activeTab — making the URL bar lag behind the tour
  // card's "VIZ" / "STUDIO" / etc. badge.
  useEffect(() => {
    const s = steps[step];
    if (s) onTabChange(s.tab);
  }, [step, onTabChange, steps]);

  // Highlight target element and measure its rect.
  //
  // Tab content for Quickstart / Studio / Library / Settings + heavy
  // single-tab views (SwarmViz) is mounted conditionally on activeTab.
  // The Viz tab in particular runs ~200ms of canvas + Conway grid setup
  // on first mount, well past a flat polling budget. We combine three
  // strategies so the highlight lands the moment the target appears:
  //
  //   1) Synchronous initial check (zero-cost when tab is already
  //      mounted, e.g. switching between sim sub-targets).
  //   2) Retry polling at 100ms intervals (cheap, covers most cases).
  //   3) MutationObserver on document.body that fires the moment the
  //      target node appears in DOM, regardless of how long the parent
  //      took to mount — needed for SwarmViz and similar.
  //
  // Both 2 and 3 race; whichever finds the element first wins. Both
  // tear down once the target is found OR when measure() is called
  // again for the next step (cleanup via attemptCancelRef).
  const attemptCancelRef = useRef<(() => void) | null>(null);
  const measure = useCallback(() => {
    const s = steps[step];
    if (!s) return;

    // Cancel any in-flight target lookup from a previous step.
    attemptCancelRef.current?.();

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      let cancelled = false;
      let pollHandle: number | undefined;
      let observer: MutationObserver | undefined;
      const apply = (el: Element) => {
        if (cancelled) return;
        cancelled = true;
        if (pollHandle !== undefined) clearTimeout(pollHandle);
        observer?.disconnect();
        if (prevElRef.current && prevElRef.current !== el) {
          prevElRef.current.classList.remove(HIGHLIGHT_CLASS);
        }
        el.classList.add(HIGHLIGHT_CLASS);
        prevElRef.current = el;
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
      let attempt = 0;
      const MAX_ATTEMPTS = 30;
      const POLL_MS = 100;
      const tryFind = () => {
        if (cancelled) return;
        const el = document.querySelector(s.target);
        if (el) {
          apply(el);
          return;
        }
        if (++attempt < MAX_ATTEMPTS) {
          pollHandle = window.setTimeout(tryFind, POLL_MS);
        } else if (!cancelled) {
          cancelled = true;
          observer?.disconnect();
          if (prevElRef.current) {
            prevElRef.current.classList.remove(HIGHLIGHT_CLASS);
            prevElRef.current = null;
          }
          setRect(null);
        }
      };
      observer = new MutationObserver(() => {
        if (cancelled) return;
        const el = document.querySelector(s.target);
        if (el) apply(el);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      tryFind();
      attemptCancelRef.current = () => {
        cancelled = true;
        if (pollHandle !== undefined) clearTimeout(pollHandle);
        observer?.disconnect();
      };
    });
  }, [step, onTabChange]);

  // Re-run measure() whenever:
  //   - the step changes (drives onTabChange + new target lookup)
  //   - activeTab catches up to what the step expects (so the highlight
  //     observer/poll race only starts AFTER the new tab actually mounts)
  //
  // Without the activeTab dep, measure ran in the same render pass that
  // requested the tab change, querying DOM before React had committed
  // the activeTab state update. The MutationObserver caught it eventually
  // on heavy panels (SwarmViz / SettingsPanel) but the moment varied
  // depending on how quickly the new tab's tree painted, so the user
  // saw flicker. Gating on activeTab makes the lookup deterministic.
  useEffect(() => {
    measure();
    let resizeRaf = 0;
    const h = () => {
      // Coalesce bursts of resize events (mobile chrome show/hide,
      // virtual keyboard, orientation animation) into a single
      // measure() call per frame. Without this, every pixel-level
      // resize fired a re-measure and the card visibly hopped around.
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        setViewportW(window.innerWidth);
        measure();
      });
    };
    window.addEventListener('resize', h);
    return () => {
      window.removeEventListener('resize', h);
      cancelAnimationFrame(resizeRaf);
      cancelAnimationFrame(rafRef.current);
    };
  }, [measure, activeTab]);

  const handleClose = useCallback(() => {
    if (prevElRef.current) {
      prevElRef.current.classList.remove(HIGHLIGHT_CLASS);
      prevElRef.current = null;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        step < steps.length - 1 ? setStep(s => s + 1) : handleClose();
      } else if (e.key === 'ArrowLeft' && step > 0) setStep(s => s - 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [step, handleClose]);

  if (!current) return null;

  const vw = viewportW;
  const vh = window.innerHeight;
  // Below this viewport width, drop the floating-positioned card entirely
  // and pin a fixed bottom strip so the card doesn't grow past the screen
  // on phone-sized viewports. Long descriptions scroll within the strip.
  const isMobile = vw < 640;

  const card: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        zIndex: 100001,
        left: 8,
        right: 8,
        bottom: 8,
        maxHeight: 'min(60vh, 480px)',
        overflowY: 'auto',
        background: 'var(--bg-panel)',
        border: '2px solid var(--amber)',
        borderRadius: '10px',
        padding: '12px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,.45)',
        fontFamily: 'var(--sans)',
      }
    : {
        position: 'fixed',
        zIndex: 100001,
        background: 'var(--bg-panel)',
        border: '2px solid var(--amber)',
        borderRadius: '10px',
        padding: '18px 22px',
        maxWidth: `${CARD_W}px`,
        width: 'calc(100vw - 32px)',
        boxShadow: '0 8px 32px rgba(0,0,0,.45)',
        fontFamily: 'var(--sans)',
        // Smooth the card's position update when the highlight target
        // changes between steps. Without this, a step that targets the
        // opposite side of the viewport (e.g. divergence rail → viz) made
        // the card visibly teleport, which read as a "jump."
        transition: 'top 0.25s ease, left 0.25s ease, bottom 0.25s ease, right 0.25s ease',
      };

  if (!isMobile && rect) {
    const below = vh - (rect.top + rect.height + 10);
    const above = rect.top - 10;
    const right = vw - (rect.left + rect.width + 10);

    if (below >= 200) {
      card.top = rect.top + rect.height + 16;
      card.left = Math.max(16, Math.min(rect.left, vw - CARD_W - 16));
    } else if (above >= 200) {
      card.bottom = vh - rect.top + 16;
      card.left = Math.max(16, Math.min(rect.left, vw - CARD_W - 16));
    } else if (right >= CARD_W + 24) {
      card.left = rect.left + rect.width + 16;
      card.top = Math.max(16, rect.top);
    } else {
      card.bottom = 24;
      card.right = 24;
    }
  } else if (!isMobile) {
    card.bottom = 24;
    card.right = 24;
  }

  const pad = 10;

  return (
    <>
      {/* Dim overlay with cutout around highlighted element */}
      <div data-tour-overlay style={{ position: 'fixed', inset: 0, zIndex: 99997, pointerEvents: 'none' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.left - pad} y={rect.top - pad}
                  width={rect.width + pad * 2} height={rect.height + pad * 2}
                  rx="10" fill="black"
                />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
        </svg>
      </div>

      {/* Click-away layer */}
      <div
        data-tour-overlay
        style={{ position: 'fixed', inset: 0, zIndex: 99999 }}
        onClick={handleClose}
      />

      {/* Tour card */}
      <div data-tour-overlay style={card} onClick={e => e.stopPropagation()} role="dialog" aria-label="Guided tour">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: 8 }}>
          <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text-3)', letterSpacing: '1px' }}>
            {step + 1} / {steps.length}
          </span>
          <span
            aria-label={`Active tab: ${current.tab}`}
            style={{
              fontSize: '9px',
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              color: 'var(--amber)',
              background: 'var(--bg-card)',
              border: '1px solid var(--amber)',
              borderRadius: '3px',
              padding: '2px 6px',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            {current.tab}
          </span>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '18px', padding: '0 2px', lineHeight: 1, marginLeft: 'auto' }}
            aria-label="Close tour"
          >&times;</button>
        </div>

        <h3 style={{ fontSize: isMobile ? '13px' : '15px', fontWeight: 700, color: 'var(--amber)', margin: '0 0 6px', fontFamily: 'var(--mono)' }}>
          {current.title}
        </h3>
        <p style={{ fontSize: isMobile ? '12px' : '13px', color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 12px' }}>
          {current.description}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <button onClick={handleClose} style={isMobile ? compactSkipBtn : skipBtn}>Skip</button>
          <div style={{ display: 'flex', gap: '6px' }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={isMobile ? compactNavBtn : navBtn}>
                Back
              </button>
            )}
            <button
              onClick={() => {
                if (step < steps.length - 1) {
                  setStep(s => s + 1);
                } else {
                  handleClose();
                  onRun?.();
                }
              }}
              style={isMobile
                ? compactPrimaryBtn
                : step === steps.length - 1 ? { ...primaryBtn, padding: '6px 22px', fontSize: '12px' } : primaryBtn}
            >
              {step < steps.length - 1 ? 'Next' : isMobile ? 'Start →' : 'Start Your Simulation'}
            </button>
          </div>
        </div>

        {/* Thin progress bar (mobile) or dot row (desktop). 14 dots wrap
            awkwardly below ~440px wide; the bar scales cleanly. */}
        {isMobile ? (
          <div style={{ marginTop: '10px', height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${((step + 1) / steps.length) * 100}%`,
                height: '100%',
                background: 'var(--amber)',
                transition: 'width 0.25s ease',
              }}
              role="progressbar"
              aria-valuenow={step + 1}
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-label={`Step ${step + 1} of ${steps.length}`}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', marginTop: '12px', flexWrap: 'wrap' }}>
            {steps.map((_, i) => (
              <button
                key={i} onClick={() => setStep(i)}
                style={{
                  width: i === step ? 16 : 6, height: 6, borderRadius: 3,
                  border: 'none', padding: 0, cursor: 'pointer',
                  background: i === step ? 'var(--amber)' : i < step ? 'var(--text-3)' : 'var(--border)',
                  transition: 'all 0.25s ease',
                }}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>
        )}

        {!isMobile && (
          <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '9px', color: 'var(--text-3)', fontFamily: 'var(--mono)', opacity: 0.7 }}>
            Arrow keys / Esc
          </div>
        )}
      </div>
    </>
  );
}

const skipBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', color: 'var(--text-3)',
  padding: '5px 14px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer',
  fontFamily: 'var(--sans)', fontWeight: 600,
};
const navBtn: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)',
  padding: '5px 14px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer',
  fontFamily: 'var(--sans)', fontWeight: 600,
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--rust), #c44a1e)', color: '#fff',
  border: 'none', padding: '5px 18px', borderRadius: '5px', fontSize: '11px',
  cursor: 'pointer', fontFamily: 'var(--sans)', fontWeight: 700,
};
// Compact button variants for the mobile card. Slightly smaller padding
// and font keep the three-button row on a single line at viewports as
// narrow as ~340px without forcing wrap.
const compactSkipBtn: React.CSSProperties = { ...skipBtn, padding: '4px 10px', fontSize: '10px' };
const compactNavBtn: React.CSSProperties = { ...navBtn, padding: '4px 10px', fontSize: '10px' };
const compactPrimaryBtn: React.CSSProperties = { ...primaryBtn, padding: '4px 12px', fontSize: '10px' };
