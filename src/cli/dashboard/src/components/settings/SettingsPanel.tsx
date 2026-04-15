import { useState, useCallback, useEffect } from 'react';
import { useDashboardNavigation, useScenarioContext } from '../../App';
import { LeaderConfig, type LeaderFormData } from './LeaderConfig';
import { ScenarioEditor } from './ScenarioEditor';
import { getDashboardTabFromHref, resolveSetupRedirectHref } from '../../tab-routing';
import { subscribeScenarioUpdates } from '../../scenario-sync';


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
  const navigateTab = useDashboardNavigation();

  const defaultPreset = scenario.presets.find(p => p.id === 'default');
  const initLeaderA = defaultPreset?.leaders?.[0]
    ? { name: defaultPreset.leaders[0].name, archetype: defaultPreset.leaders[0].archetype, colony: 'Colony Alpha', instructions: defaultPreset.leaders[0].instructions, hexaco: defaultPreset.leaders[0].hexaco }
    : defaultLeader(0);
  const initLeaderB = defaultPreset?.leaders?.[1]
    ? { name: defaultPreset.leaders[1].name, archetype: defaultPreset.leaders[1].archetype, colony: 'Colony Beta', instructions: defaultPreset.leaders[1].instructions, hexaco: defaultPreset.leaders[1].hexaco }
    : defaultLeader(1);

  const [leaderA, setLeaderA] = useState<LeaderFormData>(initLeaderA);
  const [leaderB, setLeaderB] = useState<LeaderFormData>(initLeaderB);

  // Re-populate from presets when scenario data loads (async fetch)
  // Depend on presets length because the fallback has presets:[] but same id
  useEffect(() => {
    const p = scenario.presets.find(p => p.id === 'default');
    if (p?.leaders?.[0]) {
      setLeaderA({
        name: p.leaders![0].name,
        archetype: p.leaders![0].archetype,
        colony: 'Colony Alpha',
        instructions: p.leaders![0].instructions,
        hexaco: { ...p.leaders![0].hexaco },
      });
    }
    if (p?.leaders?.[1]) {
      setLeaderB({
        name: p.leaders![1].name,
        archetype: p.leaders![1].archetype,
        colony: 'Colony Beta',
        instructions: p.leaders![1].instructions,
        hexaco: { ...p.leaders![1].hexaco },
      });
    }
  }, [scenario.id, scenario.presets.length]);
  const [turns, setTurns] = useState(scenario.setup.defaultTurns);
  const [seed, setSeed] = useState(scenario.setup.defaultSeed);
  const [startYear, setStartYear] = useState(scenario.setup.defaultStartYear);
  const [yearsPerTurn, setYearsPerTurn] = useState(scenario.setup.defaultYearsPerTurn || 0);
  const [population, setPopulation] = useState(scenario.setup.defaultPopulation);
  const [provider, setProvider] = useState('openai');
  const [liveSearch, setLiveSearch] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [status, setStatus] = useState('');
  const [scenarios, setScenarios] = useState<Array<{ id: string; name: string; description: string; departments: number }>>([]);
  const [activeId, setActiveId] = useState(scenario.id);

  // API key state: env flags tell us what's configured server-side; overrides are user-entered values
  const [envKeys, setEnvKeys] = useState<Record<string, boolean>>({});
  const [keyOverrides, setKeyOverrides] = useState<Record<string, string>>({
    openai: '', anthropic: '', serper: '', firecrawl: '', tavily: '', cohere: '',
  });

  const refreshScenarioCatalog = useCallback(() => {
    fetch('/scenarios')
      .then(r => r.json())
      .then(d => {
        setScenarios(d.scenarios || []);
        setActiveId(d.active);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshScenarioCatalog();
    // Fetch which API keys are configured from .env
    fetch('/admin-config')
      .then(r => r.json())
      .then(data => { if (data.keys) setEnvKeys(data.keys); })
      .catch(() => {});
    return subscribeScenarioUpdates(window, refreshScenarioCatalog);
  }, [refreshScenarioCatalog]);

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
      const config: Record<string, unknown> = {
        leaders: [
          { ...leaderA, hexaco: leaderA.hexaco },
          { ...leaderB, hexaco: leaderB.hexaco },
        ],
        provider, turns, seed, startYear, yearsPerTurn: yearsPerTurn || undefined, population, liveSearch,
        activeDepartments: scenario.departments.map(d => d.id),
      };
      // Attach any user-provided key overrides (never sends .env values)
      if (keyOverrides.openai) config.apiKey = keyOverrides.openai;
      if (keyOverrides.anthropic) config.anthropicKey = keyOverrides.anthropic;
      if (keyOverrides.serper) config.serperKey = keyOverrides.serper;
      if (keyOverrides.firecrawl) config.firecrawlKey = keyOverrides.firecrawl;
      if (keyOverrides.tavily) config.tavilyKey = keyOverrides.tavily;
      if (keyOverrides.cohere) config.cohereKey = keyOverrides.cohere;
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
        const targetHref = resolveSetupRedirectHref(window.location.href, data.redirect);
        const resolvedTab = getDashboardTabFromHref(targetHref);
        navigateTab(resolvedTab === 'about' ? 'sim' : resolvedTab as Exclude<typeof resolvedTab, 'about'>);
      } else {
        setStatus(`Error: ${data.error || 'unknown'}`);
        setLaunching(false);
      }
    } catch (err) {
      setStatus(`Failed: ${err}`);
      setLaunching(false);
    }
  }, [leaderA, leaderB, turns, seed, startYear, population, provider, liveSearch, navigateTab, scenario, keyOverrides]);

  return (
    <div className="settings-content" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px 24px', background: 'var(--bg-deep)' }}>
      {/* Scenario Selector */}
      {scenarios.length > 0 && (
        <div className="responsive-stack" style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
          padding: '12px 16px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: '8px', boxShadow: 'var(--card-shadow)',
        }}>
          <label htmlFor="scenario-select" style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
            Scenario
          </label>
          <select
            id="scenario-select"
            value={activeId}
            onChange={e => switchScenario(e.target.value)}
            style={{
              background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border)',
              padding: '8px 12px', borderRadius: '6px', fontSize: '14px', fontFamily: 'var(--sans)', flex: 1,
            }}
          >
            {scenarios.map(s => {
              const sourceTag = s.description?.includes('(memory)')
                ? ' [memory]'
                : s.description?.includes('(disk)')
                ? ' [disk]'
                : s.description?.includes('compiled')
                ? ' [compiled]'
                : '';
              return (
                <option key={s.id} value={s.id}>
                  {s.id === activeId ? '\u25CF ' : ''}{s.name} ({s.departments} depts){sourceTag}
                </option>
              );
            })}
          </select>
          <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            Active: <strong style={{ color: 'var(--amber)' }}>{activeId}</strong>
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
      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <LeaderConfig label="Commander A" sideColor="var(--vis)" data={leaderA} onChange={setLeaderA} />
        <LeaderConfig label="Commander B" sideColor="var(--eng)" data={leaderB} onChange={setLeaderB} />
      </div>

      {/* Simulation config */}
      <fieldset style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
        padding: '16px', marginBottom: '16px', boxShadow: 'var(--card-shadow)',
      }}>
        <legend style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 8px' }}>
          Simulation
        </legend>
        <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor="turns-input" style={labelStyle}>Turns</label>
            <input id="turns-input" type="number" value={turns} onChange={e => setTurns(parseInt(e.target.value) || 12)} min={1} max={20} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="ypt-input" style={labelStyle}>Yrs/Turn</label>
            <input id="ypt-input" type="number" value={yearsPerTurn} onChange={e => setYearsPerTurn(parseInt(e.target.value) || 0)} min={0} max={50} placeholder="auto" title="Years per turn. 0 = accelerating schedule (default). 1 = 1 year per turn. 5 = 5 years per turn." style={inputStyle} />
          </div>
          <div>
            <label htmlFor="seed-input" style={labelStyle}>Seed</label>
            <input id="seed-input" type="number" value={seed} onChange={e => setSeed(parseInt(e.target.value) || 950)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="year-input" style={labelStyle}>Start Year</label>
            <input id="year-input" type="number" value={startYear} onChange={e => setStartYear(parseInt(e.target.value) || 2035)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="pop-input" style={labelStyle}>Population</label>
            <input id="pop-input" type="number" value={population} onChange={e => setPopulation(parseInt(e.target.value) || 100)} style={inputStyle} />
          </div>
        </div>
        <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
          <div>
            <label htmlFor="provider-select" style={labelStyle}>Provider</label>
            <select id="provider-select" value={provider} onChange={e => setProvider(e.target.value)} style={inputStyle}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label htmlFor="search-select" style={labelStyle}>Live Search</label>
            <select id="search-select" value={String(liveSearch)} onChange={e => setLiveSearch(e.target.value === 'true')} style={inputStyle}>
              <option value="false">Off</option>
              <option value="true">On (requires search API keys)</option>
            </select>
          </div>
        </div>
      </fieldset>

      {/* API Keys */}
      <fieldset style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
        padding: '16px', marginBottom: '16px', boxShadow: 'var(--card-shadow)',
      }}>
        <legend style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 8px' }}>
          API Keys
        </legend>
        <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '12px', lineHeight: 1.7 }}>
          <p style={{ marginBottom: '6px' }}>
            <strong style={{ color: 'var(--text-1)' }}>How key resolution works:</strong> The server checks for keys in this order:
            your session overrides below, then the server .env file. If a key exists in either place, it's used. Values entered here are never displayed back.
          </p>
          <p style={{ marginBottom: '6px' }}>
            <strong style={{ color: 'var(--green)' }}>Rate limiting:</strong> The hosted demo limits simulations per IP per day when using the server's API keys.
            Provide your own <strong>OpenAI</strong> or <strong>Anthropic</strong> key to bypass the rate limit and run unlimited simulations.
            Only one LLM provider key is required. If both are provided, the simulation uses whichever you select as the provider.
          </p>
          <p style={{ marginBottom: '6px' }}>
            <strong style={{ color: 'var(--amber)' }}>Research and citations:</strong> Live web search requires at least one search key (Serper, Firecrawl, Tavily).
            Without any search key, departments fall back to the scenario's built-in research bundle. Cohere enables neural reranking of search results for higher-quality citations.
            These are optional enhancements, not required to run a simulation.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--rust)' }}>No keys at all?</strong> If neither a server .env key nor a session override exists for any LLM provider,
            the simulation cannot run. You need at least one OpenAI or Anthropic key configured somewhere.
          </p>
        </div>
        <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {([
            ['openai', 'OpenAI', 'Required (or Anthropic). Powers commander, departments, crisis director.'],
            ['anthropic', 'Anthropic', 'Required (or OpenAI). Alternative LLM provider for all simulation roles.'],
            ['serper', 'Serper (search)', 'Optional. Enables live Google search for department research citations.'],
            ['firecrawl', 'Firecrawl (scrape)', 'Optional. Enables web page scraping for deeper research context.'],
            ['tavily', 'Tavily (search)', 'Optional. Additional search provider. Multiple providers improve coverage.'],
            ['cohere', 'Cohere (rerank)', 'Optional. Neural reranking of search results for citation quality.'],
          ] as const).map(([key, label, desc]) => (
            <div key={key}>
              <label htmlFor={`key-${key}`} style={labelStyle}>
                {label}
                {envKeys[key] && (
                  <span style={{ color: 'var(--color-success, #6aad48)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '6px' }}>
                    (.env active)
                  </span>
                )}
              </label>
              <input
                id={`key-${key}`}
                type="password"
                autoComplete="off"
                value={keyOverrides[key]}
                onChange={e => setKeyOverrides(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={envKeys[key] ? 'Using .env value' : 'Not configured'}
                style={inputStyle}
              />
              <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '3px', lineHeight: 1.4 }}>{desc}</div>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Scenario Editor: create, import, export, compile */}
      <ScenarioEditor />

      {/* Launch */}
      <div className="responsive-stack" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={launch}
          disabled={launching}
          aria-label={launching ? 'Simulation running' : 'Launch simulation'}
          style={{
            background: 'linear-gradient(135deg, var(--rust), #c44a1e)',
            color: 'white', border: 'none', padding: '12px 36px', borderRadius: '6px',
            fontSize: '16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--sans)',
            opacity: launching ? 0.5 : 1,
            boxShadow: '0 4px 16px rgba(224, 101, 48, 0.3)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          {launching ? 'Running...' : 'Launch Simulation'}
        </button>
        {status && <span role="status" style={{ fontSize: '13px', color: 'var(--text-3)' }}>{status}</span>}
      </div>
    </div>
  );
}
