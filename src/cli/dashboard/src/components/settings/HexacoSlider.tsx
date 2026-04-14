interface HexacoSliderProps {
  label: string;
  shortLabel: string;
  value: number;
  onChange: (value: number) => void;
  sideColor?: string;
}

export function HexacoSlider({ label, shortLabel, value, onChange, sideColor }: HexacoSliderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <label style={{ fontSize: '12px', color: 'var(--text-2)', minWidth: '32px', fontWeight: 700 }}>
        {shortLabel}
      </label>
      <input
        type="range" min="0" max="1" step="0.05" value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, height: '6px', accentColor: sideColor || 'var(--amber)' }}
      />
      <span style={{ fontSize: '13px', fontFamily: 'var(--mono)', minWidth: '36px', textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}
