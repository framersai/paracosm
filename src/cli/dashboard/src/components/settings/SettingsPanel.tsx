import { useState, useCallback } from 'react';
import { useScenarioContext } from '../../App';
import { LeaderConfig, type LeaderFormData } from './LeaderConfig';

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

export function SettingsPanel() {
  const scenario = useScenarioContext();

  // Initialize from scenario presets if available
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

  const launch = useCallback(async () => {
    setLaunching(true);
    setStatus('Starting...');
    try {
      const config = {
        leaders: [
          { ...leaderA, hexaco: leaderA.hexaco },
          { ...leaderB, hexaco: leaderB.hexaco },
        ],
        provider,
        turns,
        seed,
        startYear,
        population,
        liveSearch,
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
        // Navigate to sim tab via URL hash
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
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-bold mb-1">{scenario.labels.name} Settings</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Configure two leaders and launch a simulation. {scenario.departments.length} departments: {scenario.departments.map(d => d.label).join(', ')}.
        </p>

        {/* Leaders */}
        <LeaderConfig label="Commander A" sideColor="var(--side-a)" data={leaderA} onChange={setLeaderA} />
        <LeaderConfig label="Commander B" sideColor="var(--side-b)" data={leaderB} onChange={setLeaderB} />

        {/* Simulation config */}
        <div className="rounded-lg p-4 mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Simulation</h3>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Turns</label>
              <input type="number" value={turns} onChange={e => setTurns(parseInt(e.target.value) || 12)} min={1} max={20}
                className="w-full px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Seed</label>
              <input type="number" value={seed} onChange={e => setSeed(parseInt(e.target.value) || 950)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Start Year</label>
              <input type="number" value={startYear} onChange={e => setStartYear(parseInt(e.target.value) || 2035)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Population</label>
              <input type="number" value={population} onChange={e => setPopulation(parseInt(e.target.value) || 100)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Provider</label>
              <select value={provider} onChange={e => setProvider(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Live Search</label>
              <select value={String(liveSearch)} onChange={e => setLiveSearch(e.target.value === 'true')}
                className="w-full px-2 py-1.5 rounded text-xs" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
                <option value="false">Off</option>
                <option value="true">On</option>
              </select>
            </div>
          </div>
        </div>

        {/* Launch */}
        <div className="flex items-center gap-4">
          <button
            onClick={launch}
            disabled={launching}
            className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent-primary)', color: 'var(--text-contrast)' }}
          >
            {launching ? 'Running...' : 'Launch Simulation'}
          </button>
          {status && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{status}</span>}
        </div>
      </div>
    </div>
  );
}
