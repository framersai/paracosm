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

export function LeaderConfig({ label, sideColor, data, onChange }: LeaderConfigProps) {
  const update = (field: keyof LeaderFormData, value: string) =>
    onChange({ ...data, [field]: value });

  const updateHexaco = (key: string, value: number) =>
    onChange({ ...data, hexaco: { ...data.hexaco, [key]: value } });

  return (
    <div className="rounded-lg p-4 mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}>
      <h3 className="text-sm font-bold mb-3" style={{ color: sideColor }}>{label}</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
          <input value={data.name} onChange={e => update('name', e.target.value)}
            className="w-full px-2 py-1.5 rounded text-xs font-semibold" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Archetype</label>
          <input value={data.archetype} onChange={e => update('archetype', e.target.value)}
            className="w-full px-2 py-1.5 rounded text-xs" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Colony</label>
          <input value={data.colony} onChange={e => update('colony', e.target.value)}
            className="w-full px-2 py-1.5 rounded text-xs" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Instructions</label>
        <textarea value={data.instructions} onChange={e => update('instructions', e.target.value)} rows={2}
          className="w-full px-2 py-1.5 rounded text-xs resize-none" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
      </div>
      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: 'var(--text-muted)' }}>HEXACO Personality</label>
        <div className="space-y-1">
          {HEXACO_TRAITS.map(t => (
            <HexacoSlider key={t.key} label={t.label} shortLabel={t.short} value={data.hexaco[t.key] ?? 0.5} onChange={v => updateHexaco(t.key, v)} />
          ))}
        </div>
      </div>
    </div>
  );
}
