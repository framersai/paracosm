# Mars Genesis: Next Session Handoff

## Repos

| Repo | URL | Purpose |
|------|-----|---------|
| mars-genesis-simulation | `apps/mars-genesis-simulation/` · [github.com/framersai/mars-genesis-simulation](https://github.com/framersai/mars-genesis-simulation) | The standalone simulation + dashboard |
| agentos | `packages/agentos/` · [github.com/framersai/agentos](https://github.com/framersai/agentos) | Core runtime (agent(), EmergentCapabilityEngine, etc.) |
| agentos.sh | `apps/agentos.sh/` · [github.com/framersai/agentos.sh](https://github.com/framersai/agentos.sh) | Marketing site |
| agentos-live-docs | `apps/agentos-live-docs/` · [github.com/framersai/agentos-live-docs](https://github.com/framersai/agentos-live-docs) | docs.agentos.sh |
| monorepo | [github.com/manicinc/voice-chat-assistant](https://github.com/manicinc/voice-chat-assistant) | Parent monorepo, all of the above are submodules |

## What Works Right Now

### Simulation Engine (fully working)
- Deterministic kernel with seeded RNG (Mulberry32)
- 100 colonists generated from seed with random HEXACO profiles
- Between-turn progression: aging, births, deaths, careers, bone density, radiation
- Personality drift: leader pull, role pull, outcome pull (3 forces)
- Commander promotes department heads from colonist roster (Turn 0)
- 5 department agents (medical, engineering, agriculture, psychology, governance)
- EmergentCapabilityEngine wired: agents forge tools, judge reviews, approved tools execute
- Outcome classification: risky_success/failure, conservative_success/failure
- Research packets: curated citations with DOIs for all 12 turns
- Parallel simulation: both leaders run via Promise.all

### Dashboard (partially working, needs fixes)
- SSE server at localhost:3456 streams simulation events to browser
- Mars theme (onyx/rust/amber/teal color palette)
- Leader showcase with ASCII trait bars and sparklines
- Two mirrored columns for side-by-side comparison
- Timeline section (two columns, color-coded)
- Tab bar: Simulation view / Debug Log view
- About page at /about with ecosystem links and team contacts

### Config System (scaffolded, not wired)
- `config.example.yaml` with custom leaders, HEXACO, timeline, custom events, models
- Not yet loaded by the orchestrator

## What's Broken / Needs Fixing

### Critical Dashboard Issues
1. **Department summaries show raw LLM output.** "Decision: choose Option A, Arcadia Planitia" and raw JSON fragments. The `cleanSummary()` function in `src/agents/orchestrator.ts` strips some prefixes but not enough. Engineering often returns raw JSON as its summary because `parseDeptReport()` fails to extract structured data from gpt-5.4-mini's response.

2. **Engineering department cards sometimes show empty content** or raw JSON like `{"department":"engineering","decision":"Arcadia Planitia","confidence":0.`. The parser at line ~155 of `src/agents/orchestrator.ts` needs to handle more edge cases.

3. **Gauge labels (POP, MORALE, FOOD, DEATHS) still too close to values** on some screen sizes. The CSS `.gl` class has `margin-bottom:4px` but may need more.

4. **Crisis banner shows raw crisis description text** instead of a clean title. The JS at line ~324 of `src/dashboard/index.html` does `(dd.crisis || '').slice(0, 120)` which cuts mid-sentence.

5. **Tool names are cryptic** (`landing_site_score_model_v2`). The `humanizeToolName()` function in orchestrator.ts helps but the dashboard should show the description more prominently than the code name.

### Features to Build

#### 1. Config File Loader (1 hour)
- Parse `config.yaml` (YAML) in `src/serve.ts`
- Pass parsed leaders, timeline, customEvents, seed to `runSimulation()`
- If no config.yaml exists, use defaults
- Install `yaml` npm package

#### 2. Custom Event Injection (2 hours)
- Add `customEvents` to `RunOptions` in orchestrator.ts
- Before each turn, check if any custom events match the current turn
- Inject custom event text into the crisis prompt as an additional section
- Tag the event as "user-injected" in the output JSON and SSE events
- Dashboard shows user-injected events with a distinct badge/color

#### 3. Web UI Setup Page (3 hours)
- New HTML page at `/setup` served by serve.ts
- Two leader panels with text inputs (name, archetype, colony) and HEXACO sliders (0-1)
- Timeline controls: turns count, start year
- Custom events section: "Add Event" button, turn number input, title, description
- Model selector dropdowns
- "Start Simulation" button that POSTs config to serve.ts and redirects to /
- serve.ts receives the config via POST and starts the simulation

#### 4. Dashboard Storytelling Overhaul (2 hours)
- Department summaries need to be max 2 sentences, action-oriented
- Strip all markdown (`**`, `##`), "I recommend", "Decision:", "Option A/B"
- Show the department's RECOMMENDATION as a highlighted action, not the analysis
- Risk badges should be color-coded circles, not text
- Forge cards need the description bigger than the code name
- Add "What happened this turn" summary at the top of each column after a turn completes
- Colonist quotes (from v3 spec) -- ask for 1 quote per column per turn based on personality + events

#### 5. Dashboard Polish (1 hour)
- Fix gauge label spacing everywhere
- Crisis banner: show only title, not description
- Loading states: "Department analyzing..." spinners
- "Turn X Complete" separator between turns in each column
- Auto-scroll to latest content in each column
- Stats bar: show delta from previous turn (▲/▼ arrows)

## Architecture Reference

```
mars-genesis-simulation/
├── src/
│   ├── kernel/                     # Deterministic engine (no LLM calls)
│   │   ├── state.ts                # Types: Colonist, HexacoProfile, SimulationState
│   │   ├── rng.ts                  # SeededRng (Mulberry32)
│   │   ├── colonist-generator.ts   # 100 colonists from seed with random HEXACO
│   │   ├── progression.ts          # Aging, births, deaths, careers, personality drift
│   │   └── kernel.ts               # SimulationKernel class: advanceTurn, applyPolicy, applyDrift
│   ├── agents/                     # Multi-agent layer (uses AgentOS)
│   │   ├── contracts.ts            # DepartmentReport, CommanderDecision, PromotionDecision
│   │   ├── departments.ts          # DEPARTMENT_CONFIGS, buildDepartmentContext, getDepartmentsForTurn
│   │   └── orchestrator.ts         # runSimulation(), SimEvent, onEvent callback, parseDeptReport, cleanSummary
│   ├── research/                   # Crisis content
│   │   ├── scenarios.ts            # 12 crises with riskyOption, riskSuccessProbability
│   │   └── research.ts             # Curated research packets with DOIs per turn
│   ├── dashboard/                  # Frontend
│   │   ├── index.html              # Main dashboard (Mars theme, SSE client, tabs)
│   │   └── about.html              # About page with ecosystem links
│   ├── types.ts                    # Shared types (Scenario, ColonySnapshot, etc.)
│   ├── run-visionary.ts            # Entry: Aria Chen
│   ├── run-engineer.ts             # Entry: Dietrich Voss
│   └── serve.ts                    # HTTP + SSE server, serves dashboard + runs simulations
├── config.example.yaml             # Example config for custom leaders/events
├── output/                         # JSON run artifacts (gitignored except .gitkeep)
├── assets/                         # Logo PNGs
├── package.json                    # @framers/agentos ^0.1.211, tsx, typescript
└── README.md                       # Full documentation with architecture, crises, drift model
```

## Key Technical Details

### AgentOS APIs Used
- `agent()` from `@framers/agentos` -- creates commander + department agents with HEXACO personality
- `generateText()` -- used by EmergentJudge for tool review LLM calls
- `EmergentCapabilityEngine` -- orchestrates forge pipeline (build → test → judge → register)
- `EmergentJudge` -- LLM-as-judge for safety + correctness review
- `EmergentToolRegistry` -- stores forged tools by tier
- `ForgeToolMetaTool` -- ITool that agents call to forge new tools
- `ComposableToolBuilder` -- chains existing tools into pipelines
- `SandboxedToolForge` -- isolated V8 execution for sandbox-mode tools

### Known Gotchas
- **OpenAI gpt-5.4-mini sends `implementation.mode: "code"` instead of `"sandbox"`**. The wrapper in orchestrator.ts normalizes this.
- **OpenAI sends nested JSON as strings**. The wrapper parses `implementation`, `inputSchema`, `outputSchema`, `testCases` from strings.
- **EmergentJudge rejects tools missing input validation**. The wrapper sets permissive schemas (`additionalProperties: true`) to avoid false rejections.
- **`EmergentJudgeConfig` uses `promotionModel` (not `promotionJudgeModel`)**. `EmergentConfig` uses `promotionJudgeModel`. Different interfaces.
- **Personality field is `honesty` not `honestyHumility`** in the agent() API.
- **ForgeToolMetaTool context IDs don't match session IDs**. The wrapper patches `gmiId` and `sessionData.sessionId`.
- **HEXACO trait `honestyHumility` maps to `honesty` in agent() API personality config.**

### API Keys Needed
- `OPENAI_API_KEY` -- for gpt-5.4 (commander, judge) and gpt-5.4-mini (departments)
- `SERPER_API_KEY` -- for live web search (optional, research packets work without it)
  - Current key: `REDACTED_SERPER_KEY`

### Commands
```bash
cd apps/mars-genesis-simulation
npm install

# Run dashboard with 3-turn smoke test
OPENAI_API_KEY=... npm run dashboard:smoke

# Run standalone simulations
OPENAI_API_KEY=... npm run visionary
OPENAI_API_KEY=... npm run engineer

# Full 12 turns
OPENAI_API_KEY=... npm run dashboard
```

## User Feedback Summary

The user's main frustrations with the current dashboard:
1. "I have no idea what I'm looking at" -- the dashboard doesn't explain what's happening
2. "Department summaries mean nothing" -- raw LLM output shown instead of actionable summaries
3. "Text is still not readable" -- font sizes too small in places
4. "Labels too close to numbers" -- gauge styling needs spacing
5. "Engineering shows raw JSON" -- parser failure for gpt-5.4-mini responses
6. "It's not clear what tools like `landing_site_score_model_v2` do" -- needs human descriptions
7. "Both simulations should run in parallel" -- FIXED, now using Promise.all
8. "Needs a separate debug log tab" -- FIXED, tab bar added
9. "Needs an about page" -- FIXED
10. "Needs custom leaders, events, timelines" -- config.example.yaml created, loader not wired

## Design Decisions Locked In

- **Mars theme**: onyx black (#0a0806), rust (#c45a2c), amber (#d4a04a), teal (#3d8b8b)
- **Visionary = amber**, Engineer = teal (color coding throughout)
- **Host owns truth, agents own interpretation** (kernel is deterministic, agents analyze)
- **Personality drift grounded in real psychology** (Van Iddekinge 2023, Tett & Burnett 2003, Roberts 2005)
- **12 crises based on real Mars science** with DOI-linked citations
- **Parallel execution** via Promise.all for side-by-side comparison
- **Monospace font** throughout for terminal/space aesthetic
- **No co-author lines, no AI mentions in commits**

## Priority Order for Next Session

1. Fix `parseDeptReport()` to handle gpt-5.4-mini edge cases (raw JSON, empty summaries)
2. Fix `cleanSummary()` to strip all LLM cruft aggressively
3. Wire config.yaml loader into serve.ts
4. Build web UI setup page (/setup) with HEXACO sliders and event editor
5. Add custom event injection to orchestrator
6. Dashboard storytelling overhaul (turn summaries, colonist quotes, better forge cards)
7. Polish (gauge spacing, crisis banner, loading states, turn separators)
