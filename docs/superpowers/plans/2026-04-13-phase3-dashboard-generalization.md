# Phase 3: Dashboard Generalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard render from `ScenarioPackage` data fetched from `GET /scenario` instead of hardcoded Mars values.

**Architecture:** Server serves a client-safe projection of the active scenario via `GET /scenario`. Dashboard fetches it on load into `window.SCENARIO`, falls back to hardcoded Mars defaults, and uses it to populate all labels, presets, departments, theme colors, and stats. The dashboard remains a static HTML/JS shell with zero build step.

**Tech Stack:** Vanilla JS, Node HTTP server, no frameworks

**Spec:** `docs/superpowers/specs/2026-04-13-phase3-dashboard-generalization-design.md`

**Test command:** `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`

---

## File Structure

### Modified files

| File | Change |
|------|--------|
| `src/server-app.ts` | Add `GET /scenario` endpoint |
| `src/server-app.test.ts` | Add test for new endpoint |
| `src/dashboard/main.js` | Fetch scenario, replace hardcoded Mars values with `SCENARIO.*` reads |
| `src/dashboard/index.html` | Replace hardcoded Mars titles with JS-populatable elements, make theme CSS overridable |

---

## Task 1: Server Endpoint `GET /scenario`

**Files:**
- Modify: `src/server-app.ts`
- Modify: `src/server-app.test.ts`

- [ ] **Step 1: Add scenario projection helper and endpoint to server-app.ts**

In `src/server-app.ts`, add import at the top:

```typescript
import { marsScenario } from './engine/mars/index.js';
import type { ScenarioPackage } from './engine/types.js';
```

Add a helper function before `createMarsServer`:

```typescript
function projectScenarioForClient(sc: ScenarioPackage) {
  return {
    id: sc.id,
    version: sc.version,
    labels: sc.labels,
    theme: sc.theme,
    setup: sc.setup,
    departments: sc.departments.map(d => ({ id: d.id, label: d.label, role: d.role, icon: d.icon })),
    presets: sc.presets,
    ui: sc.ui,
    policies: {
      toolForging: sc.policies.toolForging.enabled,
      bulletin: sc.policies.bulletin.enabled,
      characterChat: sc.policies.characterChat.enabled,
    },
  };
}
```

Add the endpoint in the request handler, before the setup GET handler:

```typescript
    if (req.url === '/scenario' && req.method === 'GET') {
      const payload = JSON.stringify(projectScenarioForClient(marsScenario));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(payload);
      return;
    }
```

- [ ] **Step 2: Add test for GET /scenario**

Append to `src/server-app.test.ts`:

```typescript
test('GET /scenario returns valid scenario client payload', async () => {
  const res = await fetch(`${base}/scenario`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.id, 'mars-genesis');
  assert.ok(data.labels);
  assert.equal(data.labels.name, 'Mars Genesis');
  assert.ok(data.departments);
  assert.ok(data.departments.length >= 5);
  assert.ok(data.presets);
  assert.ok(data.ui);
  assert.ok(data.theme);
  assert.ok(data.policies);
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/paracosm && node --import tsx --test src/server-app.test.ts`
Expected: All server tests PASS

- [ ] **Step 4: Commit**

```bash
cd apps/paracosm && git add src/server-app.ts src/server-app.test.ts && git commit -m "feat: add GET /scenario endpoint serving scenario client payload"
```

---

## Task 2: Dashboard Scenario Fetch and Fallback

**Files:**
- Modify: `src/dashboard/main.js`

- [ ] **Step 1: Add Mars fallback object and scenario fetch at the top of main.js**

After the existing first line (`const $ = id => document.getElementById(id);`), insert the scenario loading block. This defines the Mars fallback (so the dashboard never breaks) and fetches the live scenario:

