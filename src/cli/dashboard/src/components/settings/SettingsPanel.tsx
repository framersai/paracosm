import { useState, useCallback, useEffect } from 'react';
import { useDashboardNavigation, useScenarioContext } from '../../App';
import { useScenarioLabels } from '../../hooks/useScenarioLabels';
import { ActorConfig, type ActorFormData } from './ActorConfig';
import { ScenarioEditor } from './ScenarioEditor';
import { LoadPriorRunsCTA } from './LoadPriorRunsCTA';
import { EventLogPanel } from '../log/EventLogPanel';
import { SubTabNav } from '../shared/SubTabNav';
import { getDashboardTabFromHref, resolveSetupRedirectHref, setSubTabUrlParam } from '../../tab-routing';
import { subscribeScenarioUpdates } from '../../scenario-sync';
import type { SimEvent } from '../../hooks/useSSE';

type SettingsSubTab = 'config' | 'log';

const SETTINGS_SUB_TABS = [
  { id: 'config' as const, label: 'Settings' },
  { id: 'log' as const, label: 'Event Log' },
];
import {
  ECONOMICS_PROFILE_OPTIONS,
  describeServerMode,
  type DashboardEconomicsProfileId,
  type DashboardServerMode,
} from './economicsProfiles';
import {
  SETTINGS_LABEL_STYLE,
  SETTINGS_SECTION_HEADER_STYLE,
} from './shared/settingsStyles';

const DEFAULT_HEXACO: Record<string, number> = {
  openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
  agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5,
};

/**
 * Model options per provider, ordered cheapest first. Labels include a
 * rough price hint so users can eyeball the cost impact before they pick.
 * Values mirror the keys in the server-side MODEL_PRICING table.
 */
