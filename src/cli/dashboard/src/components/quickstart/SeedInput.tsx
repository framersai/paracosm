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
  onSeedReady: (payload: { seedText: string; sourceUrl?: string; domainHint?: string }) => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(() => {
    const validation = validateSeedText(seedText);
    if (!validation.ok) {
      setError(
        validation.reason === 'too-short' ? 'Paste at least 200 characters of source material.' :
        validation.reason === 'too-long' ? 'Source material exceeds 50 000 characters.' :
        'Source material is empty.',
      );
      return;
    }
    setError(null);
    onSeedReady({ seedText, sourceUrl, domainHint: domainHint.trim() || undefined });
  }, [seedText, sourceUrl, domainHint, onSeedReady]);

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
      setError(String(err));
    } finally {
      setFetching(false);
    }
  }, [urlInput]);

  const handlePdfUpload = useCallback(async (file: File) => {
    setFetching(true);
    setError(null);
    try {
      const { text, truncated } = await extractPdfText(file);
      setSeedText(truncated ? `${text}\n\n[Truncated to first 50 KB.]` : text);
      setSourceUrl(undefined);
      setTab('paste');
    } catch (err) {
      setError(`PDF extraction failed: ${String(err)}`);
    } finally {
      setFetching(false);
    }
  }, []);

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
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'paste' && (
        <textarea
          className={styles.textarea}
          placeholder="Paste a brief, article, meeting notes, or any domain-specific source material (at least 200 characters)."
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
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handlePdfUpload(file);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
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

      <button
        type="button"
        className={styles.runButton}
        onClick={submit}
        disabled={disabled || seedText.trim().length < 200}
      >
        Generate + Run 3 Leaders
      </button>
    </div>
  );
}
