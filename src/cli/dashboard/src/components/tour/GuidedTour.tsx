/**
 * GuidedTour — Scrimless walkthrough of the Paracosm dashboard.
 *
 * Highlights the target element with a pulsing amber outline.
 * No dark overlay — the full UI stays visible and alive.
 * A floating card annotates each highlighted section.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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
  onTabChange: (tab: TourTab) => void;
  onClose: () => void;
  onRun?: () => void;
}

export function GuidedTour({ onTabChange, onClose, onRun }: GuidedTourProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const prevElRef = useRef<Element | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const rafRef = useRef(0);
  const current = TOUR_STEPS[step];

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

  // Highlight target element and measure its rect.
  //
  // Tab content for Quickstart / Studio / Library / Settings is mounted
  // conditionally on activeTab. When the tour advances to a new step
  // whose .tab differs from the current active tab, onTabChange triggers
  // a React re-render. The new tab's content (with the target selector)
  // doesn't appear in the DOM until that render commits — and heavier
  // panels (StudioTab + sub-tabs, SettingsPanel + sub-tabs) can take a
  // few frames to fully mount their sub-trees, especially on slower
  // devices or after a cold load.
  //
  // Earlier the timeout was a flat 120ms — too short for a fresh tab
  // mount on the first hop, so document.querySelector(s.target) returned
  // null, the SVG cutout collapsed to (0,0,0,0), and the user saw the
  // tour silently skip to the next step with no visible highlight. The
  // poll loop below retries up to ~900ms total so the highlight always
  // lands once the tab actually paints.
  const measure = useCallback(() => {
    const s = TOUR_STEPS[step];
    if (!s) return;
    // eslint-disable-next-line no-console
    console.log('[tour] step', step, '→ tab', s.tab, '· target', s.target);
    onTabChange(s.tab);

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      let attempt = 0;
      const MAX_ATTEMPTS = 9;
      const POLL_MS = 100;
      const tryFind = () => {
        const el = document.querySelector(s.target);
        if (el) {
          // eslint-disable-next-line no-console
          console.log('[tour] step', step, 'found target after', attempt, 'retries');
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
          return;
        }
        if (++attempt < MAX_ATTEMPTS) {
          setTimeout(tryFind, POLL_MS);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[tour] step', step, 'target not found after', MAX_ATTEMPTS, 'retries — falling back to bottom-right card');
          if (prevElRef.current) {
            prevElRef.current.classList.remove(HIGHLIGHT_CLASS);
            prevElRef.current = null;
          }
          setRect(null);
        }
      };
      tryFind();
    });
  }, [step, onTabChange]);

  useEffect(() => {
    measure();
    const h = () => measure();
    window.addEventListener('resize', h);
    return () => {
      window.removeEventListener('resize', h);
      cancelAnimationFrame(rafRef.current);
    };
  }, [measure]);

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
        step < TOUR_STEPS.length - 1 ? setStep(s => s + 1) : handleClose();
      } else if (e.key === 'ArrowLeft' && step > 0) setStep(s => s - 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [step, handleClose]);

  if (!current) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const card: React.CSSProperties = {
    position: 'fixed', zIndex: 100001,
    background: 'var(--bg-panel)', border: '2px solid var(--amber)',
    borderRadius: '10px', padding: '18px 22px',
    maxWidth: `${CARD_W}px`, width: 'calc(100vw - 32px)',
    boxShadow: '0 8px 32px rgba(0,0,0,.45)',
    fontFamily: 'var(--sans)',
  };

  if (rect) {
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
  } else {
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
            {step + 1} / {TOUR_STEPS.length}
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

        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--amber)', margin: '0 0 6px', fontFamily: 'var(--mono)' }}>
          {current.title}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.65, margin: '0 0 14px' }}>
          {current.description}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={handleClose} style={skipBtn}>Skip</button>
          <div style={{ display: 'flex', gap: '6px' }}>
            {step > 0 && <button onClick={() => setStep(s => s - 1)} style={navBtn}>Back</button>}
            <button
              onClick={() => {
                if (step < TOUR_STEPS.length - 1) {
                  setStep(s => s + 1);
                } else {
                  handleClose();
                  onRun?.();
                }
              }}
              style={step === TOUR_STEPS.length - 1 ? { ...primaryBtn, padding: '6px 22px', fontSize: '12px' } : primaryBtn}
            >
              {step < TOUR_STEPS.length - 1 ? 'Next' : 'Start Your Simulation'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', marginTop: '12px' }}>
          {TOUR_STEPS.map((_, i) => (
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

        <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '9px', color: 'var(--text-3)', fontFamily: 'var(--mono)', opacity: 0.7 }}>
          Arrow keys / Esc
        </div>
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