```javascript
// Scenario data: fetched from server, falls back to Mars defaults
const MARS_FALLBACK_SCENARIO = {
  id: 'mars-genesis', version: '3.0.0',
  labels: { name: 'Mars Genesis', shortName: 'mars', populationNoun: 'colonists', settlementNoun: 'colony', currency: 'credits' },
  theme: { primaryColor: '#dc2626', accentColor: '#f97316', cssVariables: {} },
  setup: { defaultTurns: 12, defaultSeed: 950, defaultStartYear: 2035, defaultPopulation: 100 },
  departments: [
    { id: 'medical', label: 'Medical', role: 'Chief Medical Officer', icon: '🏥' },
    { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '⚙️' },
    { id: 'agriculture', label: 'Agriculture', role: 'Head of Agriculture', icon: '🌱' },
    { id: 'psychology', label: 'Psychology', role: 'Colony Psychologist', icon: '🧠' },
    { id: 'governance', label: 'Governance', role: 'Governance Advisor', icon: '🏛️' },
  ],
  presets: [],
  ui: {
    headerMetrics: [
      { id: 'population', format: 'number' }, { id: 'morale', format: 'percent' },
      { id: 'foodMonthsReserve', format: 'number' }, { id: 'powerKw', format: 'number' },
      { id: 'infrastructureModules', format: 'number' }, { id: 'scienceOutput', format: 'number' },
    ],
    tooltipFields: ['boneDensityPct', 'cumulativeRadiationMsv', 'psychScore', 'marsborn'],
    departmentIcons: { medical: '🏥', engineering: '⚙️', agriculture: '🌱', psychology: '🧠', governance: '🏛️' },
    setupSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },
  policies: { toolForging: true, bulletin: true, characterChat: true },
};
window.SCENARIO = MARS_FALLBACK_SCENARIO;

// Fetch live scenario from server (non-blocking, falls back silently)
fetch('/scenario').then(r => r.ok ? r.json() : null).then(sc => {
  if (sc && sc.id) {
    window.SCENARIO = sc;
    applyScenarioToUI(sc);
  }
}).catch(() => {});
```

- [ ] **Step 2: Add the applyScenarioToUI function**

This function applies scenario data to the DOM after fetch. Insert it after the `SCENARIO` block:

```javascript
function applyScenarioToUI(sc) {
  // Title and branding
  document.title = sc.labels.name + ' Simulation';
  const logoText = document.querySelector('.logo-text');
  if (logoText) logoText.textContent = sc.labels.name.toUpperCase();
  const tagline = $('top-tagline');
  if (tagline) tagline.textContent = `Same ${sc.labels.settlementNoun}, two different leaders. Watch emergent civilizations diverge.`;

  // Theme CSS variables
  if (sc.theme?.cssVariables) {
    const style = document.createElement('style');
    style.textContent = ':root { ' + Object.entries(sc.theme.cssVariables).map(([k, v]) => `${k}: ${v}`).join('; ') + ' }';
    document.head.appendChild(style);
  }

  // Department icons lookup (used by event handler)
  window.DEPT_ICONS = {};
  for (const d of sc.departments || []) {
    window.DEPT_ICONS[d.id] = d.icon || '📋';
  }

  // Populate department selects in setup form
  const deptSelectHtml = (sc.departments || []).map(d => `<option value="${d.id}">${d.label}</option>`).join('');
  document.querySelectorAll('.s-person select, #s-personnel select').forEach(sel => {
    const current = sel.value;
    sel.innerHTML = deptSelectHtml;
    if (current) sel.value = current;
  });

  // Populate presets from scenario if available
  if (sc.presets?.length) {
    const defaultPreset = sc.presets.find(p => p.id === 'default');
    if (defaultPreset && defaultPreset.leaders?.length >= 2) {
      const a = defaultPreset.leaders[0], b = defaultPreset.leaders[1];
      SETUP_PRESETS.default = {
        a: { name: a.name, arch: a.archetype, colony: 'Colony Alpha', hexaco: a.hexaco, instr: a.instructions },
        b: { name: b.name, arch: b.archetype, colony: 'Colony Beta', hexaco: b.hexaco, instr: b.instructions },
        turns: sc.setup?.defaultTurns || 12, seed: sc.setup?.defaultSeed || 950,
      };
    }
  }
}
```

