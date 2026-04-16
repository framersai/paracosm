---
title: "Mars Genesis Demo Video — Narration Transcript"
length: "2-3 minutes"
target: "YouTube / landing page / agentos.sh blog embed"
---

# Mars Genesis Demo Video — Narration Transcript

This is a narration script for a screen-recorded demo of the Paracosm dashboard running Mars Genesis with two leaders side by side. It is paced for roughly 2 minutes 45 seconds of voiceover. Record the full simulation at normal speed, then speed-ramp the middle turns so total video duration comes in at 2:30-3:00 after editing.

Timestamps below assume a normal-speed opening and closing with the middle turns sped up 2-4x. Adjust the exact ramp points to the actual length of your recorded simulation. Caption the on-screen UI elements using your recording timestamps, not the ones listed here.

---

## Opening: Setup (0:00 - 0:20)

**[SHOT: full dashboard view, two panels side by side, both at Turn 0 "Promotions"]**

**VO:** Two Mars colonies. One hundred colonists each. Same crew, same seed, same year, same opening crisis. The only difference is who is in charge.

**[CUT: zoom into leader A panel, show HEXACO bars]**

**VO:** On the left, Commander Reyes. High conscientiousness, low openness. She leads by protocol.

**[CUT: zoom into leader B panel, show HEXACO bars]**

**VO:** On the right, Commander Okafor. High openness, low conscientiousness. He leads by experimentation. Same six HEXACO traits, opposite ends of the scale.

---

## Turn 0 — Promotions (0:20 - 0:40)

**[SHOT: Turn 0 promotion cards appearing, both panels]**

**VO:** Before turn one, each commander reads the HEXACO profiles of every candidate colonist and promotes their department heads. Watch the choices diverge.

**[HIGHLIGHT: department head promotion cards on both sides]**

**VO:** Reyes picks by-the-book specialists. Conscientiousness 0.9, conformance to protocol. Okafor picks unconventional candidates. Openness 0.85, willingness to improvise. The same five roles filled by five very different people, all from the same candidate pool.

---

## Turn 1 — First Crisis (0:40 - 1:00)

**[SHOT: both panels advance to Turn 1. Event Director card appears. Event title animates in on both panels with the same text.]**

**VO:** Turn one. The Event Director reads world state, forges an event, and sends identical text to both timelines. Same event, same options, same risk probability.

**[CUT: department analysis cards animate in on both panels. Watch a forge_tool card appear with a PASS verdict]**

**VO:** Each department head analyzes the event in parallel. The Chief Medical Officer forges a radiation dose calculator at runtime — JavaScript running in a sandboxed V8 isolate. The LLM judge reviews the code for safety and correctness. This one passes.

**[HIGHLIGHT: forge card PASS pill with judge confidence score]**

**VO:** Judge confidence: 0.87. The tool executes against its own test cases and returns a projected dose. That number goes into the report the commander reads.

---

## Commander Decision + Outcome (1:00 - 1:20)

**[SHOT: commander decision cards on both panels. Different selected options highlighted in different colors]**

**VO:** Reyes picks the safe option. Okafor picks the risky one. Both decisions trace back to personality: the effect registry applies a bonus for picking in alignment with your traits, so each commander's choice gets amplified.

**[CUT: outcome roll animation, delta numbers appearing. Morale and population shift]**

**VO:** The deterministic kernel rolls the outcome. Reyes gets a conservative success. Okafor gets a risky success. Different deltas applied to morale, food, power, infrastructure.

---

## Sped-Up Middle (1:20 - 2:00)

**[SPEED RAMP: 3-4x playback from here. Show turns 2 through 5 flowing by on both panels. Agent reactions stream in. Bulletin posts appear. The Toolbox tab accumulates new forged tools.]**

**VO:** Each turn, the colony's one hundred agents react in parallel on a cheap model. Their moods roll up into the next Event Director prompt, so a scared colony sees different events than a hopeful one. Forged tools get reused when the same analysis applies again — medical reuses its dose calculator, engineering reuses its load analyzer. Reuses are nearly free. Failed forges cost morale and power.

**[CUT: viz tab open, showing cellular automaton of colonists. Divergence overlay ON. Agents alive in one timeline but dead in the other pulse with a highlight]**

