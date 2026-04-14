import { useState, useCallback, useEffect } from 'react';
import { useScenarioContext } from '../../App';
import { LeaderConfig, type LeaderFormData } from './LeaderConfig';
import { CustomScenario } from './CustomScenario';

const DEFAULT_HEXACO: Record<string, number> = {
  openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
  agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5,
};

function defaultLeader(idx: number): LeaderFormData {
  return {
    name: idx === 0 ? 'Leader A' : 'Leader B',
    archetype: idx === 0 ? 'The Visionary' : 'The Engineer',
    colony: idx === 0 ? 'Colony Alpha' : 'Colony Beta',
    instructions: '',
    hexaco: { ...DEFAULT_HEXACO },
  };
}

const inputStyle = {
  width: '100%', background: 'var(--bg-card)', color: 'var(--text-1)',
  border: '1px solid var(--border)', padding: '8px 12px', borderRadius: '6px',
  fontFamily: 'var(--sans)', fontSize: '14px', boxSizing: 'border-box' as const,
};

const labelStyle = {
  display: 'block', fontSize: '12px', color: 'var(--text-3)',
  textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  fontWeight: 700, marginBottom: '4px',
};

export function SettingsPanel() {
  const scenario = useScenarioContext();

  const defaultPreset = scenario.presets.find(p => p.id === 'default');
  const initLeaderA = defaultPreset?.leaders?.[0]
    ? { name: defaultPreset.leaders[0].name, archetype: defaultPreset.leaders[0].archetype, colony: 'Colony Alpha', instructions: defaultPreset.leaders[0].instructions, hexaco: defaultPreset.leaders[0].hexaco }
    : defaultLeader(0);
  const initLeaderB = defaultPreset?.leaders?.[1]
    ? { name: defaultPreset.leaders[1].name, archetype: defaultPreset.leaders[1].archetype, colony: 'Colony Beta', instructions: defaultPreset.leaders[1].instructions, hexaco: defaultPreset.leaders[1].hexaco }
    : defaultLeader(1);

  const [leaderA, setLeaderA] = useState<LeaderFormData>(initLeaderA);
  const [leaderB, setLeaderB] = useState<LeaderFormData>(initLeaderB);
  const [turns, setTurns] = useState(scenario.setup.defaultTurns);
  const [seed, setSeed] = useState(scenario.setup.defaultSeed);
  const [startYear, setStartYear] = useState(scenario.setup.defaultStartYear);
  const [population, setPopulation] = useState(scenario.setup.defaultPopulation);
  const [provider, setProvider] = useState('openai');
  const [liveSearch, setLiveSearch] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [status, setStatus] = useState('');
  const [scenarios, setScenarios] = useState<Array<{ id: string; name: string; description: string; departments: number }>>([]);
  const [activeId, setActiveId] = useState(scenario.id);

  useEffect(() => {
    fetch('/scenarios').then(r => r.json()).then(d => { setScenarios(d.scenarios || []); setActiveId(d.active); }).catch(() => {});
  }, []);

  const switchScenario = async (id: string) => {
    if (id === activeId) return;
    try {
      const res = await fetch('/scenario/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch {}
  };

  const launch = useCallback(async () => {
    setLaunching(true);
    setStatus('Starting...');
    try {
      const config = {
        leaders: [
          { ...leaderA, hexaco: leaderA.hexaco },
          { ...leaderB, hexaco: leaderB.hexaco },
        ],
        provider, turns, seed, startYear, population, liveSearch,
        activeDepartments: scenario.departments.map(d => d.id),
      };
      const res = await fetch('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.status === 429) {
        setStatus(`Rate limited: ${data.error || 'too many simulations'}`);
        setLaunching(false);
        return;
      }
      if (data.redirect) {
        setStatus('Running...');
        window.location.hash = '';
      } else {
        setStatus(`Error: ${data.error || 'unknown'}`);
        setLaunching(false);
      }
    } catch (err) {
      setStatus(`Failed: ${err}`);
      setLaunching(false);
    }
  }, [leaderA, leaderB, turns, seed, startYear, population, provider, liveSearch, scenario]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px 24px', background: 'var(--bg-deep)' }}>
      {/* Scenario Selector */}
      {scenarios.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
          padding: '12px 16px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: '8px', boxShadow: 'var(--card-shadow)',
        }}>
          <label style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Scenario
          </label>
          <select
            value={activeId}
            onChange={e => switchScenario(e.target.value)}
            style={{
              background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border)',
              padding: '8px 12px', borderRadius: '6px', fontSize: '14px', fontFamily: 'var(--sans)', flex: 1,
            }}
          >
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.departments} depts)</option>
            ))}
          </select>
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
            or compile a custom scenario below
          </span>
        </div>
      )}

      <h2 style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', marginBottom: '12px' }}>
        {scenario.labels.name}
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px' }}>
        Configure two leaders and launch. {scenario.departments.length} departments: {scenario.departments.map(d => d.label).join(', ')}.
      </p>

      {/* Leaders grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <LeaderConfig label="Commander A" sideColor="var(--vis)" data={leaderA} onChange={setLeaderA} />
        <LeaderConfig label="Commander B" sideColor="var(--eng)" data={leaderB} onChange={setLeaderB} />
      </div>

      {/* Simulation config */}
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
        padding: '16px', marginBottom: '16px', boxShadow: 'var(--card-shadow)',
      }}>
        <h3 style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: 'var(--text-2)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Simulation
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Turns</label>
            <input type="number" value={turns} onChange={e => setTurns(parseInt(e.target.value) || 12)} min={1} max={20} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Seed</label>
            <input type="number" value={seed} onChange={e => setSeed(parseInt(e.target.value) || 950)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Start Year</label>
            <input type="number" value={startYear} onChange={e => setStartYear(parseInt(e.target.value) || 2035)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Population</label>
            <input type="number" value={population} onChange={e => setPopulation(parseInt(e.target.value) || 100)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
          <div>
            <label style={labelStyle}>Provider</label>
            <select value={provider} onChange={e => setProvider(e.target.value)} style={inputStyle}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Live Search</label>
            <select value={String(liveSearch)} onChange={e => setLiveSearch(e.target.value === 'true')} style={inputStyle}>
              <option value="false">Off</option>
              <option value="true">On (requires search API keys)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Custom Scenario */}
      <CustomScenario />

      {/* Launch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={launch}
          disabled={launching}
          style={{
            background: 'linear-gradient(135deg, var(--rust), #c44a1e)',
            color: 'white', border: 'none', padding: '12px 36px', borderRadius: '6px',
            fontSize: '16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--sans)',
            opacity: launching ? 0.5 : 1,
            boxShadow: '0 4px 16px rgba(224, 101, 48, 0.3)',
          }}
        >
          {launching ? 'Running...' : 'Launch Simulation'}
        </button>
        {status && <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>{status}</span>}
      </div>
    </div>
  );
}
