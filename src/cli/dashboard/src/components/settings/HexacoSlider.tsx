interface HexacoSliderProps {
  label: string;
  shortLabel: string;
  value: number;
  onChange: (value: number) => void;
  sideColor?: string;
}

function describeValue(short: string, val: number): string {
  if (short === 'O') return val > 0.7 ? 'creative' : val < 0.3 ? 'conventional' : '';
  if (short === 'C') return val > 0.7 ? 'disciplined' : val < 0.3 ? 'flexible' : '';
  if (short === 'E') return val > 0.7 ? 'charismatic' : val < 0.3 ? 'reserved' : '';
  if (short === 'A') return val > 0.7 ? 'cooperative' : val < 0.3 ? 'competitive' : '';
  if (short === 'Em') return val > 0.7 ? 'empathetic' : val < 0.3 ? 'calm' : '';
  if (short === 'HH') return val > 0.7 ? 'sincere' : val < 0.3 ? 'strategic' : '';
  return '';
}

export function HexacoSlider({ label, shortLabel, value, onChange, sideColor }: HexacoSliderProps) {
  const desc = describeValue(shortLabel, value);
  const color = sideColor || 'var(--amber)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <label style={{ fontSize: '12px', color: 'var(--text-2)', minWidth: '32px', fontWeight: 700 }}>
        {shortLabel}
      </label>
      <input
        type="range" min="0" max="1" step="0.05" value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: color }}
      />
      <span style={{ fontSize: '13px', fontFamily: 'var(--mono)', minWidth: '36px', textAlign: 'right', color: 'var(--text-1)', fontWeight: 600 }}>
        {value.toFixed(2)}
      </span>
      {desc && (
        <span style={{ fontSize: '9px', color: 'var(--text-3)', minWidth: '55px', fontFamily: 'var(--mono)' }}>
          {desc}
        </span>
      )}
    </div>
  );
}