**VO:** The Colony Visualization tab renders every colonist as a cell, colored by department. Turn on the divergence overlay and you can see the exact agents who survived in Reyes's timeline but died in Okafor's, and vice versa. Same seed, same starting roster, different fates.

**[CUT: HEXACO trajectory chart for promoted department heads. Traits drifting visibly across turns]**

**VO:** Department heads' personality traits drift turn by turn under three forces: leader pull toward the commander, role pull toward their department's profile, and outcome pull from what their decisions produce. By turn five, Okafor's engineers are measurably more open than Reyes's, even though they started at the same baseline.

---

## Final Turn + Report (2:00 - 2:30)

**[RETURN TO NORMAL SPEED. Both panels at Turn 6, final Legacy Assessment crisis visible]**

**VO:** Turn six. The Legacy Assessment. Earth asks each commander to report on what fifty years of leadership produced.

**[CUT: Reports tab on both panels, scroll through the citation catalog]**

**VO:** Every department report carries citations back to the scenario's knowledge bundle — real Mars radiation data, bone density studies, crew isolation research. The orchestrator guarantees provenance: when the LLM forgets to cite, the research packet's facts get attached to the report anyway.

**[CUT: Fingerprint tab showing the timeline fingerprint vector for both leaders]**

**VO:** The timeline fingerprint captures each colony's trajectory: resilience, innovation index, risk style, decision discipline, tool count. Reyes: high decision discipline, low innovation. Okafor: high innovation, low resilience. Numerical. Comparable. Reproducible from the seed.

---

## Closing + CTA (2:30 - 2:50)

**[SHOT: cost StatsBar at bottom, showing actual per-run spend]**

**VO:** Total cost of the run, accounted across every director call, every department analysis, every judge review, every agent reaction: right there in the stats bar. No surprises.

**[CUT: chat tab, open a conversation with a Mars-born agent who survived on one side]**

**VO:** And after the simulation ends, every agent is chat-ready. Ask the Mars-born engineer who lived through both commanders' decisions what it was like. Their memory contains every crisis, every reaction, every relationship they formed across the run.

**[FINAL SHOT: paracosm.agentos.sh URL, github link, npm install command]**

**VO:** Paracosm. Open source. Built on AgentOS. Run two leaders, or twenty. The engine does not care who they are. It cares how they decide.

---

## Post-Production Notes

### Speed Ramps

Mark the raw recording with these anchor points and speed-ramp between them:

| Anchor | Source timecode (example, adjust to your recording) | Action |
|--------|------|--------|
| Simulation start | 0:00 | Normal speed through turn-0 promotions |
| After turn 1 outcome | ~1:45 | Ramp to 3x |
| Turn 5 complete | ~6:30 | Ramp back down to 1x |
| Final report visible | ~7:15 | Normal speed to end |

### Captions

Caption every on-screen element the narration references:

- HEXACO bars (name each trait as it is mentioned)
- "Promotion" card labels (use the candidate name and score)
- "forge_tool" verdict pills (show "PASS conf 0.87" or "FAIL — reason")
- Outcome labels ("risky_success", etc.)
- Fingerprint dimension names

### On-Screen Overlays

- Lower-third with commander name, archetype, and HEXACO vector whenever a commander is mentioned.
- Callout boxes pointing at specific UI elements when the narration names them.
- Persistent tiny badge top-right showing the seed value (proves nothing changed between runs).

### Where to Add Your Own Voice

The narration is written to be spoken in your own voice. Use the transcript verbatim where it reads smoothly, and paraphrase wherever your cadence differs. Specific places where inserting your own voice lands best:

1. **0:00 - 0:08**: Open with the "two colonies, one seed" hook in your own words. Punchier than whatever I wrote is always better here.
2. **1:20 - 1:30**: As the speed ramp starts, break in with a casual one-liner like "while this is running, here is what is actually happening turn by turn." Helps signpost the time compression.
3. **2:30 - 2:45**: Closing CTA in your own words. End on the shortest possible sentence you are comfortable with.

### Captioning Timestamps

When you finish the recording, note the exact frame timecodes for each of these beats and send them back. I'll generate per-line caption cues matched to your actual timing, styled for YouTube, social clips, and the embedded player on agentos.sh.
