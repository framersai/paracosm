# Narrative-First Dashboard Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every broken UI element in the Paracosm dashboard and reshape the guided tour + demo data into a compelling narrative demo for product/AI audiences.

**Architecture:** Seven targeted edits across the dashboard. No new dependencies. The tour switches from an SVG-mask overlay to a CSS outline applied directly to the target element. Demo data is reshaped to match the exact field contracts of EventCard, Badge, DivergenceRail, and StatsBar. A new Copy Summary button generates shareable markdown from GameState.

**Tech Stack:** React 19, Vite 6, TypeScript, inline styles (existing pattern), navigator.clipboard API.

---

### Task 1: Fix StatsBar deaths rendering

**Files:**
- Modify: `apps/paracosm/src/cli/dashboard/src/components/layout/StatsBar.tsx:100-104`

- [ ] **Step 1: Fix the deaths column**

In `StatsBar.tsx`, replace lines 100-104:

```tsx
      <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
        <span style={{ color: 'var(--text-1)', fontWeight: 800 }}>&mdash;</span>
        <span style={{ color: 'var(--text-3)', fontSize: '11px' }}>vs</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 800 }}>&mdash;</span>
        <span style={{ fontSize: '13px', color: 'var(--amber)', fontWeight: 800, marginLeft: '4px' }}>DEATHS</span>
      </span>
```

With:

```tsx
      <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
        <span style={{ color: deathsA > 0 ? 'var(--rust)' : 'var(--text-1)', fontWeight: 800 }}>{deathsA}</span>
        <span style={{ color: 'var(--text-3)', fontSize: '11px' }}>vs</span>
        <span style={{ color: deathsB > 0 ? 'var(--rust)' : 'var(--text-1)', fontWeight: 800 }}>{deathsB}</span>
        <span style={{ fontSize: '13px', color: 'var(--amber)', fontWeight: 800, marginLeft: '4px' }}>DEATHS</span>
      </span>
```

- [ ] **Step 2: Verify build**

```bash
cd apps/paracosm/src/cli/dashboard && npx vite build
```

Expected: Build succeeds, 60 modules transformed.

- [ ] **Step 3: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm/src/cli/dashboard/src/components/layout/StatsBar.tsx
git commit -m "fix: render actual death counts in StatsBar instead of dashes"
```

---

### Task 2: Fix Vite proxy for all API routes

**Files:**
- Modify: `apps/paracosm/src/cli/dashboard/vite.config.ts:9-18`

- [ ] **Step 1: Add missing proxy routes**

Replace the entire `proxy` object (lines 9-18) with:

```ts
    proxy: {
      '/events': 'http://localhost:3456',
      '/scenario': 'http://localhost:3456',
      '/scenarios': 'http://localhost:3456',
      '/setup': 'http://localhost:3456',
      '/chat': 'http://localhost:3456',
      '/clear': 'http://localhost:3456',
      '/compile': 'http://localhost:3456',
      '/admin-config': 'http://localhost:3456',
      '/rate-limit': 'http://localhost:3456',
      '/favicon.svg': 'http://localhost:3456',
      '/favicon.png': 'http://localhost:3456',
    },
