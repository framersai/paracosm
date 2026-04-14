import { HexacoSlider } from './HexacoSlider';

export interface LeaderFormData {
  name: string;
  archetype: string;
  colony: string;
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
      <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Name</label>
          <input value={data.name} onChange={e => update('name', e.target.value)} style={fieldInput} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Archetype</label>
          <input value={data.archetype} onChange={e => update('archetype', e.target.value)} style={fieldInput} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Colony</label>
          <input value={data.colony} onChange={e => update('colony', e.target.value)} style={fieldInput} />
        </div>
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={fieldLabel}>Instructions</label>
        <textarea value={data.instructions} onChange={e => update('instructions', e.target.value)} rows={2}
          style={{ ...fieldInput, minHeight: '48px', resize: 'vertical' as const, fontSize: '13px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 14px', marginTop: '10px' }}>
        {HEXACO_TRAITS.map(t => (
          <HexacoSlider key={t.key} label={t.label} shortLabel={t.short} value={data.hexaco[t.key] ?? 0.5} onChange={v => updateHexaco(t.key, v)} sideColor={sideColor} />
        ))}
      </div>
    </div>
  );
}