- [ ] **Step 3: Replace hardcoded department icons in handleSimEvent**

In the `dept_start` case (around line 1011) and `dept_done` case (around line 1031), replace the hardcoded icon lookups:

Replace all instances of:
```javascript
const dIcon = { medical: '🏥', engineering: '⚙️', agriculture: '🌾', psychology: '🧠', governance: '🏛️' }[dd.department] || '📋';
```
and:
```javascript
const icon = { medical: '🏥', engineering: '⚙️', agriculture: '🌾', psychology: '🧠', governance: '🏛️' }[dept] || '📋';
```

With:
```javascript
const dIcon = (window.DEPT_ICONS || {})[dd.department] || window.SCENARIO?.ui?.departmentIcons?.[dd.department] || '📋';
```
and:
```javascript
const icon = (window.DEPT_ICONS || {})[dept] || window.SCENARIO?.ui?.departmentIcons?.[dept] || '📋';
```

- [ ] **Step 4: Replace hardcoded department options in addPersonnel function**

Replace the hardcoded HTML in `addPersonnel()` (line ~491):

Replace:
```javascript
  d.innerHTML = '<input placeholder="Name"><input placeholder="Specialization"><input value="35" type="number"><select><option value="medical">Medical</option><option value="engineering">Engineering</option><option value="agriculture">Agriculture</option><option value="psychology">Psychology</option><option value="science">Science</option><option value="governance">Governance</option></select><button class="s-rm" onclick="this.parentElement.remove()">x</button>';
```

With:
```javascript
  const deptOpts = (window.SCENARIO?.departments || MARS_FALLBACK_SCENARIO.departments).map(d2 => `<option value="${d2.id}">${d2.label}</option>`).join('');
  d.innerHTML = `<input placeholder="Name"><input placeholder="Specialization"><input value="35" type="number"><select>${deptOpts}</select><button class="s-rm" onclick="this.parentElement.remove()">x</button>`;
```

- [ ] **Step 5: Replace hardcoded department options in addPersonnelRow function**

Replace the hardcoded HTML in `addPersonnelRow()` (line ~248):

Replace:
```javascript
  row.innerHTML = `<input value="${person.name || ''}"><input value="${person.specialization || ''}"><input value="${person.age ?? 35}" type="number"><select><option value="medical">Medical</option><option value="engineering">Engineering</option><option value="agriculture">Agriculture</option><option value="psychology">Psychology</option><option value="science">Science</option></select>`;
```

With:
```javascript
  const deptOpts = (window.SCENARIO?.departments || MARS_FALLBACK_SCENARIO.departments).map(d2 => `<option value="${d2.id}">${d2.label}</option>`).join('');
  row.innerHTML = `<input value="${person.name || ''}"><input value="${person.specialization || ''}"><input value="${person.age ?? 35}" type="number"><select>${deptOpts}</select>`;
```

- [ ] **Step 6: Replace hardcoded Mars copy in taglines and labels**

Replace all hardcoded tagline strings that reference Mars:

In `clearAll()` (line ~368):
```javascript
    if (tag) tag.textContent = 'Same colony, two different leaders. Watch emergent civilizations diverge on Mars.';
```
With:
```javascript
    if (tag) tag.textContent = `Same ${window.SCENARIO?.labels?.settlementNoun || 'colony'}, two different leaders. Watch emergent civilizations diverge.`;
```

In the SSE status handler (line ~866):
```javascript
      if (tag) tag.textContent = `Same colony, two different leaders. ${d.maxTurns} turns on Mars.`;
```
With:
```javascript
      if (tag) tag.textContent = `Same ${window.SCENARIO?.labels?.settlementNoun || 'colony'}, two different leaders. ${d.maxTurns} turns.`;
```

In the SSE status handler (line ~879):
```javascript
        if (tag) tag.textContent = `${d.leaders[0].name} vs ${d.leaders[1].name}. ${maxT} turns on Mars.`;
```
With:
```javascript
        if (tag) tag.textContent = `${d.leaders[0].name} vs ${d.leaders[1].name}. ${maxT} turns.`;
```

