/**
 * InterventionDemoCard — Quickstart input-phase CTA that fires the
 * digital-twin demo. Renders the subject + intervention as labeled
 * form fields that type themselves in on mount (typewriter animation)
 * so the demo visually reads as "input being entered" rather than
 * "static prefilled card." Click hits POST /api/quickstart/
 * simulate-intervention; on 200 the artifact is forwarded to the
 * parent (App.tsx) which parks it and switches to the SIM tab so
 * DigitalTwinPanel renders the result.
 *
 * @module paracosm/dashboard/digital-twin/InterventionDemoCard
 */
import { useEffect, useRef, useState } from 'react';
import type { RunArtifact } from '../../../../../engine/schema/index.js';
import styles from './InterventionDemoCard.module.scss';

export interface InterventionDemoCardProps {
  onResult: (artifact: RunArtifact) => void;
  onError?: (message: string) => void;
  onRunStart?: (payload: {
    subject: { id: string; name: string; profile?: Record<string, unknown> };
    intervention: { id: string; name: string; description: string; duration?: { value: number; unit: string } };
  }) => void;
}

/** Labeled fields rendered inside the SUBJECT and INTERVENTION cards.
 *  Each field types itself in sequentially on mount via the
 *  useTypewriterFields hook below — the visual analog of "you, the
 *  developer, are filling in the SubjectConfig + InterventionConfig
 *  payload". Last entry per group is the most "domain-specific" so
 *  the typewriter rhythm builds toward something interesting. */
const SUBJECT_FIELDS: Array<{ label: string; value: string }> = [
  { label: 'Patient',       value: 'Maria Chen' },
  { label: 'Age',           value: '58' },
  { label: 'Diagnosis',     value: 'Type 2 diabetes (4 yrs)' },
  { label: 'HbA1c',         value: '7.8%' },
  { label: 'Weight',        value: '178 lb · BMI 31' },
  { label: 'Comorbidities', value: 'hypertension, dyslipidemia, family-hx CVD' },
];

const INTERVENTION_FIELDS: Array<{ label: string; value: string }> = [
  { label: 'Protocol',  value: '12-week semaglutide + lifestyle' },
  { label: 'Drug',      value: 'Semaglutide 0.25mg → 1.0mg by week 4' },
  { label: 'Lifestyle', value: '150min/wk graded exercise + dietitian plan' },
  { label: 'Duration',  value: '84 days' },
  { label: 'Adherence', value: '85% target' },
  { label: 'Care team', value: 'endocrinology, nutrition, behavioral, cardiology, coach' },
];

const SUBJECT_PAYLOAD = {
  id: 'patient-maria-2026',
  name: 'Maria Chen',
  profile: {
    age: 58,
    yearsWithT2D: 4,
    bmi: 31,
    a1cBaseline: 7.8,
    weightLb: 178,
    fastingGlucose: 156,
    sleepHoursBaseline: 6.2,
    exerciseMinPerWeek: 0,
    comorbidities: 'hypertension, dyslipidemia',
  },
  signals: [
    { label: 'HbA1c', value: 7.8, unit: '%', recordedAt: '2026-09-15T00:00:00Z' },
    { label: 'Fasting glucose', value: 156, unit: 'mg/dL', recordedAt: '2026-09-15T00:00:00Z' },
    { label: 'Weight', value: 178, unit: 'lb', recordedAt: '2026-09-15T00:00:00Z' },
    { label: 'BMI', value: 31, unit: 'kg/m²', recordedAt: '2026-09-15T00:00:00Z' },
  ],
  markers: [
    { id: 'family-history-cvd', category: 'cardiovascular', value: 'true' },
    { id: 'metformin-1000mg-bid', category: 'medication', value: 'baseline' },
  ],
};

const INTERVENTION_PAYLOAD = {
  id: 'glp1-12wk-protocol',
  name: '12-week semaglutide + lifestyle protocol',
  description: 'Initiate semaglutide 0.25mg weekly, titrate to 1.0mg by week 4. Pair with dietitian-led nutrition plan and 150min/wk graded exercise. Behavioral health checkpoints biweekly. Monitor for GI side effects, gallbladder, pancreatitis.',
  duration: { value: 84, unit: 'days' },
  adherenceProfile: { expected: 0.85 },
};

/**
 * Typewriter animation for a list of labeled fields. Reveals one field
 * at a time, typing each value character-by-character. Triggered by
 * `start` toggling true — the parent uses an IntersectionObserver to
 * wait until the card scrolls into view, so the animation runs WHILE
 * the viewer is looking at it (matters for the dt demo recording: the
 * recorder takes 2-3s to scroll to the card, and we don't want the
 * type-in to play while the card is off-screen).
 */
