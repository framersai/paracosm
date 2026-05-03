import * as React from 'react';
import { useState } from 'react';
import { useScenarioContext } from '../../App';
import styles from './LoadedScenarioCTA.module.scss';

void React;

interface LoadedScenarioCTAProps {
  /** Fires on click with the user's chosen actor count. Parent
   *  (QuickstartView) decides whether to post to `/setup` directly
   *  (presets present) or route through actor-generation first. */
  onRunStart: (actorCount: number) => void;
  /** Disabled flag from parent — prevents double-launch during a
   *  running compile / setup. */
  disabled?: boolean;
  /** Initial actor count. Defaults to 2 (matches the loaded scenario's
   *  typical 2-leader preset shape). */
  initialActorCount?: number;
}

/**
 * Primary CTA card for the Quickstart tab. Surfaces the currently-loaded
 * scenario for one-click run, bypassing compile-from-seed when the
 * scenario already ships with leader presets.
 */
export function LoadedScenarioCTA({
  onRunStart,
  disabled = false,
  initialActorCount = 2,
}: LoadedScenarioCTAProps) {
  const scenario = useScenarioContext();
  const [actorCount, setActorCount] = useState<number>(initialActorCount);
  const [launching, setLaunching] = useState<boolean>(false);

  const presetActors = scenario.presets[0]?.actors ?? [];
  const presetCount = presetActors.length;
  const hasPreset = presetCount >= 2;
  const sliderMax = Math.max(2, presetCount || 2);
  const scenarioName = scenario.labels.name;

  const leaderLine = hasPreset
    ? `${presetActors[0].name} (${presetActors[0].archetype}) vs ${presetActors[1].name} (${presetActors[1].archetype})`
    : 'Auto-generated leaders (no preset)';

  const headingId = 'loaded-scenario-cta-heading';
  const sliderId = 'loaded-scenario-actor-count';

  const handleClick = () => {
    if (launching || disabled) return;
    setLaunching(true);
    onRunStart(actorCount);
    // Parent owns the actual fetch — it'll re-render with disabled=true
    // for the duration of the run, which keeps this button gated.
  };

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 className={styles.heading} id={headingId}>
        ▶ Run with the loaded scenario: {scenarioName}
      </h2>
      <div className={styles.subline}>{leaderLine}</div>
      <div className={styles.actorRow}>
        <label className={styles.actorLabel} htmlFor={sliderId}>Actors</label>
        <input
          id={sliderId}
          type="range"
          min={1}
          max={sliderMax}
          value={actorCount}
          onChange={(e) => setActorCount(parseInt(e.target.value, 10))}
          disabled={disabled || launching}
          className={styles.actorSlider}
          aria-label="Number of parallel actors"
        />
        <span className={styles.actorValue}>{actorCount}</span>
      </div>
      <button
        type="button"
        className={styles.runButton}
        onClick={handleClick}
        disabled={disabled || launching}
        aria-busy={launching}
      >
        {launching ? 'Launching…' : `Run ${actorCount} ${actorCount === 1 ? 'actor' : 'actors'} against ${scenarioName} →`}
      </button>
      <div className={styles.tradeoff}>
        {hasPreset
          ? 'Same scenario, fresh seed: skips the compile step.'
          : 'Same scenario; ~30s for actor generation since no preset is defined.'}
      </div>
    </section>
  );
}
