# F15 — Event-log filter bar

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** dashboard-only, limited to `EventLogPanel`. Independent of F9-F14.

---

## Motivation

The Event Log tab today supports a single filter: `#log=<tool>` substring match on forge tool names, set by the ToolboxSection CTA. Users with a 1000+ event stream can't find "that one commander decision about food" or "dept_done events for the medical department" without scrolling the full list. URL-param-only filtering is discoverable to nobody except the ToolboxSection click path.

F15 adds a visible toolbar at the top of the Event Log tab with:
1. **Free-text search** across event type, leader, department, title, summary
2. **Event-type checkboxes** — toggle individual types on/off (all on by default)
3. **Leader dropdown** — all leaders, or a single leader
4. **Turn range slider** — when max turn > 3, constrain events to `[minTurn, maxTurn]`

Filter state persists in URL query params so a filtered view is a shareable link. The existing `#log=<tool>` hash filter continues to work.

---

## Architecture

**Pure helpers** in `components/log/EventLogPanel.helpers.ts`:

```ts
export interface LogFilters {
  query: string;              // free-text, lowercased on compare
  types: Set<string>;         // event types to include; empty = all
  leader: string | null;      // single-leader filter; null = all
  turnRange: [number, number] | null;  // null = no range
  toolHash: string;           // legacy #log=<tool> substring
}

export function applyLogFilters(events: SimEvent[], filters: LogFilters): SimEvent[];
export function extractAvailableFacets(events: SimEvent[]): {
  types: string[];   // unique event types, sorted alphabetically
  leaders: string[]; // unique leader names in first-seen order
  maxTurn: number;   // highest turn seen
};
export function serializeFiltersToUrl(filters: LogFilters): string;
export function parseFiltersFromUrl(search: string, hash: string): LogFilters;
```

All helpers pure, testable under `node:test`. Sibling file `EventLogPanel.helpers.test.ts` with ~20 tests covering each matcher + URL round-trip.

**Component** `components/log/EventLogFilterBar.tsx` — renders the toolbar above the event list. Reads/writes filter state through a single `LogFilters` object passed in as a prop, bubbles changes through a `onFiltersChange` callback. The parent `EventLogPanel` owns the state + URL sync.

**State ownership.** `EventLogPanel` has a `useState<LogFilters>` initialized from `parseFiltersFromUrl(window.location.search, window.location.hash)`. Every change updates state + pushes to URL via `history.replaceState` so refreshes preserve the filter. Back/forward works because replaceState doesn't stack entries.

**URL shape.**
- `?logQuery=food` — free-text (empty when blank)
- `?logTypes=turn_start,dept_done` — comma-separated included types
- `?logLeader=Aria%20Chen` — single leader
- `?logTurnMin=3&logTurnMax=6` — turn range
- `#log=radiation_calc` — legacy tool hash (unchanged)

Omitted params mean "no filter on that axis". `?logTypes=` with an empty value means "all types". Parameters accumulate non-destructively (filter state serialized only when user touches the bar).

---

## Matching rules

**Free-text query.** Case-insensitive substring match across:
- `event.type`
- `event.leader`
- `String(event.data?.title)`
- `String(event.data?.summary)`
- `String(event.data?.department)`
- `String(event.data?.name)` (tool name)

Match is OR across these fields (any field hit → event passes). Empty query matches all.

**Type checkbox set.** When the set is empty, all types pass. When non-empty, only events with `type ∈ set` pass. The checkbox UI default is "all checked"; unchecking a type effectively shrinks the included set.

Slight UI wrinkle: an empty-set meaning "all" maps to UI "all checked". Handled in `EventLogFilterBar` — when a user clicks the last checked box, we don't let the set go empty (would then mean all, which isn't what unchecking last should mean). Instead we flip to "none checked = no events" and show an empty-state message. The reset button clears the filter.

**Leader dropdown.** `null` = all leaders. A specific name restricts to events whose `leader` matches exactly. Events without a leader field are included only when `leader === null`.

**Turn range.** Inclusive on both ends. Events without a `data.turn` field pass only when the full range is absent. When `maxTurn <= 3`, the slider is hidden entirely (not useful).

**Legacy tool hash.** Matches events where `data.name` or any entry in `data.forgedTools[*].name` contains the substring (case-insensitive). Behavior preserved from today.

---

## Files

**New.**
- `src/cli/dashboard/src/components/log/EventLogPanel.helpers.ts` (~140 lines; matchers, facet extraction, URL round-trip)
- `src/cli/dashboard/src/components/log/EventLogPanel.helpers.test.ts` (~150 lines; per-matcher + URL round-trip tests)
- `src/cli/dashboard/src/components/log/EventLogFilterBar.tsx` (~180 lines; toolbar UI)
- `src/cli/dashboard/src/components/log/EventLogFilterBar.module.scss` (~120 lines; SCSS module)