function useTypewriter(
  fields: Array<{ label: string; value: string }>,
  options: { start: boolean; startDelayMs?: number; fieldDelayMs?: number; charMs?: number },
) {
  const { start, startDelayMs = 200, fieldDelayMs = 260, charMs = 16 } = options;
  const [fieldIndex, setFieldIndex] = useState(-1);
  const [charsTyped, setCharsTyped] = useState(0);

  useEffect(() => {
    if (!start) return;
    let cancelled = false;
    let timer: number | undefined;

    const advanceField = (i: number) => {
      if (cancelled || i >= fields.length) return;
      setFieldIndex(i);
      setCharsTyped(0);
      const value = fields[i].value;
      const typeStep = (n: number) => {
        if (cancelled) return;
        if (n >= value.length) {
          timer = window.setTimeout(() => advanceField(i + 1), fieldDelayMs);
          return;
        }
        setCharsTyped(n + 1);
        timer = window.setTimeout(() => typeStep(n + 1), charMs);
      };
      typeStep(0);
    };

    const kickoff = window.setTimeout(() => advanceField(0), startDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(kickoff);
      if (timer) window.clearTimeout(timer);
    };
  }, [start, fields, startDelayMs, fieldDelayMs, charMs]);

  return { fieldIndex, charsTyped };
}

function TypewriterFields({ fields, startDelayMs, start }: { fields: Array<{ label: string; value: string }>; startDelayMs: number; start: boolean }) {
  const { fieldIndex, charsTyped } = useTypewriter(fields, { start, startDelayMs });
  return (
    <div className={styles.fieldList}>
      {fields.map((f, i) => {
        const visible = i <= fieldIndex;
        const fullyTyped = i < fieldIndex;
        const partial = i === fieldIndex ? f.value.slice(0, charsTyped) : (fullyTyped ? f.value : '');
        return (
          <div key={f.label} className={styles.field} style={{ opacity: visible ? 1 : 0 }}>
            <span className={styles.fieldLabel}>{f.label}</span>
            <span className={styles.fieldValue}>
              {partial}
              {i === fieldIndex && !fullyTyped && <span className={styles.cursor}>▋</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function InterventionDemoCard({ onResult, onError, onRunStart }: InterventionDemoCardProps) {
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number>(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [typeStart, setTypeStart] = useState(false);

  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsedSec(Math.round((Date.now() - startedAtRef.current) / 1000));
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [running]);

  // Kick off the typewriter the first time the card scrolls into view.
  // This guarantees the animation is running WHILE the viewer is
  // looking — matters both for real users scrolling down and for the
  // demo recorder which scrolls to the card after page load. Once
  // started, we never restart even if the card scrolls away again.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      // Older browser fallback: just kick off after mount.
      setTypeStart(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setTypeStart(true);
          observer.disconnect();
          return;
        }
      }
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setElapsedSec(0);
    startedAtRef.current = Date.now();
    onRunStart?.({
      subject: { id: SUBJECT_PAYLOAD.id, name: SUBJECT_PAYLOAD.name, profile: SUBJECT_PAYLOAD.profile },
      intervention: {
        id: INTERVENTION_PAYLOAD.id,
        name: INTERVENTION_PAYLOAD.name,
        description: INTERVENTION_PAYLOAD.description,
        duration: INTERVENTION_PAYLOAD.duration,
      },
    });
    try {
      const res = await fetch('/api/quickstart/simulate-intervention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: SUBJECT_PAYLOAD,
          intervention: INTERVENTION_PAYLOAD,
          options: { maxTurns: 2, seed: 11, costPreset: 'economy' },
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
    <div ref={cardRef} className={styles.card}>
      <div className={styles.heading}>
        <h3 className={styles.title}>Run a digital twin</h3>
        <span className={styles.eyebrow}>type a case · single subject</span>
      </div>
      <p className={styles.copy}>
        Describe a patient and an intervention. Paracosm runs a real
        LLM-driven simulation across a five-department care team
        (endocrinology, nutrition, behavioral health, cardiology,
        lifestyle coach) and returns a typed RunArtifact with the
        trajectory.
      </p>
      <textarea
        id="dt-case-input"
        className={styles.caseInput}
        placeholder="e.g. Maria Chen, 58, type 2 diabetes for 4 years. HbA1c 7.8%, BMI 31, sedentary, family history of CVD, on metformin. Test a 12-week semaglutide + lifestyle protocol: titrate to 1.0mg by week 4, 150min/wk graded exercise, dietitian-led nutrition, biweekly behavioral checkpoints."
        rows={5}
      />
      <div className={styles.parsedHint}>
        <span className={styles.parsedHintArrow}>↓</span>
        <span>Parsed into Subject + Intervention</span>
      </div>
      <div className={styles.preview}>
        <div className={styles.previewCell}>
          <div className={styles.previewHeader}>
            <span className={styles.previewLabel}>Subject</span>
            <span className={styles.previewId}>patient-maria-2026</span>
          </div>
          <TypewriterFields fields={SUBJECT_FIELDS} startDelayMs={300} start={typeStart} />
        </div>
        <div className={styles.previewCell}>
          <div className={styles.previewHeader}>
            <span className={styles.previewLabel}>Intervention</span>
            <span className={styles.previewId}>glp1-12wk-protocol</span>
          </div>
          <TypewriterFields fields={INTERVENTION_FIELDS} startDelayMs={1700} start={typeStart} />
        </div>
      </div>
      <div className={styles.actions}>
        <button onClick={handleRun} disabled={running} className={styles.button}>
          {running ? 'Running…' : 'Run intervention demo'}
        </button>
        {running ? (
          <span className={styles.timer}>
            <span className={styles.spinner} />
            {elapsedSec}s elapsed · 2 turns × LLM decisions, typically 40-90s
          </span>
        ) : (
          <span className={styles.helper}>2 turns · seed 11 · economy preset</span>
        )}
      </div>
    </div>
  );
}