const MODEL_OPTIONS: Record<'openai' | 'anthropic', Array<{ value: string; label: string }>> = {
  openai: [
    { value: 'gpt-5.4-nano',  label: 'gpt-5.4-nano  ($0.20 / $1.25 per 1M)' },
    { value: 'gpt-5.4-mini',  label: 'gpt-5.4-mini  ($0.75 / $4.50 per 1M)' },
    { value: 'gpt-5.4',       label: 'gpt-5.4       ($2.50 / $15.00 per 1M)' },
    { value: 'gpt-5.4-pro',   label: 'gpt-5.4-pro   ($30 / $180 per 1M — avoid)' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5    ($1 / $5 per 1M)' },
    { value: 'claude-sonnet-4-6',         label: 'Sonnet 4.6   ($3 / $15 per 1M)' },
    { value: 'claude-opus-4-7',           label: 'Opus 4.7     ($5 / $25 per 1M)' },
  ],
};

type ModelTier = 'departments' | 'commander' | 'director' | 'judge' | 'agentReactions';

/**
 * Default BYO-key tier selections: flagship for forging, mid-tier for
 * structured output, cheapest for high-volume reactions.
 */
const DEFAULT_TIER_MODELS: Record<'openai' | 'anthropic', Record<ModelTier, string>> = {
  openai: {
    departments:    'gpt-5.4',
    commander:      'gpt-5.4-mini',
    director:       'gpt-5.4-mini',
    judge:          'gpt-5.4-mini',
    agentReactions: 'gpt-5.4-nano',
  },
  anthropic: {
    departments:    'claude-sonnet-4-6',
    commander:      'claude-haiku-4-5-20251001',
    director:       'claude-haiku-4-5-20251001',
    judge:          'claude-haiku-4-5-20251001',
    agentReactions: 'claude-haiku-4-5-20251001',
  },
};

const TIER_LABELS: Record<ModelTier, { label: string; help: string }> = {
  departments:    { label: 'Departments (forges)',   help: 'Writes code, schemas, test cases. Quality matters — cheap tier produces broken forges.' },
  commander:      { label: 'Commander',              help: 'Picks option from department reports. Mid-tier is fine.' },
  director:       { label: 'Event Director',         help: 'Generates crisis events as structured JSON batches.' },
  judge:          { label: 'Judge (code review)',    help: 'Reviews forged tool code for safety + correctness.' },
  agentReactions: { label: 'Agent Reactions',        help: 'One to two sentences per colonist per turn. Highest volume — pick cheapest.' },
};

function defaultLeader(idx: number): ActorFormData {
  return {
    name: idx === 0 ? 'Actor A' : 'Actor B',
    archetype: idx === 0 ? 'The Visionary' : 'The Engineer',
    unit: idx === 0 ? 'Colony Alpha' : 'Colony Beta',
    instructions: '',
    hexaco: { ...DEFAULT_HEXACO },
  };
}

const inputStyle = {
  width: '100%', background: 'var(--bg-card)', color: 'var(--text-1)',
  border: '1px solid var(--border)', padding: '8px 12px', borderRadius: '6px',
  fontFamily: 'var(--sans)', fontSize: '14px', boxSizing: 'border-box' as const,
};

export interface SettingsPanelProps {
  /** SSE events to feed the embedded EventLogPanel sub-tab. Optional
   *  so callers that don't care about Log (or mount Settings before the
   *  SSE pipe is ready) can omit it; the sub-tab just renders an empty
   *  log in that case. */
  events?: SimEvent[];
  /** Sub-tab to land on. Used by tab-routing redirects: `?tab=log`
   *  lands on `settings?subTab=log` for backward compat with deep
   *  links from before the merge. */
  initialSubTab?: SettingsSubTab;
}

export function SettingsPanel({ events = [], initialSubTab = 'config' }: SettingsPanelProps = {}) {
  const [subTab, setSubTab] = useState<SettingsSubTab>(initialSubTab);
  // Persist sub-tab in the URL so refresh / shared links land back on
  // the user's last open panel. 'config' is the default — omit the
  // param for that case to keep the URL clean.
  const handleSubTabChange = useCallback((next: SettingsSubTab) => {
    setSubTab(next);
    setSubTabUrlParam(next === 'config' ? null : next);
  }, []);
  const scenario = useScenarioContext();
  const labels = useScenarioLabels();
  const navigateTab = useDashboardNavigation();

  const defaultPreset = scenario.presets.find(p => p.id === 'default');
  // Spread the hexaco object so the form's per-trait edits don't mutate
  // the preset that lives in the scenario context (which is shared with
  // every other consumer that reads scenario.presets).
  const initLeaderA = defaultPreset?.actors?.[0]
    ? { name: defaultPreset.actors[0].name, archetype: defaultPreset.actors[0].archetype, unit: 'Colony Alpha', instructions: defaultPreset.actors[0].instructions, hexaco: { ...defaultPreset.actors[0].hexaco } }
    : defaultLeader(0);
  const initLeaderB = defaultPreset?.actors?.[1]
    ? { name: defaultPreset.actors[1].name, archetype: defaultPreset.actors[1].archetype, unit: 'Colony Beta', instructions: defaultPreset.actors[1].instructions, hexaco: { ...defaultPreset.actors[1].hexaco } }
    : defaultLeader(1);

  const [leaderA, setLeaderA] = useState<ActorFormData>(initLeaderA);
  const [leaderB, setLeaderB] = useState<ActorFormData>(initLeaderB);

  // Re-populate from presets when scenario data loads (async fetch)
  // Depend on presets length because the fallback has presets:[] but same id
  useEffect(() => {
    const p = scenario.presets.find(p => p.id === 'default');
    if (p?.actors?.[0]) {
      setLeaderA({
        name: p.actors[0].name,
        archetype: p.actors[0].archetype,
        unit: 'Colony Alpha',
        instructions: p.actors[0].instructions,
        hexaco: { ...p.actors[0].hexaco },
      });
    }
    if (p?.actors?.[1]) {
      setLeaderB({
        name: p.actors[1].name,
        archetype: p.actors[1].archetype,
        unit: 'Colony Beta',
        instructions: p.actors[1].instructions,
        hexaco: { ...p.actors[1].hexaco },
      });
    }
  }, [scenario.id, scenario.presets.length]);
  const [turns, setTurns] = useState(scenario.setup.defaultTurns);
  const [seed, setSeed] = useState(scenario.setup.defaultSeed);
  const [startTime, setStartTime] = useState(scenario.setup.defaultStartTime);
  const [timePerTurn, setTimePerTurn] = useState(scenario.setup.defaultTimePerTurn || 0);
  const [population, setPopulation] = useState(scenario.setup.defaultPopulation);
  const [provider, setProvider] = useState('openai');
  const [liveSearch, setLiveSearch] = useState(false);
  const [economicsProfile, setEconomicsProfile] = useState<DashboardEconomicsProfileId>('balanced');
  const [launching, setLaunching] = useState(false);
  const [status, setStatus] = useState('');
  const [scenarios, setScenarios] = useState<Array<{ id: string; name: string; description: string; departments: number }>>([]);
  const [activeId, setActiveId] = useState(scenario.id);

  // API key state: env flags tell us what's configured server-side; overrides are user-entered values
  const [envKeys, setEnvKeys] = useState<Record<string, boolean>>({});
  const [hostedDemo, setHostedDemo] = useState(false);
  const [serverMode, setServerMode] = useState<DashboardServerMode>('local_demo');
  // Demo caps fetched from the server so lock labels read the current
  // effective numbers (driven by PARACOSM_DEMO_MAX_TURNS env var on
  // prod) instead of a stale client-side constant.
  const [demoCaps, setDemoCaps] = useState<{ maxTurns: number; maxPopulation: number; maxActiveDepartments: number }>({
    maxTurns: 6, maxPopulation: 30, maxActiveDepartments: 3,
  });
  // Keys persist in localStorage so users don't have to re-enter them on every
  // page reload. Written on change, read on mount. The key itself never
  // leaves the browser except as part of a /setup or /compile request body;
  // it is never rendered back into the input and is submitted with
  // autoComplete=off.
  const [keyOverrides, setKeyOverrides] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('paracosm:keyOverrides');
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>;
        return {
          openai: parsed.openai || '', anthropic: parsed.anthropic || '',
          serper: parsed.serper || '', firecrawl: parsed.firecrawl || '',
          tavily: parsed.tavily || '', cohere: parsed.cohere || '',
        };
      }
    } catch { /* localStorage unavailable or JSON malformed — fall through */ }
    return { openai: '', anthropic: '', serper: '', firecrawl: '', tavily: '', cohere: '' };
  });
  useEffect(() => {
    try {
      localStorage.setItem('paracosm:keyOverrides', JSON.stringify(keyOverrides));
    } catch { /* quota or privacy mode — silent */ }
  }, [keyOverrides]);

  // Per-tier model choices for BYO-key users. Initialised from defaults for
  // the currently selected provider; reset whenever the provider changes so
  // the UI never shows claude-* values while provider='openai' (or vice
  // versa). Hidden entirely when the server is in hosted-demo mode and no
  // user override has been entered — the server forces DEMO_MODELS on that
  // path so user-picked values would be ignored.
  const [tierModels, setTierModels] = useState<Record<ModelTier, string>>(
    DEFAULT_TIER_MODELS[provider as 'openai' | 'anthropic'] ?? DEFAULT_TIER_MODELS.openai,
  );
  useEffect(() => {
    const p = (provider as 'openai' | 'anthropic');
    if (DEFAULT_TIER_MODELS[p]) setTierModels(DEFAULT_TIER_MODELS[p]);
  }, [provider]);

  // Show the per-tier model picker when ANY LLM key is available AND the
  // server is not operating as a hosted demo. On local dev the .env keys
  // belong to the user, so env presence is enough. On the hosted Linode
  // the server sets PARACOSM_HOSTED_DEMO=true and env keys belong to the
  // host — picker then requires an explicit session override from the user.
  const hasSessionLlmKey = !!keyOverrides.openai || !!keyOverrides.anthropic;
  const hasEnvLlmKey = !!envKeys.openai || !!envKeys.anthropic;
  const canPickModels = hasSessionLlmKey || (!hostedDemo && hasEnvLlmKey);
  // `hasUserLlmKey` controls whether launch() attaches `config.models`.
  // The server only honors tier picks when the request includes a session
  // key OR when hosted-demo mode is off (local dev trusts env keys as the
  // user's own). Same contract as applyDemoCaps on the server side.
  const hasUserLlmKey = hasSessionLlmKey || (!hostedDemo && hasEnvLlmKey);
  const effectiveEconomicsProfile: DashboardEconomicsProfileId =
    hostedDemo && !hasSessionLlmKey ? 'economy' : economicsProfile;
  const serverModeInfo = describeServerMode(serverMode);

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
    // Fetch which API keys are configured from .env + hosted-demo flag
    fetch('/admin-config')
      .then(r => r.json())
      .then(data => {
        if (data.keys) setEnvKeys(data.keys);
        if (typeof data.hostedDemo === 'boolean') setHostedDemo(data.hostedDemo);
        if (typeof data.serverMode === 'string') setServerMode(data.serverMode as DashboardServerMode);
        if (data.demoCaps && typeof data.demoCaps.maxTurns === 'number') {
          setDemoCaps({
            maxTurns: data.demoCaps.maxTurns,
            maxPopulation: data.demoCaps.maxPopulation ?? 30,
            maxActiveDepartments: data.demoCaps.maxActiveDepartments ?? 3,
          });
        }
      })
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
        provider, turns, seed, startTime, timePerTurn: timePerTurn || undefined, population, liveSearch,
        activeDepartments: scenario.departments.map(d => d.id),
        economics: { profileId: effectiveEconomicsProfile },
      };
      // Persist the last-launched config shape so a "re-run with seed+1"
      // button on the completed-sim screen can reuse it without asking
      // the user to fill the Settings form again. Only store
      // non-sensitive fields — API keys already live under
      // paracosm:keyOverrides with their own retention semantics.
      try {
        localStorage.setItem('paracosm:lastLaunchConfig', JSON.stringify(config));
      } catch { /* quota or privacy mode — silent */ }
      // Attach any user-provided key overrides (never sends .env values)
      if (keyOverrides.openai) config.apiKey = keyOverrides.openai;
      if (keyOverrides.anthropic) config.anthropicKey = keyOverrides.anthropic;
      if (keyOverrides.serper) config.serperKey = keyOverrides.serper;
      if (keyOverrides.firecrawl) config.firecrawlKey = keyOverrides.firecrawl;
      if (keyOverrides.tavily) config.tavilyKey = keyOverrides.tavily;
      if (keyOverrides.cohere) config.cohereKey = keyOverrides.cohere;
      // Per-tier model overrides only apply when the user is paying. The
      // server enforces DEMO_MODELS otherwise, so sending these without a
      // key would be silently overwritten.
      if (hasUserLlmKey) {
        config.models = { ...tierModels };
      }
      const res = await fetch('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Tier 2 Spec 2B: UI-initiated runs capture kernel snapshots
        // so every turn is fork-eligible from the Reports tab.
        body: JSON.stringify({ ...config, captureSnapshots: true }),
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
  }, [leaderA, leaderB, turns, seed, startTime, timePerTurn, population, provider, liveSearch, navigateTab, scenario, keyOverrides, tierModels, hasUserLlmKey, effectiveEconomicsProfile]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-deep)' }}>
      <SubTabNav
        options={SETTINGS_SUB_TABS}
        active={subTab}
        onChange={handleSubTabChange}
        ariaLabel="Settings sub-navigation"
      />
      {subTab === 'log' && <EventLogPanel events={events} />}
      {subTab === 'config' && (
    <div className="settings-content" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px 24px', background: 'var(--bg-deep)' }}>
      {/* Prior-runs CTA — surfaces saved sessions at the top so users
          who don't want to spend credits can replay an existing run
          turn-by-turn without touching any API keys. Hides itself when
          no saved runs exist or the session store is unavailable. */}
      <LoadPriorRunsCTA />
      {/* Scenario Selector */}
      {scenarios.length > 0 && (
        <div className="responsive-stack" style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
          padding: '12px 16px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: '8px', boxShadow: 'var(--card-shadow)',
        }}>
          <label htmlFor="scenario-select" style={{ ...SETTINGS_LABEL_STYLE, marginBottom: 0, flexShrink: 0 }}>
            Scenario
          </label>
          <select
            id="scenario-select"
            className="pc-select"
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
      <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '16px', lineHeight: 1.6 }}>
        Server mode: <strong style={{ color: 'var(--text-1)' }}>{serverModeInfo.label}</strong>. {serverModeInfo.description}
      </p>

      {/* Leaders grid */}
      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <ActorConfig label="Commander A" sideColor="var(--vis)" data={leaderA} onChange={setLeaderA} />
        <ActorConfig label="Commander B" sideColor="var(--eng)" data={leaderB} onChange={setLeaderB} />
      </div>

      {/* Simulation config */}
      <fieldset style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
        padding: '16px', marginBottom: '16px', boxShadow: 'var(--card-shadow)',
      }}>
        <legend style={{ ...SETTINGS_SECTION_HEADER_STYLE, padding: '0 8px' }}>
          Simulation
        </legend>
        {/* Demo-mode cap hint: rendered inline with the Simulation
            fieldset so users see what values the server will force
            before they hit Launch. Mirrors applyDemoCaps on the
            backend. Disappears once a session LLM key is entered. */}
        {hostedDemo && !hasSessionLlmKey && (
          <div style={{
            marginBottom: 12, padding: '8px 10px', borderRadius: 4,
            background: 'rgba(232,180,74,.08)', border: '1px solid var(--amber-dim)',
            fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--amber)' }}>Demo caps will apply:</strong>{' '}
            turns clamped to {demoCaps.maxTurns}, population to {demoCaps.maxPopulation}, active departments to {demoCaps.maxActiveDepartments}.
            Values you enter below are honored up to those ceilings. Add a
            session API key above to lift the caps.
          </div>
        )}
        <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor="turns-input" style={SETTINGS_LABEL_STYLE}>
              Turns
              {hostedDemo && !hasSessionLlmKey && (
                <span style={{ color: 'var(--amber)', fontSize: 9, fontWeight: 400, marginLeft: 4 }} title={`Hosted demo caps turns at ${demoCaps.maxTurns}. Add a session API key to unlock.`}>
                  {'\u{1F512}'} demo:{demoCaps.maxTurns}
                </span>
              )}
            </label>
            <input
              id="turns-input"
              type="number"
              value={hostedDemo && !hasSessionLlmKey ? demoCaps.maxTurns : turns}
              onChange={e => setTurns(parseInt(e.target.value) || 12)}
              min={1}
              max={20}
              disabled={hostedDemo && !hasSessionLlmKey}
              style={{
                ...inputStyle,
                opacity: hostedDemo && !hasSessionLlmKey ? 0.5 : 1,
                cursor: hostedDemo && !hasSessionLlmKey ? 'not-allowed' : 'auto',
              }}
              title={hostedDemo && !hasSessionLlmKey ? `Locked at ${demoCaps.maxTurns} in hosted demo mode. Add your own OpenAI or Anthropic key above to unlock full scope.` : ''}
            />
          </div>
          <div>
            <label htmlFor="ypt-input" style={SETTINGS_LABEL_STYLE}>{labels.Times}/Turn</label>
            <input
              id="ypt-input"
              type="number"
              value={timePerTurn}
              onChange={e => setTimePerTurn(parseInt(e.target.value) || 0)}
              min={0}
              max={50}
              placeholder="auto"
              title={`${labels.Times} per turn. 0 = accelerating schedule (default). 1 = 1 ${labels.time} per turn. 5 = 5 ${labels.times} per turn.`}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="seed-input" style={SETTINGS_LABEL_STYLE}>Seed</label>
            <input id="seed-input" type="number" value={seed} onChange={e => setSeed(parseInt(e.target.value) || 950)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="time-input" style={SETTINGS_LABEL_STYLE}>Start {labels.Time}</label>
            <input id="time-input" type="number" value={startTime} onChange={e => setStartTime(parseInt(e.target.value) || 2035)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="pop-input" style={SETTINGS_LABEL_STYLE}>
              Population
              {hostedDemo && !hasSessionLlmKey && (
                <span style={{ color: 'var(--amber)', fontSize: 9, fontWeight: 400, marginLeft: 4 }} title="Hosted demo caps population at 30. Add a session API key to unlock.">
                  {'\u{1F512}'} demo:30
                </span>
              )}
            </label>
            <input
              id="pop-input"
              type="number"
              value={hostedDemo && !hasSessionLlmKey ? 30 : population}
              onChange={e => setPopulation(parseInt(e.target.value) || 100)}
              disabled={hostedDemo && !hasSessionLlmKey}
              style={{
                ...inputStyle,
                opacity: hostedDemo && !hasSessionLlmKey ? 0.5 : 1,
                cursor: hostedDemo && !hasSessionLlmKey ? 'not-allowed' : 'auto',
              }}
              title={hostedDemo && !hasSessionLlmKey ? 'Locked at 30 in hosted demo mode. Add your own OpenAI or Anthropic key above to unlock full scope.' : ''}
            />
          </div>
        </div>
        <div className="responsive-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
          <div>
            <label htmlFor="provider-select" style={SETTINGS_LABEL_STYLE}>Provider</label>
            <select id="provider-select" className="pc-select" value={provider} onChange={e => setProvider(e.target.value)} style={inputStyle}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label htmlFor="search-select" style={SETTINGS_LABEL_STYLE}>Live Search</label>
            <select id="search-select" className="pc-select" value={String(liveSearch)} onChange={e => setLiveSearch(e.target.value === 'true')} style={inputStyle}>
              <option value="false">Off</option>
              <option value="true">On (requires search API keys)</option>
            </select>
          </div>
          <div>
            <label htmlFor="economics-select" style={SETTINGS_LABEL_STYLE}>
              Economics
              {hostedDemo && !hasSessionLlmKey && (
                <span style={{ color: 'var(--amber)', fontSize: 9, fontWeight: 400, marginLeft: 4 }}>
                  {'\u{1F512}'} forced:economy
                </span>
              )}
            </label>
            <select
              id="economics-select"
              className="pc-select"
              value={effectiveEconomicsProfile}
              onChange={e => setEconomicsProfile(e.target.value as DashboardEconomicsProfileId)}
              disabled={hostedDemo && !hasSessionLlmKey}
              style={{
                ...inputStyle,
                opacity: hostedDemo && !hasSessionLlmKey ? 0.5 : 1,
                cursor: hostedDemo && !hasSessionLlmKey ? 'not-allowed' : 'auto',
              }}
              title={ECONOMICS_PROFILE_OPTIONS.find(option => option.value === effectiveEconomicsProfile)?.description}
            >
              {ECONOMICS_PROFILE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '3px', lineHeight: 1.4 }}>
              {ECONOMICS_PROFILE_OPTIONS.find(option => option.value === effectiveEconomicsProfile)?.description}
            </div>
          </div>
        </div>
      </fieldset>

      {/* API Keys */}
      <fieldset style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
        padding: '16px', marginBottom: '16px', boxShadow: 'var(--card-shadow)',
      }}>
        <legend style={{ ...SETTINGS_SECTION_HEADER_STYLE, padding: '0 8px' }}>
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
              <label htmlFor={`key-${key}`} style={SETTINGS_LABEL_STYLE}>
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

      {/* Per-tier model picker. Visible when the caller is paying for
          the run — either a session override is set, or env keys are
          configured and the server is not in hosted-demo mode (local
          dev). Matches the server-side contract: in hosted-demo mode,
          applyDemoCaps overwrites whatever models the client posts. */}
      {canPickModels && (provider === 'openai' || provider === 'anthropic') && (
        <fieldset style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '16px', marginBottom: '16px', boxShadow: 'var(--card-shadow)',
        }}>
          <legend style={{ ...SETTINGS_SECTION_HEADER_STYLE, padding: '0 8px' }}>
            Model Tiers
          </legend>
          <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '12px', lineHeight: 1.6 }}>
            Assign a model to each agent tier. Departments do the forging and benefit most from the flagship class.
            Agent reactions fan out to hundreds of parallel calls per turn and should be the cheapest class available.
            These overrides are only used when you run against your own API key.
          </div>
          <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {(Object.keys(TIER_LABELS) as ModelTier[]).map(tier => (
              <div key={tier}>
                <label htmlFor={`model-${tier}`} style={SETTINGS_LABEL_STYLE}>
                  {TIER_LABELS[tier].label}
                </label>
                <select
                  id={`model-${tier}`}
                  className="pc-select"
                  value={tierModels[tier]}
                  onChange={e => setTierModels(prev => ({ ...prev, [tier]: e.target.value }))}
                  style={inputStyle}
                >
                  {MODEL_OPTIONS[provider as 'openai' | 'anthropic'].map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '3px', lineHeight: 1.4 }}>
                  {TIER_LABELS[tier].help}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {!canPickModels && (
        <div style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-2)',
        }}>
          <strong style={{ color: 'var(--amber)' }}>Demo mode.</strong>{' '}
          {hostedDemo
            ? `Runs against the host API keys are capped to ${demoCaps.maxTurns} turns, ${demoCaps.maxPopulation} colonists, ${demoCaps.maxActiveDepartments} departments, and the cheapest model class. Add your own OpenAI or Anthropic key above to unlock full scope and per-tier model selection.`
            : 'No API key configured. Add an OpenAI or Anthropic key above or set one in .env to enable simulations and the per-tier model picker.'}
        </div>
      )}

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
      )}
    </div>
  );
}
