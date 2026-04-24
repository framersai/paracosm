/**
 * Modal that lets the user swap one of the Quickstart-generated leaders
 * for a preset from `paracosm/leader-presets`.
 *
 * @module paracosm/dashboard/quickstart/LeaderPresetPicker
 */
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { LEADER_PRESETS, type LeaderPreset } from '../../../../../engine/leader-presets.js';
import styles from './LeaderPresetPicker.module.scss';

export interface LeaderPresetPickerProps {
  onSelect: (preset: LeaderPreset) => void;
  onClose: () => void;
}

export function LeaderPresetPicker({ onSelect, onClose }: LeaderPresetPickerProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Swap leader"
      className={styles.backdrop}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={styles.dialog}
        onClick={e => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h3>Swap leader</h3>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <ul className={styles.list}>
          {Object.values(LEADER_PRESETS).map(p => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                className={styles.preset}
              >
                <strong>{p.name}</strong>
                <span className={styles.archetype}>{p.archetype}</span>
                <span className={styles.description}>{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