- [ ] **Step 7: Replace hardcoded Mars copy in chat**

In `selectChatColonist` (line ~1313):
```javascript
  msgs.innerHTML = `<div class="chat-msg colonist"><div class="cm-name">${esc(name)}</div>${colonist ? `${esc(colonist.role)} in ${esc(colonist.department)}. ${colonist.marsborn ? 'Mars-born.' : 'Earth-born.'} Age ${colonist.age || '?'}.` : ''} Ask me anything about life on Mars.</div>`;
```
With:
```javascript
  const sc = window.SCENARIO || MARS_FALLBACK_SCENARIO;
  msgs.innerHTML = `<div class="chat-msg colonist"><div class="cm-name">${esc(name)}</div>${colonist ? `${esc(colonist.role)} in ${esc(colonist.department)}. Age ${colonist.age || '?'}.` : ''} Ask me anything about life in the ${sc.labels?.settlementNoun || 'colony'}.</div>`;
```

- [ ] **Step 8: Replace hardcoded "Colony Bulletin" label**

In the bulletin case (line ~1269):
```javascript
          <div style="font-size:10px;color:var(--${color});font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">📢 Colony Bulletin — Year ${dd.year || ''}</div>
```
With:
```javascript
          <div style="font-size:10px;color:var(--${color});font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">📢 ${window.SCENARIO?.labels?.settlementNoun?.charAt(0).toUpperCase() + (window.SCENARIO?.labels?.settlementNoun || 'colony').slice(1)} Bulletin — Year ${dd.year || ''}</div>
```

- [ ] **Step 9: Replace hardcoded localStorage keys**

Replace all `mars-game-data`, `mars-settings`, `mars-cleared`, `mars-intro-dismissed` localStorage keys with scenario-prefixed keys:

Add a helper near the top (after `window.SCENARIO` definition):
```javascript
const storageKey = (key) => `${(window.SCENARIO?.labels?.shortName || 'mars')}-${key}`;
```

Then replace throughout:
- `localStorage.*('mars-game-data'` -> `localStorage.*(storageKey('game-data')`
- `localStorage.*('mars-settings'` -> `localStorage.*(storageKey('settings')`
- `localStorage.*('mars-cleared'` -> `localStorage.*(storageKey('cleared')`
- `localStorage.*('mars-intro-dismissed'` -> `localStorage.*(storageKey('intro-dismissed')`

- [ ] **Step 10: Replace hardcoded save file name**

In `saveGame()` (line ~393):
```javascript
  a.download = `mars-genesis-${gameData.config?.seed || 950}-${gameData.events.length}events.json`;
```
With:
```javascript
  a.download = `${window.SCENARIO?.labels?.shortName || 'mars'}-${gameData.config?.seed || 950}-${gameData.events.length}events.json`;
```

In `exportSetup()` (line ~535):
```javascript
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mars-genesis-config.json'; a.click();
```
With:
```javascript
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${window.SCENARIO?.labels?.shortName || 'mars'}-config.json`; a.click();
```

- [ ] **Step 11: Run dashboard syntax check**

Run: `cd apps/paracosm && node --check src/dashboard/main.js`
Expected: No syntax errors

- [ ] **Step 12: Run full test suite**

Run: `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS

- [ ] **Step 13: Commit**

```bash
cd apps/paracosm && git add src/dashboard/main.js && git commit -m "feat: dashboard fetches scenario from server, replaces hardcoded Mars labels/depts/icons/copy"
```

---

## Task 3: HTML Title and Theme Generalization

**Files:**
- Modify: `src/dashboard/index.html`

- [ ] **Step 1: Make HTML title dynamic**

Replace line 6:
```html
<title>Mars Genesis Simulation — AgentOS Emergent Multi-Agent AI Demo</title>
```
With:
```html
<title>Paracosm Simulation — AgentOS Emergent Multi-Agent AI Demo</title>
```

The `applyScenarioToUI` function in main.js will override `document.title` with the scenario name on load.

- [ ] **Step 2: Update meta tags to be scenario-neutral**

