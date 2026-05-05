import * as React from 'react';
import type { LeaderInfo, TurnEventInfo } from '../../hooks/useGameState';
import { getActorColorVar } from '../../hooks/useGameState';
import { SparkLine } from '../shared/SparkLine';
import { Tooltip } from '../shared/Tooltip';
import styles from './ActorBar.module.scss';

interface ActorBarProps {
  /** Position in the actor lineup. 0 renders the primary palette, 1 the
   *  secondary. F2/F3 extends beyond 2 via the central color helper. */
  actorIndex: number;
  leader: LeaderInfo | null;
  popHistory: number[];
  moraleHistory: number[];
  /**
   * When the sim has produced a verdict, indicate how this leader
   * placed so the header can carry a victory / second / tie chip
   * next to the archetype tag. Undefined while the run is still
   * in flight or before verdict generation finished.
   */
  verdictPlacement?: 'winner' | 'second' | 'tie' | null;
  /** Single-line sticky-header form for use inside the SIM TurnGrid.
   *  Drops archetype, sparklines, hexaco, and the verdict chip in
   *  favor of a tight `▌Name · POP N · MORALE M% [mood] · CRISIS` row.
   *  The non-compact default is unchanged for all other surfaces. */
  compact?: boolean;
  /** Active crisis/event the leader is responding to. Surfaced as a
   *  status chip when present so the leader card carries live state
   *  rather than only static identity fields. */
  event?: TurnEventInfo | null;
  /** Categorical scenario-declared statuses bag (world.statuses).
   *  Top 2 entries surface as chips on the non-compact view. */
  statuses?: Record<string, string | boolean>;
  /** Non-empty when the leader is currently mid-decision (post-event,
   *  pre-outcome). Renders a "DECIDING…" pulse chip. */
  pendingDecision?: string;
}

/** Map a 0-100 morale value to a mood tier label + emoji. */
function moodFor(morale: number): { label: string; icon: string; tone: 'low' | 'tense' | 'ok' | 'high' } {
  if (morale < 25) return { label: 'low', icon: '\u{1F622}', tone: 'low' };
  if (morale < 50) return { label: 'tense', icon: '\u{1F614}', tone: 'tense' };
  if (morale < 75) return { label: 'steady', icon: '\u{1F642}', tone: 'ok' };
  return { label: 'rising', icon: '\u{1F60A}', tone: 'high' };
}

/** Pick up to N status chips from the statuses bag. Skips empty / false entries. */
function topStatuses(
  statuses: Record<string, string | boolean> | undefined,
  limit: number,
): Array<{ key: string; label: string; value: string }> {
  if (!statuses) return [];
  const entries: Array<{ key: string; label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(statuses)) {
    if (raw === false || raw === '' || raw == null) continue;
    const value = typeof raw === 'boolean' ? 'on' : String(raw);
    entries.push({ key, label: humanizeKey(key), value });
    if (entries.length >= limit) break;
  }
  return entries;
}

/**
 * Format a status key for display + screen-reader announcement.
 * `oxygen_pressure` → `Oxygen pressure`. Camel-case stays cased
 * (`moraleState` → `Morale state`). Falls back to the original
 * key when nothing useful can be derived.
 */
