import { HexacoSlider } from './HexacoSlider';

export interface LeaderFormData {
  name: string;
  archetype: string;
  unit: string;
  instructions: string;
  hexaco: Record<string, number>;
}

interface LeaderConfigProps {
  label: string;
  sideColor: string;
  data: LeaderFormData;
  onChange: (data: LeaderFormData) => void;
}

const HEXACO_TRAITS = [
  { key: 'openness', label: 'Openness', short: 'O' },
  { key: 'conscientiousness', label: 'Conscientiousness', short: 'C' },
  { key: 'extraversion', label: 'Extraversion', short: 'E' },
  { key: 'agreeableness', label: 'Agreeableness', short: 'A' },
  { key: 'emotionality', label: 'Emotionality', short: 'Em' },
  { key: 'honestyHumility', label: 'Honesty-Humility', short: 'HH' },
];

const fieldInput = {
  width: '100%', background: 'var(--bg-card)', color: 'var(--text-1)',
  border: '1px solid var(--border)', padding: '8px 12px', borderRadius: '6px',
  fontFamily: 'var(--sans)', fontSize: '14px', boxSizing: 'border-box' as const,
  minWidth: 0,
};

const fieldLabel = {
  display: 'block', fontSize: '12px', color: 'var(--text-3)',
  textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  fontWeight: 700, marginBottom: '4px',
};

const PERSONALITY_PRESETS = [
  { id: 'visionary', label: 'The Visionary (high O, low C)', hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.30, honestyHumility: 0.65 } },
  { id: 'engineer', label: 'The Engineer (high C, low O)', hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.30, agreeableness: 0.60, emotionality: 0.70, honestyHumility: 0.90 } },
  { id: 'diplomat', label: 'The Diplomat (high A, high HH)', hexaco: { openness: 0.60, conscientiousness: 0.55, extraversion: 0.70, agreeableness: 0.90, emotionality: 0.50, honestyHumility: 0.85 } },
  { id: 'maverick', label: 'The Maverick (high O, high E, low A)', hexaco: { openness: 0.90, conscientiousness: 0.40, extraversion: 0.95, agreeableness: 0.25, emotionality: 0.20, honestyHumility: 0.40 } },
  { id: 'guardian', label: 'The Guardian (high C, high Em, high HH)', hexaco: { openness: 0.30, conscientiousness: 0.85, extraversion: 0.40, agreeableness: 0.70, emotionality: 0.85, honestyHumility: 0.95 } },
  { id: 'strategist', label: 'The Strategist (balanced, low Em)', hexaco: { openness: 0.65, conscientiousness: 0.75, extraversion: 0.50, agreeableness: 0.45, emotionality: 0.20, honestyHumility: 0.55 } },
  { id: 'balanced', label: 'Balanced (all 0.50)', hexaco: { openness: 0.50, conscientiousness: 0.50, extraversion: 0.50, agreeableness: 0.50, emotionality: 0.50, honestyHumility: 0.50 } },
];

export function LeaderConfig({ label, sideColor, data, onChange }: LeaderConfigProps) {
  const update = (field: keyof LeaderFormData, value: string) =>
    onChange({ ...data, [field]: value });

  const updateHexaco = (key: string, value: number) =>
    onChange({ ...data, hexaco: { ...data.hexaco, [key]: value } });

  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
      padding: '16px', minWidth: 0, overflow: 'hidden',
      boxShadow: 'var(--card-shadow)',
    }}>
      <h3 style={{ fontSize: '16px', fontFamily: 'var(--mono)', marginBottom: '12px', color: sideColor }}>
        {label}
      </h3>
      <div className="responsive-stack" style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Name</label>
          <input value={data.name} onChange={e => update('name', e.target.value)} style={fieldInput} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Archetype</label>
          <input value={data.archetype} onChange={e => update('archetype', e.target.value)} style={fieldInput} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Unit</label>
          <input value={data.unit} onChange={e => update('unit', e.target.value)} style={fieldInput} />
        </div>
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={fieldLabel}>Instructions</label>
        <textarea value={data.instructions} onChange={e => update('instructions', e.target.value)} rows={3} aria-label={`${label} instructions`}
          style={{ ...fieldInput, minHeight: '60px', resize: 'vertical' as const, fontSize: '13px', lineHeight: 1.5 }} />
      </div>
      {/* Personality Presets */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', marginBottom: '6px' }}>
        <label style={{ ...fieldLabel, marginBottom: 0 }}>Personality</label>
        <select
          className="pc-select"
          onChange={e => {
            const p = PERSONALITY_PRESETS.find(p => p.id === e.target.value);
            if (p) onChange({ ...data, hexaco: { ...p.hexaco } });
          }}
          style={{ ...fieldInput, width: 'auto', flex: 1, fontSize: '12px', padding: '4px 8px' }}
          defaultValue=""
        >
          <option value="" disabled>Apply preset...</option>
          {PERSONALITY_PRESETS.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      {/* HEXACO Sliders */}
      <div className="responsive-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 14px' }}>
        {HEXACO_TRAITS.map(t => (
          <HexacoSlider key={t.key} label={t.label} shortLabel={t.short} value={data.hexaco[t.key] ?? 0.5} onChange={v => updateHexaco(t.key, v)} sideColor={sideColor} />
        ))}
      </div>
    </div>
  );
}
