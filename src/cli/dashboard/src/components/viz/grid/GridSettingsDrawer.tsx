import { useEffect, useRef } from 'react';

export interface GridSettings {
  /** RD animation speed multiplier applied to stepsPerFrame. */
  animSpeed: 0.5 | 1 | 2;
  /** Whether to render the dept cluster ring outlines. */
  deptRings: boolean;
  /**
   * Whether to render the per-dept labeled boxes (e.g. "SCIENCE 1",
   * "ENGINEERING 2") near each cluster's centroid. Off by default
   * because users reported them as visually noisy — "diamond-ish
   * boxes that make no sense" — when a dept only has 1-2 colonists,
   * which is the norm in the demo-capped population of 30. Still
   * available for users who want the spatial-dept readout on top
   * of the colonist glyphs.
   */
  deptLabels: boolean;
  /** Whether to render partner/child connection arcs (when mode allows). */
  lines: boolean;
  /** Background star-dust pattern in empty field areas. */
  dust: boolean;
  /** Draw crosshair + nearest-colonist hint when cursor is between glyphs. */
  crosshair: boolean;
  /** Draw faded previous-turn positions with movement arrows. */
  ghostTrail: boolean;
  /** Enable crash/crisis toast banners. */
  alerts: boolean;
  /** Enable audio cues on birth / death / forge / crisis. */
  sound: boolean;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  animSpeed: 1,
  deptRings: true,
  deptLabels: false,
  // Family lines default OFF. When on, partner arcs (curved) and
  // parent-child lines (dashed) draw between every related colonist
  // on the grid — with 14-30 colonists that's ~15-40 crossing
  // diagonals. Users consistently reported the network of arcs as
  // "weird diamond animations" that appeared on tab open. Keep the
  // setting so users who want to see the relationship graph can
  // enable it from the drawer, but don't fire it by default.
  lines: false,
  dust: true,
  crosshair: true,
  ghostTrail: false,
  alerts: true,
  sound: false,
};

interface DrawerProps {
  open: boolean;
  settings: GridSettings;
  onChange: (next: GridSettings) => void;
  onClose: () => void;
}

/** Floating settings drawer anchored near the trigger button. Small
 *  set of tweaks — keeps the UI skimmable, persistence lives at the
 *  SwarmViz level via localStorage. */
export function GridSettingsDrawer({ open, settings, onChange, onClose }: DrawerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = <K extends keyof GridSettings>(key: K, value: GridSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
          zIndex: 40,
        }}
      />
      <div
        ref={rootRef}
        role="dialog"
        aria-label="Grid viz settings"
        style={{
          position: 'absolute',
          top: 52,
          right: 10,
          width: 260,
          padding: '10px 12px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 10px 32px rgba(0, 0, 0, 0.6)',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--text-2)',
          zIndex: 41,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            fontWeight: 800,
          }}
        >
          <span>Viz Settings</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            style={{
              width: 20,
              height: 20,
              border: '1px solid var(--border)',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--text-3)',
              cursor: 'pointer',
              fontSize: 11,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <Row label="Animation speed">
          {([0.5, 1, 2] as const).map(sp => (
            <Pill
              key={sp}
              active={settings.animSpeed === sp}
              onClick={() => toggle('animSpeed', sp)}
              label={`${sp}x`}
            />
          ))}
        </Row>

        <Row label="Dept rings">
          <Pill active={settings.deptRings} onClick={() => toggle('deptRings', true)} label="on" />
          <Pill active={!settings.deptRings} onClick={() => toggle('deptRings', false)} label="off" />
        </Row>

        <Row label="Dept labels">
          <Pill active={settings.deptLabels} onClick={() => toggle('deptLabels', true)} label="on" />
          <Pill active={!settings.deptLabels} onClick={() => toggle('deptLabels', false)} label="off" />
        </Row>

        <Row label="Family lines">
          <Pill active={settings.lines} onClick={() => toggle('lines', true)} label="on" />
          <Pill active={!settings.lines} onClick={() => toggle('lines', false)} label="off" />
        </Row>

        <Row label="Star dust bg">
          <Pill active={settings.dust} onClick={() => toggle('dust', true)} label="on" />
          <Pill active={!settings.dust} onClick={() => toggle('dust', false)} label="off" />
        </Row>

        <Row label="Crosshair">
          <Pill active={settings.crosshair} onClick={() => toggle('crosshair', true)} label="on" />
          <Pill active={!settings.crosshair} onClick={() => toggle('crosshair', false)} label="off" />
        </Row>

        <Row label="Ghost trail">
          <Pill active={settings.ghostTrail} onClick={() => toggle('ghostTrail', true)} label="on" />
          <Pill active={!settings.ghostTrail} onClick={() => toggle('ghostTrail', false)} label="off" />
        </Row>

        <Row label="Alert toasts">
          <Pill active={settings.alerts} onClick={() => toggle('alerts', true)} label="on" />
          <Pill active={!settings.alerts} onClick={() => toggle('alerts', false)} label="off" />
        </Row>

        <Row label="Sound cues">
          <Pill active={settings.sound} onClick={() => toggle('sound', true)} label="on" />
          <Pill active={!settings.sound} onClick={() => toggle('sound', false)} label="off" />
        </Row>

        <button
          type="button"
          onClick={() => onChange(DEFAULT_GRID_SETTINGS)}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '5px 8px',
            background: 'var(--bg-card)',
            color: 'var(--text-3)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Reset defaults
        </button>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 6,
      }}
    >
      <span style={{ color: 'var(--text-3)', fontSize: 9, letterSpacing: '0.06em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 0 }}>{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 10px',
        background: active ? 'var(--amber)' : 'var(--bg-card)',
        color: active ? 'var(--bg-deep)' : 'var(--text-3)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        fontFamily: 'var(--mono)',
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </button>
  );
}
