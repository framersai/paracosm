import { useEffect, useRef, useState } from 'react';
import type { CellSnapshot } from '../viz-types.js';

export interface SearchMatch {
  cell: CellSnapshot;
  side: 'a' | 'b';
  leaderName: string;
  sideColor: string;
}

interface ColonistSearchProps {
  value: string;
  onChange: (q: string) => void;
  matches: SearchMatch[];
  onPick?: (match: SearchMatch) => void;
}

/**
 * Search input above the leader panels. Types a name fragment → any
 * matching colonists on either side get a bright highlight ring and
 * non-matches dim. Empty string = normal render.
 */
export function ColonistSearch({ value, onChange, matches, onPick }: ColonistSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const matchCount = matches.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showDropdown = focused && value.trim().length > 0 && matches.length > 0;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: 'var(--bg-deep)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontFamily: 'var(--mono)',
          color: 'var(--text-4)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Find
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        placeholder="colonist name… (press / to focus)"
        aria-label="Search colonist by name"
        style={{
          flex: 1,
          minWidth: 0,
          padding: '3px 8px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--text-1)',
          outline: 'none',
        }}
      />
      {showDropdown && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            left: 44,
            top: '100%',
            width: 'calc(100% - 180px)',
            maxWidth: 420,
            maxHeight: 280,
            overflowY: 'auto',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
            zIndex: 30,
            marginTop: 2,
          }}
        >
          {matches.slice(0, 10).map((m, i) => (
            <button
              key={`${m.side}-${m.cell.agentId}-${i}`}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={e => {
                e.preventDefault();
                onPick?.(m);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '5px 10px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--text-2)',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <span
                style={{
                  padding: '1px 5px',
                  borderRadius: 2,
                  background: `${m.sideColor}33`,
                  color: m.sideColor,
                  fontSize: 8,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                }}
              >
                {m.side.toUpperCase()}
              </span>
              <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>{m.cell.name}</span>
              <span style={{ color: 'var(--text-4)' }}>
                {m.cell.department?.toUpperCase?.() || ''} · {m.cell.mood}
                {typeof m.cell.age === 'number' ? ` · age ${m.cell.age}` : ''}
              </span>
              {m.cell.featured && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 8,
                    padding: '1px 4px',
                    borderRadius: 2,
                    background: `${m.sideColor}33`,
                    color: m.sideColor,
                  }}
                >
                  FEATURED
                </span>
              )}
            </button>
          ))}
          {matches.length > 10 && (
            <div
              style={{
                padding: '4px 10px',
                fontSize: 8,
                color: 'var(--text-4)',
                fontStyle: 'italic',
                fontFamily: 'var(--mono)',
              }}
            >
              + {matches.length - 10} more…
            </div>
          )}
        </div>
      )}
      {value && (
        <>
          <span
            style={{
              fontSize: 9,
              fontFamily: 'var(--mono)',
              color: matchCount > 0 ? 'var(--amber)' : 'var(--rust)',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
            }}
          >
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            style={{
              padding: '2px 6px',
              background: 'var(--bg-card)',
              color: 'var(--text-3)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 9,
            }}
          >
            clear
          </button>
        </>
      )}
    </div>
  );
}
