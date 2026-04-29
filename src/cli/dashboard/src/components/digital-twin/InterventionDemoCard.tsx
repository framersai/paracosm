/**
 * InterventionDemoCard — Quickstart input-phase CTA that fires the
 * digital-twin demo. Shows a prefilled subject + intervention preview
 * (Atlas Lab + 90-day delay) and a single button. Click hits
 * POST /api/quickstart/simulate-intervention; on 200 the artifact is
 * forwarded to the parent (App.tsx) which parks it and switches to
 * the SIM tab so DigitalTwinPanel renders the result.
 *
 * Renders inline below SeedInput rather than in its own tab so the
 * dashboard tab bar does not balloon to 13 tabs. The capability is
 * surfaced where users decide what to run, not where they review
 * past runs.
 *
 * @module paracosm/dashboard/digital-twin/InterventionDemoCard
 */
import { useEffect, useRef, useState } from 'react';
import type { RunArtifact } from '../../../../../engine/schema/index.js';
import styles from './InterventionDemoCard.module.scss';

export interface InterventionDemoCardProps {
  onResult: (artifact: RunArtifact) => void;
  onError?: (message: string) => void;
}

const SUBJECT_PREVIEW = {
  id: 'frontier-lab-2026',
  name: 'Atlas Lab',
  meta: '480 employees · Atlas-7 model · alignmentBench 0.84',
};

const INTERVENTION_PREVIEW = {
  id: 'delay-90d',
  name: '90-day release delay',
  meta: '90 days · adherence 1.0',
};

const SUBJECT_PAYLOAD = {
  id: 'frontier-lab-2026',
  name: 'Atlas Lab',
  profile: { foundedYear: 2018, headcount: 480, modelGen: 'Atlas-7', alignmentBench: 0.84 },
  signals: [
    { label: 'AlignmentBench-2026', value: 0.84, unit: 'score', recordedAt: '2026-11-01T00:00:00Z' },
    { label: 'spec-gaming-rate', value: 0.042, unit: 'fraction', recordedAt: '2026-11-15T00:00:00Z' },
  ],
  markers: [
    { id: 'flagship-multimodal', category: 'capability', value: 'true' },
  ],
};

const INTERVENTION_PAYLOAD = {
  id: 'delay-90d',
  name: '90-day release delay',
  description: 'Hold Atlas-7 release 90 days for additional red-team and DPO mitigation passes.',
  duration: { value: 90, unit: 'days' },
  adherenceProfile: { expected: 1.0 },
};

export function InterventionDemoCard({ onResult, onError }: InterventionDemoCardProps) {
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsedSec(Math.round((Date.now() - startedAtRef.current) / 1000));
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [running]);

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setElapsedSec(0);
    startedAtRef.current = Date.now();
    try {
      const res = await fetch('/api/quickstart/simulate-intervention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: SUBJECT_PAYLOAD,
          intervention: INTERVENTION_PAYLOAD,
          // 1 turn keeps the run under Cloudflare's 100s gateway timeout
          // even when LLM calls run hot. The trajectory still has the
          // initial snapshot + post-turn-1 snapshot, which is enough to
          // show meaningful divergence in the trajectory mini-chart.
          options: { maxTurns: 1, seed: 11, costPreset: 'economy' },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error ?? `Intervention run failed: HTTP ${res.status}`);
      }
      const body = await res.json() as { artifact: RunArtifact; durationMs: number };
      onResult(body.artifact);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.heading}>
        <h3 className={styles.title}>Or test an intervention</h3>
        <span className={styles.eyebrow}>digital twin · single subject</span>
      </div>
      <p className={styles.copy}>
        Same engine, different shape: hold a subject constant, apply one intervention, watch its trajectory diverge across turns. The example below runs the cookbook&apos;s Atlas Lab + 90-day release delay against a corporate-quarterly scenario at economy cost (~$0.10).
      </p>
      <div className={styles.preview}>
        <div className={styles.previewCell}>
          <span className={styles.previewLabel}>Subject</span>
          <span className={styles.previewName}>{SUBJECT_PREVIEW.name}</span>
          <span className={styles.previewMeta}>{SUBJECT_PREVIEW.meta}</span>
        </div>
        <div className={styles.previewCell}>
          <span className={styles.previewLabel}>Intervention</span>
          <span className={styles.previewName}>{INTERVENTION_PREVIEW.name}</span>
          <span className={styles.previewMeta}>{INTERVENTION_PREVIEW.meta}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button onClick={handleRun} disabled={running} className={styles.button}>
          {running ? 'Running…' : 'Run intervention demo'}
        </button>
        {running ? (
          <span className={styles.timer}>
            <span className={styles.spinner} />
            {elapsedSec}s elapsed · 1 turn × LLM decisions, typically 20-60s
          </span>
        ) : (
          <span className={styles.helper}>1 turn · seed 11 · economy preset</span>
        )}
      </div>
    </div>
  );
}
