# Multi-Event Turns

**Date:** 2026-04-15
**Status:** Planned

## Concept

The Event Director generates 1-3 events per turn instead of exactly 1. Each event goes through the full department analysis and commander decision pipeline sequentially. Events within a turn see cumulative state: Event 2's departments analyze the world changed by Event 1's outcome. Agent reactions happen once at the end of the turn, reacting to all events.

## Why

A single event per 4-year span is artificially limiting. Real worlds have multiple concurrent developments. A dust storm, a water contamination, and a first birth can all happen in the same period. Sequential processing means Event 2 hits a world already changed by Event 1, creating cascading pressure that makes simulations dramatically richer.

## Event Director Changes

### New return type

The director's `generateEvent` method returns a batch:

```typescript
interface DirectorEventBatch {
  events: DirectorEvent[];       // 1 to maxEventsPerTurn events
  pacing: 'calm' | 'normal' | 'intense';  // for dashboard display
  reasoning: string;             // why this many (logged, not shown to commander)
}
```

Backward compatibility: if the LLM returns a single event object (not wrapped in `events` array), the parser wraps it in `{ events: [event], pacing: 'normal', reasoning: '' }`.

### Event count decision

The director prompt changes from "Generate an event" to "Generate 1 to {maxEventsPerTurn} events for this turn." The prompt instructs the director to consider:

- World stability: low morale + low resources + recent failures = more events
- Narrative pacing: avoid 3 intense events every turn, vary the rhythm
- Prior turn intensity: if last turn had 3 events, consider 1-2 this turn
- Turn position: early turns use fewer events for ramp-up, middle turns peak

The director decides the count. No separate LLM judge call for this.

### Milestone turns

Turn 1 and the final turn remain single-event milestones from `sc.hooks.getMilestoneEvent`. Multi-event batches only apply to emergent turns (turns 2 through N-1).

## Scenario Configuration

```typescript
interface ScenarioSetupSchema {
  // ... existing fields ...
  /** Maximum events the Event Director can generate per turn. Default: 3 */
  maxEventsPerTurn?: number;
}
```

Mars Genesis: `maxEventsPerTurn: 3` (default).
Lunar Outpost: `maxEventsPerTurn: 2` (smaller crew, shorter scenario).

## Orchestrator Turn Loop

### Current loop (single event)

```
for each turn:
  generate 1 event
  kernel advance (births, deaths, aging)
  departments analyze
  commander decides
  outcome + effects
  agent reactions
  memory consolidation
```

### New loop (multi-event)

```
for each turn:
  kernel advance (once, before any events)
  
  if milestone turn:
    events = [milestone event]
  else:
    events = director.generateEventBatch(context, maxEventsPerTurn)
  
  for each event in events:
    emit event_start SSE
    departments analyze in parallel (see cumulative state)
    commander decides
    outcome classified
    effects applied to kernel state
    event recorded in eventHistory
    department memory updated
  
  agent reactions (once, all alive agents, reacting to full turn)
  memory consolidation
  personality drift
  emit colony_snapshot
  emit turn_done
```

Key invariants:
- Kernel time progression (births, deaths, aging) happens once per turn, before events.
- Event outcomes modify colony metrics (morale, food, power, etc.) but don't trigger births/deaths.
- Department agents see cumulative state from prior events in the same turn (the kernel state is updated after each event's outcome).
- Agent reactions happen once per turn, not per event. The reaction prompt includes all events from the turn.
- `colony_snapshot` for the VIZ tab emits once per turn with the final state.

## SSE Protocol

### New event type: `event_start`

```typescript
{
  type: 'event_start',
  leader: string,
  data: {
    turn: number,
    year: number,
    eventIndex: number,      // 0-based
    totalEvents: number,     // how many events this turn
    title: string,
    description: string,
    category: string,
    emergent: boolean,
    turnSummary: string,
    pacing: 'calm' | 'normal' | 'intense',
  }
}
```

The existing `turn_start` continues to emit once per turn with colony state, births, deaths. The new `event_start` emits once per event within the turn.

Full SSE sequence for a 3-event turn:
```
turn_start      (turn=3, colony state, births, deaths)
event_start     (eventIndex=0, totalEvents=3, "Dust Storm")
dept_start      (engineering)
dept_done       (engineering, summary, tools)
dept_start      (medical)
dept_done       (medical, summary)
commander_decided  (decision for Dust Storm)
outcome         (risky_success)
event_start     (eventIndex=1, totalEvents=3, "Water Contamination")
dept_start      (agriculture)
dept_done       (agriculture, summary)
dept_start      (medical)
dept_done       (medical, summary)
commander_decided  (decision for Water Contamination)
outcome         (conservative_failure)
event_start     (eventIndex=2, totalEvents=3, "First Mars-Born")
dept_start      (psychology)
dept_done       (psychology, summary)
commander_decided  (decision)
outcome         (conservative_success)
agent_reactions (all alive agents react to full turn)
colony_snapshot (final state)
turn_done       (turn=3)
```

## Dashboard Changes

### useGameState

Add to `SideState`:

```typescript
interface EventInfo {
  eventIndex: number;
  totalEvents: number;
  title: string;
  category: string;
}

interface SideState {
  // ... existing fields ...
  currentEvents: EventInfo[];  // events within current turn
}
```

Process `event_start` events to populate `currentEvents`. Reset at each `turn_start`.

### CrisisHeader

Currently shows one crisis title. Update to show event index: "Event 1/3: Dust Storm" with the crisis description. Updates as each `event_start` arrives.

### Timeline

Timeline cards show the turn with sub-events listed:
```
T3 2045
  1. Dust Storm [RISKY WIN]
  2. Water Contamination [SAFE LOSS]
  3. First Mars-Born [SAFE WIN]
```

### EventCard

Each `event_start` becomes a visual separator in the event list: a header card showing "EVENT 1/3: Title" with category badge.

### Toast notifications

One toast per `event_start`, not per turn. Uses the existing deduplication by `dedupeKey = crisis-${turn}-${eventIndex}`.

## Cost Impact

With 2-3 events per turn instead of 1:
- Director calls: 1 per turn (generates batch in one call). No change.
- Department calls: 2-3x per turn (one set per event). The main cost increase.
- Commander calls: 2-3x per turn (one per event).
- Agent reactions: 1x per turn. No change.
- Research retrieval: 2-3x per turn (one per event).

Estimated cost increase: 2-2.5x per simulation. A 12-turn Mars Genesis sim goes from ~$2 to ~$4-5 at gpt-5.4 pricing. Agent reactions (100+ calls at gpt-4o-mini) remain the bulk of the call count but are cheap.

## Files Modified

| File | Change |
|------|--------|
| `engine/types.ts` | Add `maxEventsPerTurn` to `ScenarioSetupSchema` |
| `runtime/director.ts` | New `generateEventBatch` method, updated prompt, batch parser |
| `runtime/orchestrator.ts` | Inner event loop, cumulative state, batch reactions |
| `runtime/contracts.ts` | Add `DirectorEventBatch` type |
| `cli/sim-config.ts` | Default `maxEventsPerTurn: 3` |
| `engine/mars/scenario.json` | Add `maxEventsPerTurn: 3` |
| `engine/lunar/scenario.json` | Add `maxEventsPerTurn: 2` |
| `dashboard/hooks/useGameState.ts` | Process `event_start`, track `currentEvents` |
| `dashboard/components/sim/CrisisHeader.tsx` | Show event index |
| `dashboard/components/sim/EventCard.tsx` | Event separator card |
| `dashboard/components/sim/Timeline.tsx` | Sub-event display |
| `dashboard/App.tsx` | Toast per event_start |