**Modified.**
- `src/cli/dashboard/src/components/log/EventLogPanel.tsx` — replace ad-hoc `logFilter` logic with `applyLogFilters` helper; own `LogFilters` state; sync to URL; render `<EventLogFilterBar>`.
- `src/cli/dashboard/src/components/log/EventLogPanel.module.scss` — expand `header` layout for toolbar.

---

## UI spec

```
╭─ Event Log (42 of 1024 events) ─────────── [Reset filters] ╮
│                                                            │
│  🔍 [Search type/leader/dept/title...        ]            │
│                                                            │
│  Types: ☑turn_start ☑dept_done ☐outcome ☑drift ... (8)    │
│  Leader: [All ▼]    Turns: [====●───────●====] T3–T6      │
│                                                            │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  000  turn_start  Aria   T1  ...                           │
│  001  dept_done   Aria   T1  medical                       │
│  ...                                                       │
╰────────────────────────────────────────────────────────────╯
```

Styling via SCSS module (standing rule). Collapses gracefully at narrow widths: types wrap, leader dropdown shrinks, slider takes full width below the search row.

---

## Rollout sequence

1. RED: helper tests — `applyLogFilters` per-axis, `extractAvailableFacets`, URL round-trip
2. GREEN: helpers
3. `EventLogFilterBar` component + SCSS module
4. Refactor `EventLogPanel` to use filters state + URL sync
5. Preserve legacy `#log=<tool>` hash filter by merging it into the `LogFilters` object on parse
6. Manual smoke: load a saved run, try each filter axis, share the URL to another tab + verify restore
7. CodeRabbit review

---

## Testing

**Unit: applyLogFilters**
- Empty filter → full events array
- Query "food" → events where title/summary/type includes "food"
- Type set {turn_start} → only turn_start events
- Leader "Aria" → only events with leader='Aria' (+ events without leader excluded)
- Turn range [2, 4] → events with data.turn in [2,4] (events without turn excluded when range set)
- Tool hash → unchanged behavior from today
- All filters combined → intersection applies

**Unit: extractAvailableFacets**
- Empty events → empty types, empty leaders, maxTurn 0
- Events with mixed types/leaders/turns → expected unique sets + max

**Unit: URL round-trip**
- Empty filter → empty URL output
- Populated filter → serializable string
- Parse output of serialize → equivalent filter (idempotent)
- Handles URL-encoded values (spaces, unicode)

**Manual smoke**
- Free-text "commander" → shows only commander-* events
- Type checkboxes → uncheck types dynamically, list shrinks
- Leader dropdown → restricts to one leader
- Turn slider → visible when maxTurn > 3, restricts range
- URL shared to another tab → filters restore identically
- Legacy `#log=<tool>` set via ToolboxSection click → still works, shown as a read-only chip in the toolbar

---

## Acceptance criteria

- Filter bar renders above the event list with 4 controls + reset button
- Free-text search filters in <50ms even on 5000-event runs
- Type checkboxes, leader dropdown, turn slider all update the rendered list synchronously
- Filter state persists across refresh via URL params
- Legacy `#log=` hash filter continues to work + shows in the bar as a read-only chip with its own clear control
- `EventLogPanel.helpers.test.ts` passes 100%
- Existing 177 dashboard tests still pass
- CodeRabbit review: zero findings
- No inline styles; SCSS module throughout

---

## Out of scope

- **Regex search.** Substring match only in v1; a regex toggle could come later.
- **Save + recall named filter presets.** Likely future: "My dept-analysis filter" saved to localStorage. F16-adjacent.
- **Export filtered events as CSV.** Tracked under audit F17.
- **Keyboard shortcut to focus search.** `/` is the web convention; F18 accessibility audit follow-up.

---

## Risks + notes

- **URL bloat.** A filter touching all four axes produces a ~150-char query string. Fine on desktop; possibly truncated by some mobile browser URL bars. Acceptable tradeoff for shareability.
- **Perf on giant logs.** 10k-event runs are the upper bound; `applyLogFilters` is O(N) with cheap per-event checks. React re-renders only the visible list via the existing `<details>`-based pattern; no virtualization needed for the ranges we ship today.
- **Type-set "empty means all" rule.** Could confuse — a user unchecking every box might expect "show nothing" rather than "show everything". UI disambiguation: once a box is unchecked, unchecking more reduces; unchecking the last one shows an explicit empty-state message "No types selected. Check at least one, or press Reset."
- **Filter bar + legacy hash chip.** Both can coexist (URL with both `?logTypes=...` and `#log=...`). Clear semantics: URL params filter "within" the hash-tool subset.
