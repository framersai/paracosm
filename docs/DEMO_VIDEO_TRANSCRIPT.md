---
title: "Mars Genesis Demo Video: Narration Transcript"
length: "2:45 target"
target: "YouTube, landing page, agentos.sh blog embed"
companion_post: "/blog/inside-mars-genesis-ai-colony-simulation"
---

# Mars Genesis Demo Video: Narration Transcript

Narration for a 2:45 screen recording of the Paracosm dashboard running a single Mars Genesis simulation. Target ~385 spoken words at 140 wpm. Record the full run at normal speed, then speed-ramp turns 2 through 4 so total video duration lands between 2:30 and 3:00 after edit.

Timestamps below assume normal-speed opening and closing with the middle turns sped up 3x. Adjust the exact ramp points to the length of your raw recording.

---

## Opening (0:00 - 0:15)

**[SHOT: dashboard at Turn 0. Two leader panels side by side, Aria Chen on the left, Dietrich Voss on the right. 30 colonists spawned per side. Seed 950 badge visible top-right.]**

**VO:** Two commanders. One seed. Thirty colonists each. Same starting roster, opposing HEXACO profiles. Watch where the two runs diverge over the next six turns.

---

## HEXACO Profiles (0:15 - 0:40)

**[CUT: zoom into both leader headers. HEXACO bars expand on each side, showing all six axes.]**

**VO:** Every agent in Paracosm carries a full HEXACO profile. Six traits, both poles, each one rewriting the prompt the agent runs on. Aria scores high Openness and low Conscientiousness. She favors novel tools and leads from the front. Dietrich scores high Conscientiousness and high Honesty-Humility. He demands evidence and works through technical channels.

---

## Turn 1: Forge (0:40 - 1:10)

**[ADVANCE to Turn 1. The Event Director card renders on both sides. Landfall milestone appears. Department analysis streams in parallel. Aria's Chief Engineer writes a landing-site scorer. An amber forge badge pops in the event log. On Dietrich's side, a teal badge fires when his own forge clears the judge.]**

**VO:** Turn one. The Event Director generates a crisis. Each department analyzes in parallel, and Aria's Chief Engineer writes a landing-site scorer on the spot. Input schema, sandboxed code, test cases. The judge approves at confidence 0.86. A leader-coloured forge badge fires in the event log. The tool is now callable by every department in the session.

---

## Reuse Economy (1:10 - 1:40)

**[SPEED RAMP 3x. Turns 2 through 4 roll by. Stats bar TOOLS and REUSE counters tick upward with per-turn deltas. Teal and amber REUSE badges fire in the event log each time a later department calls an already-forged tool.]**

**VO:** Turns two through four. Every time a department reuses a forged tool instead of writing a new one, a REUSE badge fires. Reuse is nearly free. Forging costs a judge call. Aria accepts first-pass tools and extracts ten reuses from three forges. Dietrich holds tools to a higher evidence bar, reforges three times, reuses seven. The Engineer rebuilds. The Visionary extracts more from what she has.

---

## Drilldown (1:40 - 2:05)

**[RETURN TO NORMAL SPEED. Click a featured colonist tile on the Viz tab. The 420-pixel drilldown panel slides in from the right.]**

**VO:** Click any colonist and the drilldown opens. A HEXACO radar with the colony mean overlaid. Mood trajectory across every turn, annotated with the crisis that shifted it. A family tree with clickable spouse and children thumbnails. The reactions she produced on every turn. A chat handoff that preselects her in the Chat tab.

---

## Deaths Have Causes (2:05 - 2:25)

**[CUT: Stats bar DEATHS pill on both sides. Hover reveals the breakdown chip reading, for example, "8 deaths, 3 radiation, 2 accident, 1 despair, 5 age." The two leaders show different distributions.]**

**VO:** Mortality is attributed. The kernel simulates six causes: natural, radiation, starvation, despair, fatal fracture, accident. Aria's crew dies to accidents and radiation exposure. Dietrich's crew dies to despair and age. Same seed, different deaths.

---

## Verdict (2:25 - 2:40)

**[CUT: VerdictCard renders. Headline, key divergence bullet, per-leader score bars, a short excerpt calling out the cause differences between the two colonies.]**

**VO:** At the end, the verdict LLM reads both final states and the per-leader cause breakdown. It picks a winner, writes a headline, names the turn where the runs diverged, and cites the specific causes each colony paid for.

---

## Chat and Close (2:40 - 2:55)

**[CUT: ChatPanel opens pre-selected on a surviving colonist. User types, "what do you remember about the storm." Reply streams, names crew by name, references the forged tool. Cost StatsBar visible at the bottom with total run spend.]**

**VO:** Every survivor is chat-ready. Ask about the storm. Her reply draws from the memories she actually encoded, weighted by her personality at the time. Every LLM call on screen is accounted for. Paracosm is open source. Built on AgentOS.

**[FINAL SHOT: paracosm.agentos.sh URL, npm install command, GitHub link.]**

---

## Post-Production Notes

### Speed Ramps

Mark the raw recording at these anchors and ramp between them:

| Anchor | Source timecode (approx.) | Action |
|--------|--------------------------|--------|
| Simulation start | 0:00 | Normal speed through Turn 0 and Turn 1 forge |
| After Turn 1 commander decision | ~1:30 raw | Ramp to 3x |
| After Turn 4 outcome | ~5:30 raw | Ramp back to 1x |
| Drilldown panel opens | normal speed | Drilldown, deaths chip, verdict, chat |

### Captions

Caption every on-screen element the narration references:

- HEXACO bars with trait names visible as each pole is mentioned.
- Forge badge pills with leader colour and tool name ("FORGED mars_landing_site_selector, Aria").
- Reuse badge pills when a later turn reuses a prior forge ("REUSE mars_landing_site_selector, agriculture").
- Stats bar deltas (+N tools, +M reuses, +K deaths) per turn.
- DEATHS pill cause breakdown chip on hover.
- Drilldown panel section headers (HEXACO, Mood, Family, Reactions, Chat).
- VerdictCard headline and key divergence text.
- Chat message timestamps and the colonist's name in the header.

### On-Screen Overlays

- Persistent seed badge top-right across the whole run so the seed is visibly unchanged.
- Lower-third with leader name, archetype, and HEXACO vector when the commander is first named.
- Callout arrows on the forge badge, the REUSE badge, the DEATHS cause chip, and the drilldown section transitions.
- A small "demo mode, 6 turns, 30 colonists, 3 departments" chip bottom-left matching the server's demo caps.

### Where to Add Your Own Voice

The narration reads fine verbatim at 140 wpm. Places where a personal voice lands best:

1. **0:00 - 0:08**: The cold open. Punchier in your own words is better than the scripted version.
2. **1:10 - 1:15**: As the speed ramp starts, cut in with a signpost like "while this runs, here is what the reuse economy is doing every turn."
3. **2:40 - 2:55**: Closing in your own words. End on the shortest sentence you are comfortable with.

### Captioning Timestamps

Once the recording is cut, note the exact frame timecodes for each beat and generate per-line caption cues for YouTube, social clips, and the embedded player on agentos.sh against those timings.
