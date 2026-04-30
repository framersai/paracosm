/**
 * Quickstart seed picker: paste text, URL, or PDF upload. Emits the
 * resolved seed text via `onSeedReady` when the user confirms. The
 * parent orchestrator handles compile + run dispatch.
 *
 * @module paracosm/dashboard/quickstart/SeedInput
 */
import { useState, useRef, useCallback } from 'react';
import { validateSeedText, validateSeedUrl } from './QuickstartView.helpers';
import { extractPdfText } from './pdf-extract';
import styles from './SeedInput.module.scss';

export interface SeedInputProps {
  onSeedReady: (payload: { seedText: string; sourceUrl?: string; domainHint?: string; actorCount?: number }) => void;
  disabled?: boolean;
}

type Tab = 'paste' | 'url' | 'pdf';

export function SeedInput({ onSeedReady, disabled = false }: SeedInputProps) {
  const [tab, setTab] = useState<Tab>('paste');
  const [seedText, setSeedText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [domainHint, setDomainHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  // Actor count: how many parallel actors run against this scenario.
  // Default 3 matches the legacy Quickstart behavior. Cap 50 mirrors
  // GenerateLeadersSchema. Each actor is ~$0.30 LLM spend; the cost
  // preview surfaces the total below the slider.
  const [actorCount, setActorCount] = useState(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(() => {
    const trimmedSeed = seedText.trim();
    const validation = validateSeedText(trimmedSeed);
    if (!validation.ok) {
      setError(
        validation.reason === 'too-short' ? 'Paste at least 200 characters of source material.' :
        validation.reason === 'too-long' ? 'Source material exceeds 50 000 characters.' :
        'Source material is empty.',
      );
      return;
    }
    setError(null);
    onSeedReady({
      seedText: trimmedSeed,
      sourceUrl,
      domainHint: domainHint.trim() || undefined,
      actorCount,
    });
  }, [seedText, sourceUrl, domainHint, actorCount, onSeedReady]);

  const fetchUrl = useCallback(async () => {
    const validation = validateSeedUrl(urlInput);
    if (!validation.ok) { setError(validation.error); return; }
    setFetching(true);
    setError(null);
    try {
      const res = await fetch('/api/quickstart/fetch-seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: validation.url.toString() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        setError(body.error ?? `Fetch failed: HTTP ${res.status}`);
        return;
      }
      const data = await res.json() as { text: string; sourceUrl?: string; truncated?: boolean };
      setSeedText(data.text);
      setSourceUrl(data.sourceUrl ?? validation.url.toString());
      setTab('paste');
    } catch (err) {
      // Network-level failures (DNS, CORS, TLS) reach this branch.
      // Server-supplied error messages went through the body.error
      // path above, so anything here is a transport problem.
      const raw = (err as Error)?.message ?? String(err);
      const msg = /Failed to fetch|NetworkError|ERR_/i.test(raw)
        ? "Couldn't reach the server. Check your connection and try again."
        : `URL fetch failed: ${raw}`;
      setError(msg);
    } finally {
      setFetching(false);
    }
  }, [urlInput]);

  const handlePdfUpload = useCallback(async (file: File) => {
    const MAX_PDF_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_PDF_BYTES) {
      setError('PDF exceeds 10 MB limit.');
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError(`File is not a PDF: ${file.name}`);
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const { text, truncated } = await extractPdfText(file);
      setSeedText(truncated ? `${text}\n\n[Truncated to first 50 KB.]` : text);
      setSourceUrl(undefined);
      setTab('paste');
    } catch (err) {
      // Map pdf.js exceptions to actionable copy. The raw stringified
      // exception (e.g. 'InvalidPDFException: Invalid PDF structure'
      // or 'Setting up fake worker failed') reads as failure-by-bug
      // even when the cause is just "this is a scanned PDF" or "the
      // file is corrupted". Surface the recovery action instead.
      const code = (err as Error & { code?: string })?.code;
      const raw = String((err as Error)?.message ?? err);
      let msg: string;
      if (code === 'PDF_NO_TEXT') {
        msg = 'No text found in this PDF. It looks like a scanned image — try a text-based PDF, or paste the content into WRITE.';
      } else if (/InvalidPDFException|invalid pdf|corrupt/i.test(raw)) {
        msg = 'This PDF appears to be corrupted or password-protected. Try a different file or paste the text directly.';
      } else if (/worker|GlobalWorkerOptions/i.test(raw)) {
        msg = 'PDF parser failed to start. Hard-refresh the page (Cmd/Ctrl-Shift-R) and try again.';
      } else {
        msg = `Couldn't read this PDF (${raw}). Try paste-text or a different file.`;
      }
      setError(msg);
    } finally {
      setFetching(false);
    }
  }, []);

  // Tab id stays 'paste' for backward compat with existing telemetry
  // and tests; the visible label is "WRITE" so the textarea reads as
  // an invitation to type, not just paste. Multiple users called this
  // out as confusing — "Paste" implied the only valid input was
  // pre-existing text from a clipboard.
  const TAB_LABELS: Record<Tab, string> = { paste: 'WRITE', url: 'URL', pdf: 'PDF' };
  return (
    <div className={styles.seedInput}>
      <div className={styles.tabs} role="tablist">
        {(['paste', 'url', 'pdf'] as Tab[]).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => { setTab(t); setError(null); }}
            disabled={disabled}
            type="button"
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'paste' && (
        <textarea
          data-quickstart-seed
          className={styles.textarea}
          placeholder="Type or paste a brief, article, meeting notes, or any domain-specific source material (at least 200 characters)."
          value={seedText}
          onChange={e => setSeedText(e.target.value)}
          rows={12}
          disabled={disabled}
        />
      )}

      {tab === 'url' && (
        <div className={styles.urlRow}>
          <input
            type="url"
            className={styles.input}
            placeholder="https://example.com/article"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            disabled={disabled || fetching}
          />
          <button
            type="button"
            className={styles.fetchButton}
            onClick={fetchUrl}
            disabled={disabled || fetching || !urlInput}
          >
            {fetching ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
      )}

      {tab === 'pdf' && (
        <div
          className={styles.dropZone}
          onClick={() => { if (!disabled) fileInputRef.current?.click(); }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (disabled) return;
            const file = e.dataTransfer.files[0];
            if (file) handlePdfUpload(file);
          }}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onKeyDown={e => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handlePdfUpload(file);
            }}
            hidden
          />
          {fetching ? 'Extracting text...' : 'Drop a PDF or click to upload (max 10 MB, first 50 KB of text used)'}
        </div>
      )}

      <div className={styles.hint}>
        <label htmlFor="quickstart-domain-hint">Domain hint (optional)</label>
        <input
          id="quickstart-domain-hint"
          className={styles.input}
          type="text"
          placeholder='e.g., "clinical trial decision" or "startup growth"'
          value={domainHint}
          onChange={e => setDomainHint(e.target.value)}
          maxLength={80}
          disabled={disabled}
        />
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.charCount}>
        {seedText.length.toLocaleString()} / 50,000 characters
      </div>

      <div className={styles.actorCountRow}>
        <label htmlFor="quickstart-actor-count" className={styles.actorCountLabel}>
          Actors: <strong>{actorCount}</strong>
        </label>
        <input
          id="quickstart-actor-count"
          type="range"
          min={1}
          max={50}
          value={actorCount}
          onChange={(e) => setActorCount(parseInt(e.target.value, 10))}
          disabled={disabled}
          className={styles.actorCountSlider}
          aria-label="Number of parallel actors to run"
        />
        <span className={styles.actorCountPreview} aria-live="polite">
          ~${(0.10 + 0.30 * actorCount).toFixed(2)} · {wallTimeEstimate(actorCount)}
        </span>
      </div>

      <button
        type="button"
        className={styles.runButton}
        onClick={submit}
        disabled={disabled || seedText.trim().length < 200}
      >
        Generate + Run {actorCount} {actorCount === 1 ? 'Actor' : 'Actors'} (~${(0.10 + 0.30 * actorCount).toFixed(2)})
      </button>
    </div>
  );
}

/** Rough wall-time estimate for the cost-preview tile. Three actors
 *  run in parallel today (Promise.allSettled); higher counts will be
 *  bounded by the eventual --max-parallel knob from the spec's risk
 *  register. Returns a "X-Y min" range. */
function wallTimeEstimate(count: number): string {
  if (count <= 0) return '—';
  // Compile + ground + leader gen baseline ~2 min, then ~5 min per
  // batch-of-3 actors at full 6-turn runs. Padded to a 1.5x ceiling
  // so callers see a realistic upper bound.
  const baselineMin = 2;
  const perBatchMin = 5;
  const batches = Math.max(1, Math.ceil(count / 3));
  const lo = baselineMin + perBatchMin * batches;
  const hi = Math.ceil(lo * 1.5);
  return `${lo}–${hi} min`;
}
