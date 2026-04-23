# F13 — URL-param load (`?load=<url>`)

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** dashboard-only. Natural extension of the JSON-load UX bundle. Depends on [F9](./2026-04-22-f9-json-load-preview-modal-design.md) (`useLoadPreview.openFromFile`) and [F11](./2026-04-22-f11-schema-version-gate-design.md) (`parseFile` + migration chain) being landed. Independent of F10 / F12.

---

## Motivation

Paracosm runs are shareable artifacts today via download + re-pick flow: user A runs a sim, clicks SAVE, uploads the JSON somewhere, sends user B a link, user B downloads the file, opens the dashboard, uses LOAD to pick it. Friction-heavy for a simple goal ("show me the run you're talking about").

F13 adds `?load=<url>` query param support so a single link opens the run directly. On mount, the dashboard detects the param, fetches the JSON, wraps the response in a `File`, and hands it to `useLoadPreview.openFromFile` — the F9 preview modal appears, and confirming loads the run as if the user had picked it from disk.

Use cases:
- Blog / case-study embeds: "Click here to replay the Mars run I wrote about"
- CI artifact sharing: paracosm runs on CI, uploads to S3, the link replays the run
- Bug reports: reproduce a specific run by URL
- Reviewer walkthroughs: a PR adds a run-capture fixture; link from the PR description opens it

---

## Architecture

**One new hook.** `hooks/useLoadFromUrl.ts` — owns the URL-param detection + fetch + File-wrap + hand-off. Fires once on mount (same lifecycle slot as `useReplaySessionId`).

**Pure helpers** in `hooks/useLoadFromUrl.helpers.ts`:
- `parseLoadUrlParam(href: string) → { ok: true; url: URL } | { ok: false; reason: 'missing' | 'malformed' | 'unsupported-scheme' }`
- `deriveFileNameFromUrl(url: URL) → string` — last path segment, default `'remote-run.json'`
- `isCrossOrigin(url: URL, current: string) → boolean`

**Flow:**

```
on mount (App):
  parseLoadUrlParam(window.location.href)
    │
    ├──► ok: false → no-op (no param, or malformed)
    │
    └──► ok: true, url →
         isCrossOrigin(url, window.location.href)?
           │
           ├──► no  → fetchAndOpen(url)
           │
           └──► yes → toast info "Loading from <host>..." → fetchAndOpen(url)
                      (visible signal; no confirm modal in v1 — browser CORS
                       is the real guard, and the user opted in by clicking)

fetchAndOpen(url):
  setLoading(true)
  fetch(url, { signal: AbortSignal.timeout(30_000) })
    │
    ├──► ok → blob → new File([blob], inferredName, { type: 'application/json' })
    │        → loadPreview.openFromFile(file)
    │        → setLoading(false)
    │
    └──► error (timeout / 4xx / 5xx / network / CORS) → toast error, setLoading(false)
```

**Cleanup.** After the fetch completes (success or error), the `?load=` query param is stripped from the URL via `window.history.replaceState` so a refresh doesn't re-trigger. Matches the pattern used for `?replay=` today.

**File naming.** Derived from URL path's last segment; falls back to `'remote-run.json'` when path has no segment or the segment is empty.

**No auto-confirm.** The fetched file still goes through F9's preview modal. User confirms before events replace state. Important security property: a malicious URL can't silently replace the current dashboard state — worst case it shows a preview modal the user cancels.

**Loading indicator.** An inline toast "Loading from `<host>`..." while the fetch is pending. Toast pattern matches existing save/load toasts. No blocking spinner; the user can still interact with the rest of the dashboard.

---

## URL validation

