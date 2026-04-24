# LLM-Readable World Model Positioning Plan

**Date:** 2026-04-24
**Status:** In progress
**Scope:** Documentation, package metadata, TSDoc, and public copy only. No dashboard feature work and no runtime behavior changes.

## Goal

Make Paracosm's positioning precise enough for external review:

- Paracosm is a structured counterfactual world model for AI agents.
- JSON is the canonical world contract, not the only authoring surface.
- Prompt text, briefs, documents, and URLs are first-class source material for world grounding today via `seedText` and `seedUrl`.
- A one-prompt world compiler should be the next API wrapper, but it must still emit and validate the same `ScenarioPackage` contract before simulation.

## Non-Goals

- Do not add or change dashboard fork UI.
- Do not claim `WorldModel.fromPrompt()` exists before it is implemented.
- Do not weaken the reproducibility claim by letting prompt-only input bypass schema validation, snapshots, or the deterministic kernel.
- Do not reposition Paracosm as a bottom-up swarm simulator or generative visual world model.

## Edit Plan

1. Update README and package metadata to lead with "prompt/document/URL/JSON to typed world model to forked futures."
2. Amend the positioning map and structured-world-model spec so the seven pillars distinguish authoring input from durable contract.
3. Update architecture docs, compiler CLI copy, and TSDoc so the API surface is honest: shipped path is JSON draft plus optional `seedText`/`seedUrl`; prompt-only compilation is a planned wrapper.
4. Update AgentOS docs and the public blog post so external readers see the same language.
5. Add roadmap work for `compileWorld` / `WorldModel.fromPrompt` as a product/API item, not a dashboard task.
6. Verify with targeted greps and documentation-oriented review checks.

## Success Criteria

- No public top-level surface says Paracosm is only "from JSON."
- Every "prompt" claim is paired with the canonical compiled `ScenarioPackage` contract.
- The closest research anchors are present: Xing 2025, ACM CSUR world-model survey, Kirfel et al 2025 CWSM, Yang et al 2026 TMLR LLM-based world models, Nature HSSC 2024 LLM-empowered ABM, and Gurnee/Tegmark ICLR 2024.
- Verification output and CodeRabbit status are recorded in the session handoff.
