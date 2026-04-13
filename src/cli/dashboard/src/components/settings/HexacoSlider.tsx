interface HexacoSliderProps {
  label: string;
  shortLabel: string;
  value: number;
  onChange: (value: number) => void;
}

export function HexacoSlider({ label, shortLabel, value, onChange }: HexacoSliderProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-4 font-bold font-mono" style={{ color: 'var(--accent-primary)' }}>{shortLabel}</span>
      <span className="w-28 truncate" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 rounded accent-[var(--accent-primary)]"
        style={{ accentColor: 'var(--accent-primary)' }}
      />
      <span className="w-10 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}
