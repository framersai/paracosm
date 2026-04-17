/**
 * GuidedTour — Scrimless walkthrough of the Paracosm dashboard.
 *
 * Highlights the target element with a pulsing amber outline.
 * No dark overlay — the full UI stays visible and alive.
 * A floating card annotates each highlighted section.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TourStep {
  target: string;
  tab: 'sim' | 'viz' | 'settings' | 'reports' | 'chat' | 'log';
  title: string;
  description: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '.topbar',
    tab: 'sim',
    title: 'Top Bar',
    description: 'Scenario name, turn progress, and controls. Run, save, load, or clear simulations. The status dot shows connection + run state: Live, Running, Complete, or Interrupted. Hover the dot for the reason.',
  },
  {
    target: '.tab-bar',
    tab: 'sim',
    title: 'Navigation',
    description: 'Switch between Simulation, Viz, Settings, Reports, Character Chat, Event Log, and About. Viz is where family pods, drilldowns, and leader-side colour coding live.',
  },
  {
    target: '.leaders-row',
    tab: 'sim',
    title: 'Leader Cards',
    description: 'Two AI commanders with opposing HEXACO profiles run the same seed. Left column is Leader A (amber), right is Leader B (teal). All downstream UI picks up the same two colours so you always know which side you are looking at.',
  },
  {
    target: '[aria-label="Colony statistics"]',
    tab: 'sim',
    title: 'Stats Bar',
    description: 'Per-leader metrics side by side. Tools + Reuse are adjacent because together they tell the emergent-capability story: how many unique tools a side forged, and how many times those tools got reused without re-forging. Reuse is where cost savings come from.',
  },
  {
    target: '.sim-columns',
    tab: 'sim',
    title: 'Event Streams',
    description: 'The core view. Each turn, both leaders face events the Director generated for them based on accumulated state. Departments analyze in parallel and may forge new tools. Commanders decide. Tools tint by leader side. Click any forge card to inspect the schema and code.',
  },
  {
    target: '[aria-label="Divergence rail"]',
    tab: 'sim',
    title: 'Divergence Rail',
    description: 'How far the two colonies have diverged at the current turn. Shows the two decision texts and outcomes side by side, humanized (no "Safe Success" jargon). Same seed, different histories because HEXACO shaped every LLM call.',
  },
  {
    target: '.viz-content',
    tab: 'viz',
    title: 'Viz Tab — Colony Structure',
    description: 'Once a simulation runs, this area renders tiered tiles: featured colonists at the top, family pods in the middle, department bands at the bottom, ghost outlines for the deceased. The grid grows and thins with attrition as you scrub turns. Click any tile to open the drilldown panel with HEXACO, mood, family, memories, and chat handoff.',
  },
  {
    target: '[aria-label="Cluster mode"]',
    tab: 'viz',
    title: 'Cluster Toggle',
    description: 'Reshuffle the grid by clustering axis: Families (default), Departments, Mood, or Age. Every toggle is visible, no hidden keyboard shortcuts required. M on keyboard cycles them for power users; D toggles the divergence tint.',
  },
  {
    target: '.settings-content',
    tab: 'settings',
    title: 'Settings',
    description: 'Configure leaders with HEXACO sliders, pick a scenario, set turns and population, and drop in your own OpenAI or Anthropic key to bypass the hosted-demo caps. Locked demo inputs unlock the moment you paste a key.',
  },
  {
    target: '.reports-content',
    tab: 'reports',
    title: 'Reports',
    description: 'Turn-by-turn rollup: commander decisions, department analyses, forged toolbox across both sides, agent reactions, verdict comparison. The full provenance record of the run.',
  },
  {
    target: '.chat-layout',
    tab: 'chat',
    title: 'Character Chat',
    description: 'Talk to any colonist from the run. Each carries their HEXACO profile, the memories they formed during the sim, and their relationships. Drilldown panel in Viz has a direct Chat handoff button that preselects the colonist here.',
  },
  {
    target: '[role="log"]',
    tab: 'log',
    title: 'Event Log',
    description: 'Raw SSE event stream. Every status, turn_start, dept_done, commander_decided, outcome, reaction, forge_attempt event as it arrived.',
  },
  {
    target: '.topbar',
    tab: 'sim',
    title: 'Ready to Launch',
    description: 'That was demo data. Hit RUN in the top bar to launch a live simulation against the host caps, or go to Settings and paste your own API key for full-scope runs. The sim deploys to the same dashboard in real time.',
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
  onTabChange: (tab: 'sim' | 'viz' | 'settings' | 'reports' | 'chat' | 'log') => void;
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

  // Highlight target element and measure its rect
  const measure = useCallback(() => {
    const s = TOUR_STEPS[step];
    if (!s) return;
    onTabChange(s.tab as any);

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setTimeout(() => {
        if (prevElRef.current) {
          prevElRef.current.classList.remove(HIGHLIGHT_CLASS);
        }
        const el = document.querySelector(s.target);
        if (el) {
          el.classList.add(HIGHLIGHT_CLASS);
          prevElRef.current = el;
          const r = el.getBoundingClientRect();
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          if (r.top < 0 || r.bottom > window.innerHeight) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        } else {
          prevElRef.current = null;
          setRect(null);
        }
      }, 120);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text-3)', letterSpacing: '1px' }}>
            {step + 1} / {TOUR_STEPS.length}
          </span>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '18px', padding: '0 2px', lineHeight: 1 }}
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