```

This adds `/scenarios`, `/compile`, and `/admin-config`. Note: `/scenario` already covers `/scenario/store` and `/scenario/switch` because Vite's proxy matches path prefixes.

- [ ] **Step 2: Verify build**

```bash
cd apps/paracosm/src/cli/dashboard && npx vite build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm/src/cli/dashboard/vite.config.ts
git commit -m "fix: add missing API routes to Vite dev proxy"
```

---

### Task 3: Rewrite GuidedTour to scrimless highlight

**Files:**
- Modify: `apps/paracosm/src/cli/dashboard/src/components/tour/GuidedTour.tsx` (full rewrite)

- [ ] **Step 1: Rewrite GuidedTour.tsx**

Replace the entire file with the scrimless approach. Key changes from current:
- Remove the SVG mask overlay entirely
- Instead, on each step, add a CSS class `tour-highlight` to the target DOM element via `el.classList.add()`
- On step change or close, remove the class from the previous element
- The highlight class applies: `outline: 2px solid var(--amber); outline-offset: 4px; box-shadow: 0 0 20px rgba(232,180,74,.25); position: relative; z-index: 99998;`
- Inject these styles via a `<style>` tag from a useEffect
- Keep a thin semi-transparent click-away backdrop at `z-index: 99997` with `background: rgba(0,0,0,0.15)` (barely visible, just enough to catch clicks)
- Tour card at `z-index: 100001` (above Tooltip's 99999)
- Card placement logic: try below target, then above, then right, then bottom-right corner
- Keep keyboard navigation (arrows, Esc)
- Keep step dots (pill style for active)
- Pulse animation on the highlight via `@keyframes tour-pulse`

Full replacement file content:

```tsx
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
  tab: 'sim' | 'settings' | 'reports' | 'chat' | 'log';
  title: string;
  description: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '.topbar',
    tab: 'sim',
    title: 'Top Bar',
    description: 'Scenario name, turn progress, and controls. Run, save, load, or clear simulations. The status dot shows the live SSE connection.',
  },
  {
    target: '.tab-bar',
    tab: 'sim',
    title: 'Navigation',
    description: 'Switch between Simulation, Settings, Reports, Character Chat, Event Log, and the About page.',
  },
  {
    target: '.leaders-row',
    tab: 'sim',
    title: 'Leader Cards',
    description: 'Two AI commanders with different HEXACO personalities run the same scenario. Left = Leader A, right = Leader B. Archetype, colony, and trait sparklines shown here.',
  },
  {
    target: '[aria-label="Colony statistics"]',
    tab: 'sim',
    title: 'Stats Bar',
    description: 'Live colony metrics for both sides. Population, morale, food, water, power, infrastructure. Arrows show per-turn delta. Compare how personality drives resource outcomes.',
  },
  {
    target: '.sim-columns',
    tab: 'sim',
    title: 'Event Streams',
    description: 'The core view. Each turn, both leaders face the same crisis but decide differently. Departments analyze, commanders decide, tools get forged at runtime. Hover any card for detail.',
  },
  {
    target: '[aria-label="Divergence rail"]',
    tab: 'sim',
    title: 'Divergence Rail',
    description: 'Shows how much the two colonies have diverged from the same starting conditions. Same crisis, different civilizations.',
  },
  {
    target: '.settings-content',
    tab: 'settings',
    title: 'Settings',
    description: 'Configure leaders, HEXACO personality sliders, simulation params, AI provider, API keys, and the Scenario Editor for custom worlds.',
  },
  {
    target: '.reports-content',
    tab: 'reports',
    title: 'Reports',
    description: 'Turn-by-turn comparison: both leaders\' decisions, department analyses, forged tools, agent reactions, and colony state deltas side by side.',
  },
  {
    target: '.chat-layout',
    tab: 'chat',
    title: 'Character Chat',
    description: 'Talk to any agent in the simulation. They remember what happened, hold opinions about commander decisions, and respond in character.',
  },
  {
    target: '[role="log"]',
    tab: 'log',
    title: 'Event Log',
    description: 'Raw SSE event stream. Every simulation event as it arrives.',
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
.${HIGHLIGHT_CLASS} {
  outline: 2px solid var(--amber) !important;
  outline-offset: 4px !important;
  box-shadow: 0 0 20px rgba(232,180,74,.25) !important;
  position: relative !important;
  z-index: 99998 !important;
  animation: tour-pulse 2s ease-in-out infinite !important;
}
@keyframes tour-pulse {
  0%, 100% { outline-color: var(--amber); box-shadow: 0 0 20px rgba(232,180,74,.25); }
  50% { outline-color: rgba(232,180,74,.6); box-shadow: 0 0 30px rgba(232,180,74,.4); }
}
`;

interface GuidedTourProps {
  onTabChange: (tab: 'sim' | 'settings' | 'reports' | 'chat' | 'log') => void;
  onClose: () => void;
}

export function GuidedTour({ onTabChange, onClose }: GuidedTourProps) {
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
      // Clean up any lingering highlight
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
        // Remove previous highlight
        if (prevElRef.current) {
          prevElRef.current.classList.remove(HIGHLIGHT_CLASS);
        }
        // Add highlight to new target
        const el = document.querySelector(s.target);
        if (el) {
          el.classList.add(HIGHLIGHT_CLASS);
          prevElRef.current = el;
          const r = el.getBoundingClientRect();
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          // Scroll into view if needed
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

  // Clean up highlight on close
  const handleClose = useCallback(() => {
    if (prevElRef.current) {
      prevElRef.current.classList.remove(HIGHLIGHT_CLASS);
      prevElRef.current = null;
    }
    onClose();
  }, [onClose]);

  // Keyboard navigation
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

  // Card placement
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

  return (
    <>
      {/* Thin click-away backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99997, background: 'rgba(0,0,0,0.12)' }}
        onClick={handleClose}
      />

      {/* Tour card */}
      <div style={card} onClick={e => e.stopPropagation()} role="dialog" aria-label="Guided tour">
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
              onClick={() => step < TOUR_STEPS.length - 1 ? setStep(s => s + 1) : handleClose()}
              style={primaryBtn}
            >
              {step < TOUR_STEPS.length - 1 ? 'Next' : 'Finish'}
            </button>
          </div>
        </div>

        {/* Dots */}
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
```

- [ ] **Step 2: Verify build**

```bash
cd apps/paracosm/src/cli/dashboard && npx vite build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm/src/cli/dashboard/src/components/tour/GuidedTour.tsx
git commit -m "feat: scrimless guided tour with pulsing outline highlights"
```

---

### Task 4: Fix demo data to match EventCard field contracts

**Files:**
- Modify: `apps/paracosm/src/cli/dashboard/src/components/tour/demoData.ts` (full rewrite)

The current demo data has three shape mismatches that cause broken rendering:

1. **agent_reactions**: Uses `{agent, role, mood, thought}` but EventCard expects `{name, role, department, mood, quote, hexaco, boneDensity, radiation, psychScore, intensity, memory}` and wraps them in a `reactions` array with a `totalReactions` count.
2. **outcome**: Uses prose strings but Badge expects structured values like `risky_success`, `conservative_success`, `conservative_failure`. Also missing `_toolCount` and `_citeCount`.
3. **bulletin**: Uses `{headline, body}` but EventCard expects `posts: [{name, role, department, post, mood, likes, replies}]`.

- [ ] **Step 1: Rewrite demoData.ts**

Replace the entire file. The full content is large (~400 lines) so I'll describe the exact changes for each event type rather than pasting the entire file:

**For every `agent_reactions` event**, change:
```ts
// FROM:
reactions: [
  { agent: 'Erik Lindqvist', role: 'Chief Engineer', mood: 'anxious', thought: 'The coatings are untested...' },
]
// TO:
reactions: [
  { name: 'Erik Lindqvist', role: 'Chief Engineer', department: 'engineering', mood: 'anxious', quote: 'The coatings are untested...', hexaco: { O: 0.45, C: 0.88, E: 0.35, A: 0.62, Em: 0.55, HH: 0.80 }, boneDensity: 94, radiation: 12, psychScore: 72, intensity: 0.78 },
],
totalReactions: 12,
```

**For every `outcome` event**, change:
```ts
// FROM:
outcome: 'Bold strategy partially pays off. Solar coatings reduce dust...',
// TO:
outcome: 'risky_success',  // or conservative_success, conservative_failure, etc.
_decision: '...the decision text...',  // MOVE from commander_decided
_rationale: '...the rationale...',     // MOVE from commander_decided
_policies: ['expand_solar', 'mandatory_overtime'],  // MOVE from commander_decided
_toolCount: 1,
_citeCount: 2,
```

The `_decision`, `_rationale`, and `_policies` fields must be on the `outcome` event because that's where EventCard reads them (the `useGameState` hook copies them from `commander_decided` to `outcome` via `pendingDecision`/`pendingRationale`/`pendingPolicies`, but since demo data bypasses SSE, we must put them directly on the outcome event).

**For every `bulletin` event**, change:
```ts
// FROM:
headline: 'Olympus Base Pushes Through Storm',
body: 'Commander Vasquez orders experimental...',
// TO:
posts: [
  { name: 'Colony Bulletin', role: 'Official', department: 'governance', post: 'Commander Vasquez orders experimental dust coatings deployed. Engineering crews working double shifts.', mood: 'anxious', likes: 24, replies: 8 },
],
```

**Structured outcome mapping for all 6 turns:**
- Turn 1, Leader A (aggressive solar coatings): `risky_success`
- Turn 1, Leader B (conservation mode): `conservative_success`
- Turn 2, Leader A (emergency drilling, 2 deaths): `risky_success` with `deaths: 2` in the event data
- Turn 2, Leader B (methodical decontamination): `conservative_success`
- Turn 3, Leader A (founding day, centrifuge): `risky_success`
- Turn 3, Leader B (standard protocols): `conservative_success`

- [ ] **Step 2: Apply all changes across the file**

This is a mechanical transformation: go through every `agent_reactions`, `outcome`, and `bulletin` event in `demoData.ts` and apply the field renames and additions described above. There are 6 of each (one per leader per turn, 3 turns).

- [ ] **Step 3: Verify build**

```bash
cd apps/paracosm/src/cli/dashboard && npx vite build
```

- [ ] **Step 4: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm/src/cli/dashboard/src/components/tour/demoData.ts
git commit -m "fix: demo data matches EventCard/Badge/DivergenceRail field contracts"
```

---

### Task 5: Add Copy Summary button to TopBar

**Files:**
- Modify: `apps/paracosm/src/cli/dashboard/src/components/layout/TopBar.tsx:8-10,47,107-150`
- Modify: `apps/paracosm/src/cli/dashboard/src/App.tsx:90-97,140`

- [ ] **Step 1: Add onCopy prop to TopBar**

In `TopBar.tsx`, add `onCopy` to the interface and destructure:

```tsx
interface TopBarProps {
  scenario: ScenarioClientPayload;
  sse: { status: string; events: Array<unknown>; isComplete: boolean };
  gameState: GameState;
  onSave?: () => void;
  onLoad?: () => void;
  onClear?: () => void;
  onRun?: () => void;
  onTour?: () => void;
  onCopy?: () => void;
}
```

Update the function signature:
```tsx
export function TopBar({ scenario, sse, gameState, onSave, onLoad, onClear, onRun, onTour, onCopy }: TopBarProps) {
```

- [ ] **Step 2: Add Copy button next to Save**

After the Save button (line 143) and before the Load button (line 145), add:

```tsx
        {hasEvents && onCopy && (
          <button onClick={onCopy} style={toolBtnStyle} title="Copy simulation summary to clipboard" aria-label="Copy summary">Copy</button>
        )}
```

- [ ] **Step 3: Build the summary generator in App.tsx**

In `App.tsx`, after `handleTourEnd` (line 97), add `handleCopySummary`:

```tsx
  const handleCopySummary = useCallback(() => {
    const a = gameState.a;
    const b = gameState.b;
    const nameA = a.leader?.name || 'Leader A';
    const nameB = b.leader?.name || 'Leader B';
    const archA = a.leader?.archetype || '';
    const archB = b.leader?.archetype || '';
    const colA = a.leader?.colony || '';
    const colB = b.leader?.colony || '';

    const lines: string[] = [
      `## ${scenario.labels.name} — Simulation Report`,
      `**Turns**: ${gameState.turn}/${gameState.maxTurns} | **Seed**: ${gameState.seed} | **Year**: ${gameState.year}`,
      '',
      `### ${nameA}${archA ? ` (${archA})` : ''}`,
      `Colony: ${colA} | Pop: ${a.colony?.population ?? '?'} | Morale: ${a.colony ? Math.round(a.colony.morale * 100) : '?'}% | Deaths: ${a.deaths}`,
      `Tools forged: ${a.tools} | Citations: ${a.citations} | Decisions: ${a.decisions}`,
      '',
      `### ${nameB}${archB ? ` (${archB})` : ''}`,
      `Colony: ${colB} | Pop: ${b.colony?.population ?? '?'} | Morale: ${b.colony ? Math.round(b.colony.morale * 100) : '?'}% | Deaths: ${b.deaths}`,
      `Tools forged: ${b.tools} | Citations: ${b.citations} | Decisions: ${b.decisions}`,
    ];

    // Add divergence if both have a crisis
    if (a.crisis && b.crisis && a.crisis.turn === b.crisis.turn) {
      lines.push('', '### Key Divergence');
      lines.push(`Same crisis "${a.crisis.title}" at T${a.crisis.turn}.`);
    }

    lines.push('', `Generated by Paracosm (paracosm.sh)`);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast('success', 'Copied', 'Simulation summary copied to clipboard.');
    }).catch(() => {
      toast('error', 'Copy Failed', 'Clipboard access denied.');
    });
  }, [gameState, scenario, toast]);
