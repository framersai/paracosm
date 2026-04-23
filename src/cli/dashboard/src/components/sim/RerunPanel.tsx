/**
 * Re-run-with-seed+1 epilogue bar. Shows at the bottom of SimView
 * after a run completes, offering a one-click restart of the last
 * launch config with the seed bumped by one so the outcome shifts
 * deterministically without sending the user back to Settings.
 *
 * Reads the last-launch config + per-provider key overrides through
 * {@link useLastLaunchConfig} helpers so the localStorage contract
 * lives in one place (audit F22).
 *
 * @module paracosm/cli/dashboard/components/sim/RerunPanel
 */
import { useCallback, useState } from 'react';
import {
  buildNextRunConfig,
  readKeyOverrides,
  readLastLaunchConfig,
  writeLastLaunchConfig,
} from '../../hooks/useLastLaunchConfig';
import styles from './RerunPanel.module.scss';

interface RerunPanelProps {
  /** Gate: only visible when the sim has completed. Defaults to true
   *  so consumers can conditionally render the whole component. */
  enabled?: boolean;
}

export function RerunPanel({ enabled = true }: RerunPanelProps) {
  const [launching, setLaunching] = useState(false);

  const handleClick = useCallback(async () => {
    if (launching) return;
    setLaunching(true);
    try {
      const prev = readLastLaunchConfig(window.localStorage);
      if (!prev) {
        alert('No previous launch config found. Run once from Settings first.');
        return;
      }
      const overrides = readKeyOverrides(window.localStorage);
      const next = buildNextRunConfig(prev, overrides);
      const res = await fetch('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = (await res.json().catch(() => ({}))) as {
        redirect?: string;
        error?: string;
      };
      if (res.status === 429) {
        alert(data.error || 'Rate limit hit. Add an API key in Settings to bypass.');
        return;
      }
      if (!res.ok) {
        // Non-429 4xx/5xx — surface the server's error or a generic one
        // so the user isn't left with a dead button click.
        alert(data.error || `Re-run failed: server responded with HTTP ${res.status}.`);
        return;
      }
      if (data.redirect) {
        // Persist the new seed so a subsequent Re-run bumps from THIS
        // run's seed, not the original.
        writeLastLaunchConfig(window.localStorage, next);
        window.location.href = data.redirect;
      } else {
        alert('Re-run failed: server did not return a redirect. Check the server logs.');
      }
    } catch (err) {
      alert(`Re-run failed: ${err}`);
    } finally {
      setLaunching(false);
    }
  }, [launching]);

  if (!enabled) return null;

  return (
    <div className={styles.panel}>
      <span className={styles.label}>Re-run</span>
      <span className={styles.copy}>
        Spin up a new run with the same leaders + scenario, seed bumped by one.
      </span>
      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        disabled={launching}
      >
        {launching ? 'Launching…' : 'Run again with seed+1 ›'}
      </button>
    </div>
  );
}
