# Setup Page + Config UI Design

**Date:** 2026-04-12
**Status:** Superseded by the `/sim` dashboard architecture

> Historical design note: the live implementation no longer serves a standalone `/setup` HTML page. `GET /setup` now redirects to `/sim?tab=settings`, and `POST /setup` returns a `/sim` redirect payload for the SPA dashboard.

## Overview

A setup page at `/setup` that lets users configure leaders, HEXACO traits, simulation settings, custom events, API keys, and models before running. Presets for quick launch. Server reads `.env` for defaults.

## Routes

- `GET /setup` — serves setup HTML with current config pre-populated from env/defaults
- `POST /setup` — receives config JSON, starts simulation, redirects to `/`
- `GET /` — dashboard (existing)

## Setup Form Sections

### 1. Presets (top dropdown)

- "Default (Visionary vs Engineer)" — current Aria/Dietrich config
- "Balanced Founders" — moderate HEXACO profiles (all ~0.5)
- "High Risk vs Ultra Cautious" — extreme openness gap
- "Custom" — blank slate

Selecting a preset fills all fields. Users can tweak after.

### 2. Leaders (two panels side-by-side)

Per leader:
- Name (text input)
- Archetype (text input, e.g. "The Visionary")
- Colony name (text input)
- HEXACO sliders: O, C, E, A, Em, HH — range 0-1, step 0.01, labeled with full trait names
- Instructions (textarea, system prompt for commander)

### 3. Simulation Settings

- Turns (number input, 1-12, default 12)
- Seed (number input, default 950)
- Custom events table:
  - "Add Event" button
  - Each row: Turn (number), Title (text), Description (textarea)
  - Remove button per row

### 4. API & Models

- OpenAI API Key (password input, pre-filled from server env, shown masked)
- Commander model (select: gpt-5.4, gpt-4o, gpt-4o-mini)
- Department model (select: gpt-5.4-mini, gpt-4o-mini)
- Judge model (select: gpt-5.4, gpt-4o)

### 5. Launch

- "Start Simulation" button — POSTs config, redirects to dashboard

## Server Changes (serve.ts)

- Read `.env` on startup for `OPENAI_API_KEY` default
- `GET /setup` serves `src/dashboard/setup.html`
- `POST /setup` parses JSON body, validates, stores config in memory, sets API key in process.env, starts simulation, returns `{ redirect: "/" }`
- Pass parsed config to `runSimulations()` instead of hardcoded leaders/personnel

## Files

- Create: `src/dashboard/setup.html`
- Create: `src/dashboard/.env.example`
- Modify: `src/serve.ts` — add routes, config parsing, env reading
- Modify: `src/agents/orchestrator.ts` — accept model config in RunOptions

## Styling

Same Mars theme as dashboard. Dark background, amber/teal/rust palette, Inter + monospace fonts.