Replace the Mars-specific OG/meta tags (lines 7-15) with generic ones:
```html
<meta name="description" content="A live multi-agent AI simulation built with AgentOS. Two AI commanders with distinct HEXACO personalities lead the same settlement through emergent crises. Department agents forge computational tools at runtime, an LLM-as-judge reviews them, and a Crisis Director generates unique scenarios per timeline.">
<meta name="keywords" content="AgentOS, paracosm, AI agent simulation, multi-agent framework, emergent AI behavior, autonomous AI agents, TypeScript AI agents, HEXACO personality, runtime tool forging, LLM-as-judge, emergent capability engine, personality drift, deterministic simulation">
<meta name="author" content="Manic Agency / Frame.dev — team@frame.dev">
<meta property="og:title" content="Paracosm Simulation — AgentOS">
<meta property="og:description" content="Two AI commanders. Same settlement. Different personalities. Emergent crises, runtime tool forging, 100+ agent voices per turn. Watch civilizations diverge in real-time.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://github.com/framersai/paracosm">
<meta property="og:site_name" content="AgentOS">
<link rel="canonical" href="https://github.com/framersai/paracosm">
```

- [ ] **Step 3: Update logo text in the top bar**

Find the logo text element in the HTML (search for "MARS GENESIS" or the logo-text span) and give it an id so JS can update it:

Replace `<span class="logo-text">MARS GENESIS</span>` (or similar) with:
```html
<span class="logo-text" id="logo-text">MARS GENESIS</span>
```

The `applyScenarioToUI` function updates this via `$('logo-text').textContent = sc.labels.name.toUpperCase()`.

- [ ] **Step 4: Run dashboard syntax check**

Run: `cd apps/paracosm && node --check src/dashboard/main.js`
Expected: No syntax errors

- [ ] **Step 5: Commit**

```bash
cd apps/paracosm && git add src/dashboard/index.html && git commit -m "feat: generalize HTML meta/title/branding for scenario-agnostic dashboard"
```

---

## Task 4: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd apps/paracosm && node --import tsx --test src/**/*.test.ts src/*.test.ts`
Expected: All tests PASS

- [ ] **Step 2: Verify no hardcoded "Mars" in rendering paths**

Run: `grep -n "Mars" src/dashboard/main.js | grep -v FALLBACK | grep -v "// " | grep -v storageKey`
Expected: Only the `MARS_FALLBACK_SCENARIO` definition and the `DEFAULT_SETUP_PERSONNEL` fallback should appear. No Mars strings in active rendering code.

- [ ] **Step 3: Commit and push**

```bash
cd apps/paracosm && git add -A && git commit -m "feat: Phase 3 dashboard generalization — scenario-driven labels, presets, departments, icons, theme" && git push origin master
```

---

## Summary

| Surface | Before | After |
|---------|--------|-------|
| Title / branding | "MARS GENESIS" hardcoded | `SCENARIO.labels.name` |
| Taglines | "on Mars", "colony" hardcoded | `SCENARIO.labels.settlementNoun` |
| Department icons | `{ medical: '🏥', ... }` inline | `SCENARIO.ui.departmentIcons` / `window.DEPT_ICONS` |
| Department selects | `<option value="medical">Medical</option>...` hardcoded | Generated from `SCENARIO.departments` |
| Presets | `SETUP_PRESETS.default` with Aria/Dietrich | Overridden from `SCENARIO.presets` |
| Theme colors | Inline CSS variables | Overridable via `SCENARIO.theme.cssVariables` |
| Chat copy | "life on Mars" | `SCENARIO.labels.settlementNoun` |
| Bulletin label | "Colony Bulletin" | `SCENARIO.labels.settlementNoun` + " Bulletin" |
| Save file names | `mars-genesis-...` | `SCENARIO.labels.shortName + ...` |
| localStorage keys | `mars-*` | `${shortName}-*` |
| Meta tags / OG | Mars-specific | Generic paracosm branding |
| Server endpoint | none | `GET /scenario` returns client payload |
