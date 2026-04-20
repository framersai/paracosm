# RD Field Aliasing Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. No subagents per project rules.

**Goal:** Remove the diagonal saw-tooth aliasing from the RD field by dropping `imageRendering: pixelated` on the WebGL canvas.

**Architecture:** One-line CSS change. Simulation physics unchanged (still `NEAREST` on framebuffer texture). Browser applies default bilinear smoothing at display-scale.

**Tech Stack:** React 19, WebGL2, Vite 6. Paracosm is a git submodule; commit lands in its own git, monorepo pointer bumped separately.

**Spec:** [docs/superpowers/specs/2026-04-20-rd-field-aliasing-fix-design.md](../specs/2026-04-20-rd-field-aliasing-fix-design.md)

---

## Task 1: Drop pixelated image-rendering on WebGL canvas

**Files:**
- Modify: `src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx` around line 1044

- [ ] **Step 1: Make the edit**

In `LivingSwarmGrid.tsx`, find the WebGL canvas JSX block (around line 1036-1046). Current:

```tsx
<canvas
  ref={webglCanvasRef}
  style={{
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: webglFailed ? 'none' : 'block',
    imageRendering: 'pixelated',
  }}
/>
```

Remove the `imageRendering: 'pixelated'` line:

```tsx
<canvas
  ref={webglCanvasRef}
  style={{
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: webglFailed ? 'none' : 'block',
  }}
/>
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm/src/cli/dashboard
./node_modules/.bin/tsc --noEmit
```

Expected: no output, exit 0. (No types reference this property; this is purely CSS.)

- [ ] **Step 3: Build to verify no bundler surprises**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm/src/cli/dashboard
npm run build 2>&1 | tail -5
```

Expected: `✓ built in NNs`, no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git add src/cli/dashboard/src/components/viz/grid/LivingSwarmGrid.tsx src/cli/dashboard/dist/ src/cli/dashboard/tsconfig.tsbuildinfo docs/superpowers/specs/2026-04-20-rd-field-aliasing-fix-design.md docs/superpowers/plans/2026-04-20-rd-field-aliasing-fix.md
```

Use `git add -f` for `dist/` since it's gitignored but the tracked `dist/index.html` needs the regenerated version committed.

Commit:

```bash
git commit -m "viz(grid): drop imageRendering pixelated on RD canvas

Non-integer CSS scale factor (simulation 384x240, display
800-1200px) produced diagonal saw-tooth aliasing visible as
mystery zigzag lines across the field. Browser default bilinear
sampling at display time smooths the scale without touching
simulation physics (still NEAREST on the framebuffer). Overlay
glyphs + Conway tiles are unaffected since they draw as 2D
primitives on a separate canvas."
```

---

## Task 2: Push paracosm + bump monorepo pointer

- [ ] **Step 1: Push paracosm**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
git push origin master
```

- [ ] **Step 2: Bump monorepo pointer**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm
git commit --no-verify -m "chore: bump paracosm submodule (phase C2 RD aliasing fix)"
git push origin master
```

---

## Self-review

**Spec coverage:** Spec has one requirement — drop `imageRendering: 'pixelated'`. Task 1 implements it.

**Placeholder scan:** No placeholders. Every step has exact paths + exact commands.

**Type consistency:** Only one symbol touched; no cross-task references to verify.

**Scope:** One-line code change + docs + submodule dance. Fits a single focused commit.