| Input | Result |
|---|---|
| `?load=https://example.com/run.json` | `ok: true, url` |
| `?load=http://example.com/run.json` | `ok: true, url` (http allowed for local dev; prod will fail on mixed-content but that's the browser's job) |
| `?load=file:///...` | `{ ok: false, reason: 'unsupported-scheme' }` |
| `?load=javascript:...` | `{ ok: false, reason: 'unsupported-scheme' }` |
| `?load=data:...` | `{ ok: false, reason: 'unsupported-scheme' }` |
| `?load=%2Fetc%2Fpasswd` (relative) | `{ ok: false, reason: 'unsupported-scheme' }` (URL constructor rejects or yields file:// equivalent) |
| `?load=` (empty) | `{ ok: false, reason: 'missing' }` |
| (no `load` param at all) | `{ ok: false, reason: 'missing' }` |
| `?load=not a url` | `{ ok: false, reason: 'malformed' }` |

Allowed schemes: `http:`, `https:` only.

---

## Files

**New.**
- `src/cli/dashboard/src/hooks/useLoadFromUrl.ts` (~90 lines; hook — fetch + dispatch)
- `src/cli/dashboard/src/hooks/useLoadFromUrl.helpers.ts` (~70 lines; pure URL parsing + naming)
- `src/cli/dashboard/src/hooks/useLoadFromUrl.helpers.test.ts` (~80 lines; URL scheme/shape + filename derivation tests)

**Modified.**
- `src/cli/dashboard/src/App.tsx` — call `useLoadFromUrl({ loadPreview, toast })` once at the shell level; plumb through the same `loadPreview.openFromFile` already used by F10.

No modal / SCSS changes. F13 layers onto F9's preview modal.

---

## Rollout sequence

1. RED: tests for `parseLoadUrlParam`, `deriveFileNameFromUrl`, `isCrossOrigin`
2. GREEN: implement helpers
3. Implement `useLoadFromUrl` hook with injectable `fetch` for testability
4. Wire in App.tsx next to `useDashboardDropZone`
5. Strip `?load=` from URL after fetch completes
6. Manual smoke: local file served via `python3 -m http.server` → visit `/sim?load=http://localhost:8000/some-run.json`

---

## Testing

**Unit: parseLoadUrlParam**
- `/sim?load=https://example.com/r.json` → ok, URL populated
- `/sim?load=http://x.y` → ok (http allowed)
- `/sim?load=javascript:alert(1)` → reject as unsupported-scheme
- `/sim?load=file:///etc/passwd` → reject
- `/sim` (no param) → reject as missing
- `/sim?load=` → reject as missing
- `/sim?load=not+a+url` → reject as malformed
- Idempotent on re-parse after URL mutation

**Unit: deriveFileNameFromUrl**
- `https://example.com/runs/mars.json` → `"mars.json"`
- `https://example.com/` → `"remote-run.json"`
- `https://example.com/path/nested/file` → `"file"`
- URL with query string → ignores query, uses path

**Unit: isCrossOrigin**
- Same origin → false
- Different host → true
- Different port → true (browsers treat as separate origin)
- Different scheme → true

**Manual smoke**
- Good URL → toast + preview modal + confirm loads
- 404 URL → error toast, no modal
- CORS-blocked URL → error toast, no modal
- Timeout (use `?load=http://10.255.255.1/...` to force hang) → error toast after 30s
- Refresh after load → `?load=` already stripped, no double-fetch
- javascript: / file: → silent no-op (logged to console for debugging)

---

## Acceptance criteria

- Visiting `/sim?load=<valid-https-url-to-a-saved-run>` triggers a fetch and presents the F9 preview modal with the file's metadata
- Confirm in the preview loads events + switches to Sim tab, same as file-picker flow
- Cancel in the preview drops the fetched data without side effects
- Unsupported schemes (javascript, file, data) are rejected silently with a console warning
- Network / 4xx / 5xx / timeout errors surface as toasts
- `?load=` query param is stripped after the fetch resolves so refresh doesn't re-trigger
- `useLoadFromUrl.helpers.test.ts` passes
- Existing 135 dashboard tests still pass
- No inline styles; no new SCSS needed

---

## Out of scope (deferred)

- **Confirm-before-fetch modal for cross-origin URLs.** v1 relies on the F9 preview modal as the confirm step (user still has to click Load to apply). A stronger guardrail ("Loading from host X, continue?") is viable but adds a second modal for marginal security gain. Browser CORS is the real enforcement.
- **Auth-bearing fetches.** v1 fetches with no credentials. Bearer tokens / cookies for protected URLs are a separate feature.
- **Multi-file URL batch.** `?load=url1&load=url2` for comparison loads is F16-adjacent, not here.
- **Backward-compat URL format.** Only `?load=<url>` supported; no fragment / short-code forms.

---

## Risks + notes

- **Mixed-content block.** In production the dashboard is HTTPS; fetching `http://` URLs will be blocked by the browser. Our error toast handles this gracefully. Document in the error copy.
- **Large remote files.** Fetching a 50 MB save file over a slow connection could stall. 30s timeout is conservative; most real saves land under 5 MB.
- **Race with `?replay=`.** If both params are present, replay wins (takes over SSE source immediately) and `?load=` is ignored. Document this as intentional (replay is the higher-priority signal).
- **Browser CORS.** The server hosting the save file must send `Access-Control-Allow-Origin` for the dashboard's origin (or `*`). S3 / GCS public buckets typically do. Raw GitHub content does. Some hosts don't — that's a config problem on the host, not paracosm.
- **URL-param cleanup.** Uses `window.history.replaceState` (not `pushState`) so Back button doesn't stack a useless entry.
