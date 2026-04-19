import { useEffect, useRef, useState } from 'react';

interface ExportMenuProps {
  recording: boolean;
  onExportPng: () => void;
  onExportJson: () => void;
  onToggleRecording: () => void;
}

/**
 * Collapsed export toolbar — single button opens a small menu with
 * PNG / REC / JSON. Replaces three separate toolbar buttons so the
 * top row stays readable on narrow screens. Recording state still
 * shows as a pulsing indicator on the trigger button.
 */
export function ExportMenu({
  recording,
  onExportPng,
  onExportJson,
  onToggleRecording,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '5px 10px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--text-2)',
    letterSpacing: '0.05em',
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Export options"
        title={recording ? 'Recording in progress — click for options' : 'Export options'}
        style={{
          padding: '0 10px',
          background: open ? 'var(--amber)' : 'var(--bg-card)',
          color: open ? 'var(--bg-deep)' : 'var(--text-3)',
          border: `1px solid ${open ? 'var(--amber)' : 'var(--border)'}`,
          borderRadius: 3,
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.08em',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {recording && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--rust)',
              animation: 'paracosm-rec-pulse 1.2s ease-in-out infinite',
            }}
          />
        )}
        EXPORT {'\u25BC'}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 180,
            padding: 4,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onExportPng();
            }}
            style={itemStyle}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
          >
            <span style={{ color: 'var(--amber)', fontWeight: 800, minWidth: 32 }}>PNG</span>
            <span style={{ color: 'var(--text-3)', fontSize: 9 }}>Current frame</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onToggleRecording();
            }}
            style={{
              ...itemStyle,
              color: recording ? 'var(--rust)' : 'var(--text-2)',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
          >
            <span
              style={{
                color: recording ? 'var(--rust)' : 'var(--amber)',
                fontWeight: 800,
                minWidth: 32,
              }}
            >
              {recording ? 'STOP' : 'REC'}
            </span>
            <span style={{ color: 'var(--text-3)', fontSize: 9 }}>
              {recording ? 'End recording & download' : 'Timelapse to webm'}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onExportJson();
            }}
            style={itemStyle}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
          >
            <span style={{ color: 'var(--amber)', fontWeight: 800, minWidth: 32 }}>JSON</span>
            <span style={{ color: 'var(--text-3)', fontSize: 9 }}>Replay snapshot</span>
          </button>
        </div>
      )}
    </div>
  );
}
