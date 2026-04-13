# Phase 3: Dashboard Generalization Through UI Schema

**Date:** 2026-04-13
**Status:** Ready for implementation plan
**Scope:** Replace all hardcoded Mars labels, stats, presets, tooltip fields, department icons, theme colors, and copy in `main.js` and `index.html` with data driven by `ScenarioPackage` served from `GET /scenario`.
**Depends on:** Phase 2 (scenario adapter), completed and merged.

---

## 1. Goal

Make the dashboard scenario-agnostic. The server serves the active scenario's UI schema, labels, theme, presets, and department definitions via `GET /scenario`. The dashboard fetches this on load and uses it to populate every surface that currently hardcodes Mars-specific content. A different `ScenarioPackage` produces a different-looking, different-labeled dashboard without editing any HTML or JS.

---

## 2. Constraints

- No framework introduction. Dashboard stays as static HTML/CSS/JS.
- No build step. Dashboard loads with zero compilation.
- `npm run dashboard` launches Mars with identical visual behavior.
- The dashboard must handle the scenario fetch failing gracefully (fall back to hardcoded Mars defaults so the product never breaks for end users).
- SSE streaming protocol is unchanged.
- Save/load/replay/report flows are unchanged.
- All existing tests pass.

---

## 3. Coupling Points in the Dashboard

82 Mars-specific references in `main.js`, 66 in `index.html`. They fall into these categories:

### 3.1 Stat header labels and formatting

The stats bar hardcodes Population, Morale (%), Food (mo), Power (kW), Modules, Science, Tools, Citations. These should come from `scenario.ui.headerMetrics` with format instructions.

### 3.2 Setup presets

`SETUP_PRESETS` object hardcodes Aria Chen, Dietrich Voss, Maya Torres, etc. with Mars-specific colony names, HEXACO profiles, and instructions. These should come from `scenario.presets`.

### 3.3 Department names and icons

Department selects, icons, and labels are hardcoded to medical/engineering/agriculture/psychology/governance/science. These should come from `scenario.departments`.

### 3.4 Tooltip fields

Colonist tooltips show bone density, radiation, psych score, Mars-born status. These should come from `scenario.ui.tooltipFields`.

### 3.5 Theme colors

CSS variables for the Mars red/orange theme are inline in `index.html`. These should come from `scenario.theme.cssVariables`.

### 3.6 Copy and branding

"Mars Genesis", "Mars colony", "colony", "colonist", "Mars-born", "life on Mars" appear throughout both files. These should use `scenario.labels` (name, populationNoun, settlementNoun).

### 3.7 Provider model defaults

`PROVIDER_DEFAULT_MODELS` in main.js duplicates what's in `sim-config.ts`. Should come from the scenario or remain server-side (already correct since setup POST goes to server).

---

## 4. Architecture

### 4.1 New endpoint: `GET /scenario`

The server adds a `GET /scenario` endpoint that returns a JSON subset of the active `ScenarioPackage`: labels, theme, departments, presets, ui, policies, and setup defaults. This is a lightweight projection, not the full package (hooks and knowledge are not serializable/needed client-side).

```typescript
interface ScenarioClientPayload {
  id: string;
  version: string;
  labels: ScenarioLabels;
  theme: ScenarioTheme;
  setup: ScenarioSetupSchema;
  departments: Array<{ id: string; label: string; role: string; icon: string }>;
  presets: ScenarioPreset[];
  ui: ScenarioUiDefinition;
  policies: { toolForging: boolean; bulletin: boolean; characterChat: boolean };
}
```

### 4.2 Dashboard fetch on load

`main.js` calls `fetch('/scenario')` during initialization. On success, it stores the result as `window.SCENARIO` and uses it everywhere. On failure (network error, old server without the endpoint), it falls back to a hardcoded Mars default object so the dashboard never breaks.

### 4.3 Replacement strategy

Each hardcoded value gets replaced with a read from `window.SCENARIO`:

| Hardcoded | Replacement |
|-----------|-------------|
| "Mars Genesis" | `SCENARIO.labels.name` |
| "colony" | `SCENARIO.labels.settlementNoun` |
| "colonist" | `SCENARIO.labels.populationNoun` |
| Stat labels | `SCENARIO.ui.headerMetrics` |
| Department selects | `SCENARIO.departments` |
| Department icons | `SCENARIO.ui.departmentIcons` |
| Tooltip fields | `SCENARIO.ui.tooltipFields` |
| Theme CSS variables | `SCENARIO.theme.cssVariables` |
| Setup presets | `SCENARIO.presets` |
| Setup form sections | `SCENARIO.ui.setupSections` |
| Feature toggles (bulletin, chat) | `SCENARIO.policies` |

### 4.4 Theme injection

On scenario load, inject `scenario.theme.cssVariables` as a `<style>` block in `<head>` overriding the defaults. The existing Mars CSS variables become the fallback.

---

## 5. Files Changed

### Server-side
| File | Change |
|------|--------|
| `src/server-app.ts` | Add `GET /scenario` endpoint serving `ScenarioClientPayload` |

### Dashboard
| File | Change |
|------|--------|
| `src/dashboard/main.js` | Fetch `/scenario`, replace all hardcoded Mars references with `SCENARIO.*` reads |
| `src/dashboard/index.html` | Replace hardcoded Mars titles/labels with placeholder elements populated by JS, move theme CSS to fallback |

---

## 6. Testing Strategy

### 6.1 Server test

Add test for `GET /scenario` returning valid JSON with expected shape.

### 6.2 Dashboard syntax check

Existing `node --check src/dashboard/main.js` continues to pass.

### 6.3 Manual verification

After implementation, `npm run dashboard` must produce visually identical output to the current Mars dashboard. The labels, colors, stats, presets, and tooltips should look the same because the server serves Mars scenario data.

---

## 7. Fallback Behavior

The dashboard must never break if the `/scenario` endpoint is unavailable. The fallback object in `main.js` contains the current Mars defaults: labels, theme, presets, departments, UI config. This means the dashboard degrades gracefully to the current behavior.

---

## 8. What Does NOT Change

- SSE protocol and event types
- Save/load/replay/report JSON format
- Rate limiting
- Chat endpoint
- Setup POST payload format
- File structure (no new files except possibly a small scenario projection helper)

---

## 9. Acceptance Criteria

1. `GET /scenario` returns valid `ScenarioClientPayload` JSON.
2. Dashboard fetches scenario on load and populates all surfaces from it.
3. Zero hardcoded "Mars", "colony", "colonist", "Mars-born" strings in rendering paths of `main.js` (they may exist in the fallback object).
4. Changing `scenario.labels.name` on the server produces a different title in the dashboard.
5. Changing `scenario.theme.cssVariables` produces different colors.
6. Changing `scenario.presets` produces different setup form defaults.
7. Changing `scenario.departments` produces different department selects and icons.
8. Dashboard gracefully falls back to Mars defaults if `/scenario` fetch fails.
9. `npm run dashboard` produces visually identical Mars experience.
10. All existing tests pass plus new `GET /scenario` endpoint test.