function humanizeKey(key: string): string {
  if (!key) return key;
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render HEXACO bar: "O ████░ .95" */
function traitStr(label: string, val: number): string {
  const filled = Math.round(val * 4);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(4 - filled);
  const num = val.toFixed(2);
  return `${label} ${bar} ${num}`;
}

export function ActorBar({
  actorIndex,
  leader,
  popHistory,
  moraleHistory,
  verdictPlacement,
  compact = false,
  event,
  statuses,
  pendingDecision,
}: ActorBarProps) {
  const sideColor = getActorColorVar(actorIndex);
  const sideBg = actorIndex === 0 ? 'rgba(232,180,74,.12)' : 'rgba(76,168,168,.12)';
  const sideBorder = actorIndex === 0 ? 'var(--amber-dim)' : 'var(--teal-dim)';
  const fallbackLabel = `Leader ${String.fromCharCode(65 + actorIndex)}`;
  const name = leader?.name || fallbackLabel;

  if (compact) {
    const pop = popHistory.length > 0 ? popHistory[popHistory.length - 1] : null;
    const morale = moraleHistory.length > 0 ? moraleHistory[moraleHistory.length - 1] : null;
    const mood = morale !== null ? moodFor(morale) : null;
    const archetypeShort = leader?.archetype?.replace(/^The\s+/i, '').toUpperCase() || '';
    return (
      <div
        className={styles.compact}
        style={{
          ['--actor-color' as string]: sideColor,
          ['--actor-bg' as string]: sideBg,
          ['--actor-border' as string]: sideBorder,
        }}
        aria-label={`${name} compact summary`}
      >
        <span className={styles.compactBand} aria-hidden="true" />
        <span className={styles.compactName}>{name}</span>
        {archetypeShort && (
          <span className={styles.compactArchetype} title={leader?.archetype}>
            {archetypeShort}
          </span>
        )}
        {pop !== null && (
          <>
            <span className={styles.compactSep}>·</span>
            <span className={styles.compactStat}>POP {Math.round(pop)}</span>
          </>
        )}
        {morale !== null && (
          <>
            <span className={styles.compactSep}>·</span>
            {/* moraleHistory is already 0-100 (scaled in useGameState
                so the SparkLine reads it directly). Multiplying by 100
                again here was producing MORALE 3200% on the live SIM
                actor bar. Round-display only. */}
            <span className={styles.compactStat}>MORALE {Math.round(morale)}%</span>
          </>
        )}
        {mood && (
          <span
            className={`${styles.compactMood} ${styles[`mood_${mood.tone}`] ?? ''}`.trim()}
            title={`Mood: ${mood.label}`}
          >
            <span aria-hidden="true">{mood.icon}</span>
            <span>{mood.label}</span>
          </span>
        )}
        {event?.title && (
          <span
            className={styles.compactCrisis}
            title={event.description ?? event.title}
          >
            <span aria-hidden="true">⚠</span>
            <span>{event.title.length > 24 ? `${event.title.slice(0, 24)}…` : event.title}</span>
          </span>
        )}
        {pendingDecision && (
          <span className={styles.compactDeciding} title={pendingDecision}>
            DECIDING…
          </span>
        )}
      </div>
    );
  }

  const archetype = leader?.archetype || '';
  const unit = leader?.unit || '';
  const h = leader?.hexaco || {};
  const hasHexaco = Object.values(h).some(v => v > 0);

  const keys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotionality', 'honestyHumility'];
  const labels = ['O', 'C', 'E', 'A', 'Em', 'HH'];
  const traitLine = hasHexaco
    ? labels.map((l, i) => traitStr(l, h[keys[i]] ?? 0)).join(' ')
    : '';

  const verdictClass = verdictPlacement
    ? `${styles.verdictChip} ${styles[verdictPlacement] ?? ''}`.trim()
    : '';

  return (
    <div
      className={styles.root}
      style={{
        ['--actor-color' as string]: sideColor,
        ['--actor-bg' as string]: sideBg,
        ['--actor-border' as string]: sideBorder,
      }}
    >
      <div className={styles.headerRow}>
        {archetype && (
          <span className={styles.archetypeChip}>
            {archetype.toUpperCase().replace(/^THE\s+/i, '')}
          </span>
        )}
        {verdictPlacement && (
          <span
            title={verdictPlacement === 'winner' ? 'Verdict: this leader won' : verdictPlacement === 'tie' ? 'Verdict: tie' : 'Verdict: runner-up'}
            className={verdictClass}
          >
            {verdictPlacement === 'winner' ? '★ WINNER' : verdictPlacement === 'tie' ? '= TIE' : '2ND'}
          </span>
        )}
        <Tooltip dot content={
          <div>
            <b className={styles.tooltipHeading}>
              {archetype ? `${archetype}: ` : ''}{name}
            </b>
            {unit && <div>Unit: {unit}</div>}
            {leader?.instructions && (
              <div className={styles.tooltipInstructions}>{leader.instructions}</div>
            )}
            {hasHexaco && (
              <div className={styles.tooltipTraitBlock}>
                {keys.map((trait) => (
                  <div key={trait} className={styles.tooltipTraitRow}>
                    <span className={styles.tooltipTraitLabel}>
                      {trait.charAt(0).toUpperCase() + trait.slice(1).replace(/([A-Z])/g, ' $1')}
                    </span>
                    <span className={styles.tooltipTraitValue}>
                      {(h[trait] ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        }>
          <span className={styles.name}>{name}</span>
        </Tooltip>
        {unit && <span className={styles.unitTag}>{unit}</span>}
        {traitLine && (
          <span className={`leader-traits ${styles.traits}`}>
            <span className={styles.traitsSep}>|</span>
            <span className={styles.traitsLine}>{traitLine}</span>
          </span>
        )}
      </div>
      <div className={styles.subRow}>
        <span className={styles.quote}>
          {(() => {
            if (leader?.quote) return `"${leader.quote}"`;
            if (!leader?.instructions) return '';
            const bio = leader.instructions
              .replace(/^You are [^.]+\.\s*/i, '')
              .replace(/^"[^"]+"\.\s*/i, '')
              .replace(/Your HEXACO profile drives your leadership.*$/i, '')
              .trim();
            return bio ? `"${bio.slice(0, 80)}${bio.length > 80 ? '...' : ''}"` : '';
          })()}
        </span>
        <span className={`leader-sparklines ${styles.sparklines}`}>
          <SparkLine data={popHistory} label="POP" color={sideColor} />
          {'  '}
          <SparkLine data={moraleHistory} label="MORALE" suffix="%" color="var(--amber)" />
        </span>
      </div>
      <DynamicStateRow
        moraleHistory={moraleHistory}
        event={event}
        statuses={statuses}
        pendingDecision={pendingDecision}
      />
    </div>
  );
}

/**
 * Status chip row surfaced below the quote+sparkline subrow. Stays empty
 * (renders nothing) until the sim fires its first event, so the idle/
 * preset rendering matches the prior layout.
 */
function DynamicStateRow({
  moraleHistory,
  event,
  statuses,
  pendingDecision,
}: {
  moraleHistory: number[];
  event?: TurnEventInfo | null;
  statuses?: Record<string, string | boolean>;
  pendingDecision?: string;
}) {
  const lastMorale = moraleHistory.length > 0 ? moraleHistory[moraleHistory.length - 1] : null;
  const mood = lastMorale !== null ? moodFor(lastMorale) : null;
  const statusChips = topStatuses(statuses, 2);
  const hasContent = mood || event?.title || pendingDecision || statusChips.length > 0;
  if (!hasContent) return null;

  return (
    <div
      className={styles.dynamicRow}
      // Live region so screen readers announce mid-sim state changes
      // (crisis appears, leader enters DECIDING, status flips). Polite
      // so it doesn't interrupt the user mid-keystroke.
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {mood && (
        <span
          className={`${styles.chip} ${styles[`mood_${mood.tone}`] ?? ''}`.trim()}
          title={`Mood derived from current morale (${Math.round(lastMorale!)}%)`}
        >
          <span aria-hidden="true">{mood.icon}</span>
          <span className={styles.chipLabel}>Mood</span>
          <span className={styles.chipValue}>{mood.label}</span>
        </span>
      )}
      {event?.title && (
        <span className={`${styles.chip} ${styles.chipCrisis}`} title={event.description ?? event.title}>
          <span aria-hidden="true">⚠</span>
          <span className={styles.chipLabel}>
            {humanizeKey(event.category) || 'Event'}
          </span>
          <span className={styles.chipValue}>
            {event.title.length > 32 ? `${event.title.slice(0, 32)}…` : event.title}
          </span>
        </span>
      )}
      {pendingDecision && (
        <span className={`${styles.chip} ${styles.chipDeciding}`} title={pendingDecision}>
          <span aria-hidden="true">⏳</span>
          <span className={styles.chipLabel}>Deciding</span>
        </span>
      )}
      {statusChips.map(({ key, label, value }) => (
        <span key={key} className={`${styles.chip} ${styles.chipStatus}`} title={`${label}: ${value}`}>
          <span className={styles.chipLabel}>{label}</span>
          <span className={styles.chipValue}>{value}</span>
        </span>
      ))}
    </div>
  );
}
