import { useMediaQuery, PHONE_QUERY } from './useMediaQuery.js';

interface GridHelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Legend + keyboard shortcuts modal. Opens via `?`. Explains what the
 * colors/flares/rings mean so a first-time viewer isn't staring at
 * unlabeled blobs. Dismisses via Esc or backdrop click.
 */
export function GridHelpOverlay({ open, onClose }: GridHelpOverlayProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Grid viz help"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: phone ? 16 : 24,
          maxWidth: 640,
          maxHeight: '90vh',
          overflow: 'auto',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--text-2)',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.7)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 800,
              color: 'var(--amber)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'var(--mono)',
            }}
          >
            Living Colony Grid — Legend
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 3,
              color: 'var(--text-3)',
              cursor: 'pointer',
              width: 26,
              height: 26,
              fontSize: 13,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <Section title="Modes">
          <Row k="LIVING" v="Full chemistry + colonist glyphs + family lines + event flares" />
          <Row k="MOOD" v="Emphasizes colonist seeds + mood-coded chemistry clouds" />
          <Row k="FORGE" v="Dims field, highlights forge attempts + reuse arcs" />
          <Row k="ECOLOGY" v="Hides glyphs; metrics strip + crisis flares lead" />
          <Row k="DIVERGENCE" v="Only shows colonists alive here but dead on the other side" />
        </Section>

        <Section title="Grid elements">
          <Row
            k={<Swatch color="rgba(232, 180, 74, 0.9)" /> as unknown as string}
            v="Warm amber = high vitality (colony thriving)"
          />
          <Row
            k={<Swatch color="rgba(196, 74, 30, 0.9)" /> as unknown as string}
            v="Rust red = stress concentration (decay / anxiety)"
          />
          <Row k="○ small ring" v="Alive colonist, hover for identity" />
          <Row k="◎ thick ring" v="Featured colonist (drives narrative this turn)" />
          <Row k="○ amber halo" v="Diverged colonist — alive here but dead on the other side" />
          <Row k="DEPT label" v="Cluster centroid label showing dept + live count" />
        </Section>

        <Section title="Event flares">
          <Row
            k={<Swatch color="rgba(154, 205, 96, 0.8)" /> as unknown as string}
            v="Green bloom — birth"
          />
          <Row
            k={<Swatch color="rgba(168, 152, 120, 0.7)" /> as unknown as string}
            v="Grey wave — death"
          />
          <Row
            k={<Swatch color="rgba(232, 180, 74, 0.8)" /> as unknown as string}
            v="Amber dot — forge approved"
          />
          <Row
            k={<Swatch color="rgba(224, 101, 48, 0.7)" /> as unknown as string}
            v="Red flash — forge rejected"
          />
          <Row
            k={<Swatch color="rgba(232, 180, 74, 0.6)" /> as unknown as string}
            v="Amber arc — tool reuse across departments"
          />
          <Row
            k={<Swatch color="rgba(196, 74, 30, 0.8)" /> as unknown as string}
            v="Red ring — crisis shockwave (category-gated)"
          />
        </Section>

        <Section title="Family lines">
          <Row k="— side color, bowed" v="Partner link" />
          <Row k="– teal, dashed" v="Parent → child link" />
        </Section>

        <Section title="Keyboard">
          <Row k="1 / 2 / 3 / 4 / 5" v="Switch mode (Living / Mood / Forge / Ecology / Divergence)" />
          <Row k="← / →" v="Step turn back / forward" />
          <Row k="Space" v="Play / pause timeline" />
          <Row k="?" v="Toggle this help overlay" />
          <Row k="Esc" v="Close popover / this overlay" />
          <Row k="click glyph" v="Open colonist drilldown (HEXACO radar, memory, chat)" />
        </Section>

        <div style={{ fontSize: 9, color: 'var(--text-4)', marginTop: 12 }}>
          Press{' '}
          <kbd
            style={{
              padding: '1px 4px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 2,
              fontFamily: 'var(--mono)',
            }}
          >
            ?
          </kbd>{' '}
          anytime to reopen.
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
          marginBottom: 8,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(110px, 160px) 1fr',
        gap: 12,
        alignItems: 'baseline',
        fontSize: 11,
      }}
    >
      <span
        style={{
          color: 'var(--text-3)',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.05em',
        }}
      >
        {k}
      </span>
      <span style={{ color: 'var(--text-2)', fontFamily: 'var(--sans)' }}>{v}</span>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          borderRadius: 2,
          background: color,
          border: '1px solid var(--border)',
          verticalAlign: 'middle',
        }}
      />
    </span>
  );
}