```

- [ ] **Step 4: Wire onCopy to TopBar**

In App.tsx, update the TopBar JSX (currently line 140):

```tsx
          <TopBar scenario={scenario} sse={sse} gameState={gameState} onSave={handleSave} onLoad={handleLoad} onClear={handleClear} onRun={handleRun} onTour={handleTourStart} onCopy={handleCopySummary} />
```

- [ ] **Step 5: Verify build**

```bash
cd apps/paracosm/src/cli/dashboard && npx vite build
```

- [ ] **Step 6: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm/src/cli/dashboard/src/components/layout/TopBar.tsx apps/paracosm/src/cli/dashboard/src/App.tsx
git commit -m "feat: copy simulation summary to clipboard from TopBar"
```

---

### Task 6: Final integration build and verify

**Files:**
- All files from Tasks 1-5

- [ ] **Step 1: Full rebuild**

```bash
cd apps/paracosm/src/cli/dashboard && npx vite build
```

Expected: Build succeeds, 60 modules, no errors.

- [ ] **Step 2: Verify demo data renders in tour**

Grep the built JS to confirm demo data key fields are present:

```bash
grep -c "risky_success\|conservative_success\|tour-highlight\|tour-pulse" apps/paracosm/src/cli/dashboard/dist/assets/index-*.js
```

Expected: Count > 0 for all patterns.

- [ ] **Step 3: Verify all 7 files are committed**

```bash
git diff --stat HEAD~5..HEAD -- apps/paracosm/
```

Should show changes in: StatsBar.tsx, vite.config.ts, GuidedTour.tsx, demoData.ts, TopBar.tsx, App.tsx.

---
