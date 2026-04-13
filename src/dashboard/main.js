const $ = id => document.getElementById(id);

// Scenario data: fetched from server, falls back to Mars defaults
const MARS_FALLBACK_SCENARIO = {
  id: 'mars-genesis', version: '3.0.0',
  labels: { name: 'Mars Genesis', shortName: 'mars', populationNoun: 'colonists', settlementNoun: 'colony', currency: 'credits' },
  theme: { primaryColor: '#dc2626', accentColor: '#f97316', cssVariables: {} },
  setup: { defaultTurns: 12, defaultSeed: 950, defaultStartYear: 2035, defaultPopulation: 100 },
  departments: [
    { id: 'medical', label: 'Medical', role: 'Chief Medical Officer', icon: '🏥' },
    { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', icon: '⚙️' },
    { id: 'agriculture', label: 'Agriculture', role: 'Head of Agriculture', icon: '🌱' },
    { id: 'psychology', label: 'Psychology', role: 'Colony Psychologist', icon: '🧠' },
    { id: 'governance', label: 'Governance', role: 'Governance Advisor', icon: '🏛️' },
  ],
  presets: [],
  ui: {
    headerMetrics: [
      { id: 'population', format: 'number' }, { id: 'morale', format: 'percent' },
      { id: 'foodMonthsReserve', format: 'number' }, { id: 'powerKw', format: 'number' },
      { id: 'infrastructureModules', format: 'number' }, { id: 'scienceOutput', format: 'number' },
    ],
    tooltipFields: ['boneDensityPct', 'cumulativeRadiationMsv', 'psychScore', 'marsborn'],
    departmentIcons: { medical: '🏥', engineering: '⚙️', agriculture: '🌱', psychology: '🧠', governance: '🏛️' },
    setupSections: ['leaders', 'personnel', 'resources', 'departments', 'events', 'models', 'advanced'],
  },
  policies: { toolForging: true, bulletin: true, characterChat: true },
};
window.SCENARIO = MARS_FALLBACK_SCENARIO;
window.DEPT_ICONS = Object.fromEntries(MARS_FALLBACK_SCENARIO.departments.map(d => [d.id, d.icon]));
const storageKey = (key) => `${(window.SCENARIO?.labels?.shortName || 'mars')}-${key}`;

function applyScenarioToUI(sc) {
  document.title = sc.labels.name + ' Simulation';
  const logoText = $('logo-text');
  if (logoText) logoText.textContent = sc.labels.name.toUpperCase();
  const tagline = $('top-tagline');
  if (tagline) tagline.textContent = `Same ${sc.labels.settlementNoun}, two different leaders. Watch emergent civilizations diverge.`;
  if (sc.theme?.cssVariables && Object.keys(sc.theme.cssVariables).length) {
    const style = document.createElement('style');
    style.textContent = ':root { ' + Object.entries(sc.theme.cssVariables).map(([k, v]) => `${k}: ${v}`).join('; ') + ' }';
    document.head.appendChild(style);
  }
  window.DEPT_ICONS = {};
  for (const d of sc.departments || []) window.DEPT_ICONS[d.id] = d.icon || '📋';
  if (sc.presets?.length) {
    const dp = sc.presets.find(p => p.id === 'default');
    if (dp && dp.leaders?.length >= 2) {
      const a = dp.leaders[0], b = dp.leaders[1];
      SETUP_PRESETS.default = {
        a: { name: a.name, arch: a.archetype, colony: 'Colony Alpha', hexaco: a.hexaco, instr: a.instructions },
        b: { name: b.name, arch: b.archetype, colony: 'Colony Beta', hexaco: b.hexaco, instr: b.instructions },
        turns: sc.setup?.defaultTurns || 12, seed: sc.setup?.defaultSeed || 950,
      };
    }
  }
}

// Fetch live scenario from server (non-blocking, falls back silently)
fetch('/scenario').then(r => r.ok ? r.json() : null).then(sc => {
  if (sc && sc.id) { window.SCENARIO = sc; applyScenarioToUI(sc); }
}).catch(() => {});

let replaySpeed = 50; // ms between events during replay (default: fast)
let liveEventCount = 0; // tracks SSE events received to skip server buffer replay
const log = (cls, msg) => { const d = $('debug'); d.innerHTML += `<br><span class="${cls}">${msg}</span>`; d.scrollTop = d.scrollHeight; };

/** Show a toast notification */
function toast(type, title, message, durationMs = 6000) {
  const container = $('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<b>${esc(title)}</b>${esc(message)}`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 300); }, durationMs);
}

/** Escape HTML special characters to prevent broken templates */
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function switchTab(tab) {
  const panels = { sim: ['main-view','tl-view'], reports: ['reports-panel'], log: ['debug'], settings: ['settings-panel'], about: ['about-panel'], chat: ['chat-panel'] };
  document.querySelectorAll('.tab-bar button').forEach(b => b.classList.remove('active'));
  for (const ids of Object.values(panels)) ids.forEach(id => { const el = $(id); if (el) { el.style.display = 'none'; el.style.flex = ''; } });
  // Hide sim-only elements (intro, divergence) when not on sim tab
  const dr = $('diverge-rail'); if (dr) dr.style.display = tab === 'sim' ? (dr.innerHTML ? 'block' : 'none') : 'none';
  const ib = $('intro-bar'); if (ib && tab !== 'sim') ib.style.display = 'none';
  const ids = panels[tab] || panels.sim;
  ids.forEach(id => {
    const el = $(id);
    if (!el) return;
    if (id === 'main-view') { el.style.display = 'flex'; }
    else if (id === 'tl-view') { el.style.display = 'flex'; }
    else { el.style.display = 'block'; el.style.flex = '1'; el.style.overflow = 'auto'; }
    if (id === 'debug') { el.style.maxHeight = 'none'; el.style.padding = '10px 16px'; }
  });
  $(`tab-${tab}`).classList.add('active');
  // Scroll all visible panels to bottom after tab switch
  requestAnimationFrame(() => {
    if (tab === 'sim') {
      const bv = $('body-v'); if (bv) bv.scrollTo({ top: bv.scrollHeight, behavior: 'smooth' });
      const be = $('body-e'); if (be) be.scrollTo({ top: be.scrollHeight, behavior: 'smooth' });
      const tv = $('tl-v'); if (tv) tv.scrollTo({ top: tv.scrollHeight, behavior: 'smooth' });
      const te = $('tl-e'); if (te) te.scrollTo({ top: te.scrollHeight, behavior: 'smooth' });
    } else {
      ids.forEach(id => {
        const el = $(id);
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      });
    }
  });
}

// Track leader names dynamically
const leaderMap = {};
function side(leader) {
  if (!leader) return null;
  if (leaderMap[leader]) return leaderMap[leader];
  const assigned = Object.keys(leaderMap).length;
  if (assigned === 0) { leaderMap[leader] = 'v'; return 'v'; }
  if (assigned === 1) { leaderMap[leader] = 'e'; return 'e'; }
  return null;
}
const state = {
  v: { pop: [], morale: [], deaths: 0, tools: 0, cites: 0, decisions: 0, crisis: null, decision: null, outcome: null, prevColony: null, prevDrift: {} },
  e: { pop: [], morale: [], deaths: 0, tools: 0, cites: 0, decisions: 0, crisis: null, decision: null, outcome: null, prevColony: null, prevDrift: {} }
};
const sparkChars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
const spark = arr => { if (!arr.length) return ''; const mx = Math.max(...arr) || 1; return arr.map(v => sparkChars[Math.min(7, Math.floor((Number(v) || 0) / mx * 7.99))]).join(''); };

function delta(curr, prev) {
  if (prev == null || isNaN(curr) || isNaN(prev)) return '';
  const d = Math.round((curr - prev) * 100) / 100;
  if (d === 0) return '';
  const sign = d > 0 ? '+' : '';
  return `<span style="font-size:10px;opacity:.7;margin-left:2px">${sign}${d}</span>`;
}

function updateGauges(s, colony) {
  const pop = colony.population ?? 0, morale = Math.round((colony.morale ?? 0) * 100);
  const prev = state[s].prevColony;
  const prevPop = prev?.population, prevMorale = prev ? Math.round((prev.morale ?? 0) * 100) : null;

  const food = (colony.foodMonthsReserve ?? 0).toFixed(0);
  const prevFood = prev ? (prev.foodMonthsReserve ?? 0).toFixed(0) : null;

  // Stats bar with deltas (inline, same line)
  $(`s-${s}-pop`).innerHTML = pop + delta(pop, prevPop);
  $(`s-${s}-morale`).innerHTML = morale + '%' + delta(morale, prevMorale);
  const foodEl = $(`s-${s}-food`); if (foodEl) foodEl.innerHTML = food + 'mo' + delta(Number(food), Number(prevFood));

  // Sparklines in leader bar
  state[s].pop.push(pop); state[s].morale.push(morale);
  $(`spark-${s}-pop`).textContent = spark(state[s].pop) + ' ' + pop;
  $(`spark-${s}-morale`).textContent = spark(state[s].morale) + ' ' + morale + '%';

  state[s].prevColony = { ...colony };
}

function hexacoBar(val) {
  const filled = Math.round(val * 5);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(5 - filled);
}

function populateLeader(s, ldr) {
  const color = s === 'v' ? 'v' : 'e';
  const archEl = $(`ldr-${s}-arch`);
  const nameEl = $(`ldr-${s}-name`);
  const colonyEl = $(`ldr-${s}-colony`);
  const traitsEl = $(`ldr-${s}-traits`);
  if (archEl) {
    archEl.textContent = (ldr.archetype || '').toUpperCase().replace('THE ', '');
    const h = ldr.hexaco || {};
    const bio = `${ldr.archetype}: O=${h.openness} (${h.openness > 0.7 ? 'creative, experimental' : h.openness > 0.4 ? 'moderate' : 'proven methods'}), C=${h.conscientiousness} (${h.conscientiousness > 0.7 ? 'disciplined, thorough' : h.conscientiousness > 0.4 ? 'moderate' : 'loose, intuitive'}), E=${h.extraversion} (${h.extraversion > 0.7 ? 'charismatic' : h.extraversion > 0.4 ? 'moderate' : 'quiet, reserved'}), HH=${h.honestyHumility} (${h.honestyHumility > 0.7 ? 'transparent, fair' : 'spins setbacks'})`;
    archEl.title = bio;
  }
  if (nameEl) nameEl.textContent = ldr.name || '';
  if (colonyEl) colonyEl.textContent = ldr.colony || '';
  if (traitsEl && ldr.hexaco) {
    const h = ldr.hexaco;
    traitsEl.innerHTML = ['O','C','E','A','Em','HH'].map((t, i) => {
      const val = [h.openness, h.conscientiousness, h.extraversion, h.agreeableness, h.emotionality, h.honestyHumility][i];
      return `<span class="${color} tx">${t}</span><span class="${color}">${hexacoBar(val)}</span><span class="${color} tv">${Number(val).toFixed(2)}</span>`;
    }).join('');
  }
}

function clearWaiting(s) { const w = $(`body-${s}`).querySelector('.waiting'); if (w) w.remove(); }
function addToBody(s, html) {
  clearWaiting(s);
  const body = $(`body-${s}`), div = document.createElement('div');
  div.className = 'af'; div.innerHTML = html;
  body.appendChild(div);
  // Bind tooltips on any .hover-tip / .tip-wrap inside the new content
  if (typeof bindTip === 'function') div.querySelectorAll('.hover-tip, .tip-wrap').forEach(bindTip);
  body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
}
function addTimeline(s, year, text, badgeCls, badge, fullText) {
  const tl = $(`tl-${s}`);
  const key = `${year}-${(text||'').slice(0,20)}`;
  if (tl.dataset.lastEntry === key) return;
  tl.dataset.lastEntry = key;
  tl.querySelectorAll('.tr.now').forEach(el => el.classList.remove('now'));
  const full = esc(fullText || text || '');
  const div = document.createElement('div');
  div.className = 'tr now hover-tip';
  div.innerHTML = `<span class="ty ${s}">${year}</span><span class="tt">${esc(text || '')}</span><span class="ob ${badgeCls}" style="font-size:9px;padding:1px 5px">${badge}</span><div class="htip"><b>Year ${year}</b><div style="margin-top:4px;font-size:12px;line-height:1.6">${full}</div></div>`;
  tl.appendChild(div);
  if (typeof bindTip === 'function') bindTip(div);
  tl.scrollTo({ top: tl.scrollHeight, behavior: 'smooth' });
}

// --- Game data ---
const gameData = { config: null, events: [], results: [], startedAt: new Date().toISOString(), completedAt: null };

const DEFAULT_SETUP_PERSONNEL = [
  { name: 'Dr. Yuki Tanaka', specialization: 'Radiation Medicine', age: 38, department: 'medical' },
  { name: 'Erik Lindqvist', specialization: 'Structural Engineering', age: 45, department: 'engineering' },
  { name: 'Amara Osei', specialization: 'Hydroponics', age: 34, department: 'agriculture' },
  { name: 'Dr. Priya Singh', specialization: 'Clinical Psychology', age: 41, department: 'psychology' },
  { name: 'Carlos Fernandez', specialization: 'Geology', age: 50, department: 'science' },
];

function defaultSideState() {
  return { pop: [], morale: [], deaths: 0, tools: 0, cites: 0, decisions: 0, crisis: null, decision: null, outcome: null, prevColony: null, prevDrift: {} };
}

function updateTimelineLabels(config = gameData.config) {
  const leaders = config?.leaders || [];
  $('tl-v-label').textContent = (leaders[0]?.colony || 'ARES HORIZON').toUpperCase();
  $('tl-e-label').textContent = (leaders[1]?.colony || 'MERIDIAN BASE').toUpperCase();
}

function resetSimulationView(config = gameData.config) {
  state.v = defaultSideState();
  state.e = defaultSideState();
  Object.keys(leaderMap).forEach(k => delete leaderMap[k]);
  $('body-v').innerHTML = `<div class="waiting"><span class="spinner">◉</span> Waiting for ${config?.leaders?.[0]?.name || 'Visionary'}...</div>`;
  $('body-e').innerHTML = `<div class="waiting"><span class="spinner">◉</span> Waiting for ${config?.leaders?.[1]?.name || 'Engineer'}...</div>`;
  $('tl-v').innerHTML = '<div class="tl-label v" id="tl-v-label">ARES HORIZON</div>';
  $('tl-e').innerHTML = '<div class="tl-label e" id="tl-e-label">MERIDIAN BASE</div>';
  $('crisis-v').style.display = 'none';
  $('crisis-e').style.display = 'none';
  $('crisis-v-title').textContent = '';
  $('crisis-v-cat').textContent = '';
  $('crisis-v-summary').textContent = '';
  $('crisis-e-title').textContent = '';
  $('crisis-e-cat').textContent = '';
  $('crisis-e-summary').textContent = '';
  $('diverge-rail').style.display = 'none';
  $('diverge-rail').innerHTML = '';
  $('crisis').textContent = '⚡ Waiting...';
  $('m-turn').textContent = '—';
  $('m-year').textContent = '—';
  $('m-max-turns').textContent = String(config?.turns || 12);
  $('m-seed').textContent = String(config?.seed || 950);
  $('m-status').textContent = '● Waiting';
  $('m-status').style.color = '';
  $('m-status').style.animation = '';
  $('s-v-pop').textContent = '—';
  $('s-e-pop').textContent = '—';
  $('s-v-morale').textContent = '—';
  $('s-e-morale').textContent = '—';
  $('s-v-deaths').textContent = '—';
  $('s-e-deaths').textContent = '—';
  $('s-v-tools').textContent = '0';
  $('s-e-tools').textContent = '0';
  $('spark-v-pop').textContent = '—';
  $('spark-e-pop').textContent = '—';
  $('spark-v-morale').textContent = '—';
  $('spark-e-morale').textContent = '—';
  $('save-game-btn').style.display = 'none';
  $('debug').innerHTML = '';
  updateTimelineLabels(config);
}

function encodeSharedConfig(config) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeSharedConfig(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function shareConfig() {
  const cfg = buildSetupConfig();
  const p = new URLSearchParams();
  p.set('cfg', encodeSharedConfig(cfg));
  const url = window.location.origin + window.location.pathname + '?' + p.toString() + '#settings';
  navigator.clipboard.writeText(url).then(() => {
    $('s-launch-status').textContent = 'Config URL copied to clipboard!';
    setTimeout(() => { $('s-launch-status').textContent = ''; }, 3000);
  }).catch(() => { prompt('Share this URL:', url); });
}

function addPersonnelRow(person = {}) {
  const row = document.createElement('div');
  row.className = 's-person';
  const deptOpts = (window.SCENARIO?.departments || MARS_FALLBACK_SCENARIO.departments).map(d2 => `<option value="${d2.id}">${d2.label}</option>`).join('');
  row.innerHTML = `<input value="${person.name || ''}"><input value="${person.specialization || ''}"><input value="${person.age ?? 35}" type="number"><select>${deptOpts}</select>`;
  row.querySelector('select').value = person.department || 'science';
  $('s-personnel').appendChild(row);
}

function setSetupPersonnel(personnel = DEFAULT_SETUP_PERSONNEL) {
  $('s-personnel').innerHTML = '';
  (personnel.length ? personnel : DEFAULT_SETUP_PERSONNEL).forEach(person => addPersonnelRow(person));
}

function getActiveDepartments() {
  return Array.from(document.querySelectorAll('#s-departments input[type=checkbox]'))
    .filter(el => el.checked)
    .map(el => el.dataset.dept)
    .filter(Boolean);
}

function applySetupConfig(cfg) {
  if (cfg.leaders?.length >= 2) {
    const a = cfg.leaders[0], b = cfg.leaders[1];
    $('sa-name').value = a.name || '';
    $('sa-arch').value = a.archetype || '';
    $('sa-colony').value = a.colony || '';
    $('sa-instr').value = a.instructions || '';
    if (a.hexaco) setSHex('a', a.hexaco);
    $('sb-name').value = b.name || '';
    $('sb-arch').value = b.archetype || '';
    $('sb-colony').value = b.colony || '';
    $('sb-instr').value = b.instructions || '';
    if (b.hexaco) setSHex('b', b.hexaco);
  }
  if (cfg.turns != null) $('s-turns').value = cfg.turns;
  if (cfg.seed != null) $('s-seed').value = cfg.seed;
  if (cfg.startYear != null) $('s-year').value = cfg.startYear;
  if (cfg.provider) $('s-provider').value = cfg.provider;
  if (cfg.population != null) $('s-pop').value = cfg.population;
  if (cfg.startingResources) {
    if (cfg.startingResources.food != null) $('s-food').value = cfg.startingResources.food;
    if (cfg.startingResources.water != null) $('s-water').value = cfg.startingResources.water;
    if (cfg.startingResources.power != null) $('s-power').value = cfg.startingResources.power;
    if (cfg.startingResources.morale != null) $('s-morale').value = cfg.startingResources.morale;
    if (cfg.startingResources.lifeSupportCapacity != null) $('s-lifesup').value = cfg.startingResources.lifeSupportCapacity;
    if (cfg.startingResources.infrastructureModules != null) $('s-infra').value = cfg.startingResources.infrastructureModules;
    if (cfg.startingResources.pressurizedVolumeM3 != null) $('s-volume').value = cfg.startingResources.pressurizedVolumeM3;
  }
  if (cfg.startingPolitics?.earthDependencyPct != null) $('s-earthdep').value = cfg.startingPolitics.earthDependencyPct;
  if (cfg.execution) {
    if (cfg.execution.commanderMaxSteps != null) $('s-cmd-steps').value = cfg.execution.commanderMaxSteps;
    if (cfg.execution.departmentMaxSteps != null) $('s-dept-steps').value = cfg.execution.departmentMaxSteps;
    if (cfg.execution.sandboxTimeoutMs != null) $('s-sandbox-timeout').value = cfg.execution.sandboxTimeoutMs;
    if (cfg.execution.sandboxMemoryMB != null) $('s-sandbox-mem').value = cfg.execution.sandboxMemoryMB;
  }
  document.querySelectorAll('#s-departments input[type=checkbox]').forEach(el => {
    if (el.disabled) return;
    el.checked = Array.isArray(cfg.activeDepartments) ? cfg.activeDepartments.includes(el.dataset.dept) : true;
  });
  if (typeof cfg.liveSearch === 'boolean') $('s-search').value = String(cfg.liveSearch);
  $('s-events').innerHTML = '';
  sec = 0;
  (cfg.customEvents || []).forEach(event => addSetupEvent(event.turn, event.title));
  Array.from(document.querySelectorAll('.s-evrow')).forEach((row, index) => {
    const inputs = row.querySelectorAll('input');
    if (inputs[2]) inputs[2].value = cfg.customEvents?.[index]?.description || '';
  });
  setSetupPersonnel(cfg.keyPersonnel || DEFAULT_SETUP_PERSONNEL);
  syncProviderDefaults(false, cfg.models);
  $('s-preset').value = 'custom';
}

function loadFromParams() {
  const p = new URLSearchParams(window.location.search);
  if (p.has('cfg')) {
    try {
      applySetupConfig(decodeSharedConfig(p.get('cfg')));
      return true;
    } catch {
      return false;
    }
  }
  if (!p.has('seed') && !p.has('a_name')) return false;
  if (p.has('seed')) $('s-seed').value = p.get('seed');
  if (p.has('turns')) $('s-turns').value = p.get('turns');
  if (p.has('a_name')) $('sa-name').value = p.get('a_name');
  if (p.has('a_arch')) $('sa-arch').value = p.get('a_arch');
  if (p.has('a_colony')) $('sa-colony').value = p.get('a_colony');
  if (p.has('a_o')) setSHex('a', {
    openness: parseFloat(p.get('a_o')), conscientiousness: parseFloat(p.get('a_c')),
    extraversion: parseFloat(p.get('a_e')), agreeableness: parseFloat(p.get('a_a')),
    emotionality: parseFloat(p.get('a_em')), honestyHumility: parseFloat(p.get('a_hh'))
  });
  if (p.has('b_name')) $('sb-name').value = p.get('b_name');
  if (p.has('b_arch')) $('sb-arch').value = p.get('b_arch');
  if (p.has('b_colony')) $('sb-colony').value = p.get('b_colony');
  if (p.has('b_o')) setSHex('b', {
    openness: parseFloat(p.get('b_o')), conscientiousness: parseFloat(p.get('b_c')),
    extraversion: parseFloat(p.get('b_e')), agreeableness: parseFloat(p.get('b_a')),
    emotionality: parseFloat(p.get('b_em')), honestyHumility: parseFloat(p.get('b_hh'))
  });
  $('s-preset').value = 'custom';
  return true;
}

function clearAll() {
  if (!confirm('Clear all simulation data, reports, and cached game? This cannot be undone.')) return;
  // Clear server event buffer
  fetch('/clear', { method: 'POST' }).catch(() => {});
  localStorage.removeItem(storageKey('game-data'));
  localStorage.removeItem(storageKey('settings'));
  localStorage.setItem(storageKey('cleared'), Date.now().toString()); // flag to skip SSE replay on reload
  gameData.config = null;
  gameData.events = [];
  gameData.results = [];
  gameData.startedAt = '';
  gameData.completedAt = null;
  gameData._restoredCount = 0;
  gameData._cleared = true;
  Object.keys(leaderMap).forEach(k => delete leaderMap[k]);
  resetSimulationView();
  // Reset nav title and tagline
  const tag = $('top-tagline');
  if (tag) tag.textContent = `Same ${window.SCENARIO?.labels?.settlementNoun || 'colony'}, two different leaders. Watch emergent civilizations diverge.`;
  $('crisis').textContent = '\u26A1 Waiting...';
  $('m-turn').textContent = '\u2014';
  $('m-year').textContent = '\u2014';
  $('m-max-turns').textContent = '12';
  $('m-seed').textContent = '950';
  $('m-status').textContent = '\u25CF Cleared';
  $('m-status').style.color = 'var(--text-3)';
  $('m-status').style.animation = '';
  const pf = $('progress-fill'); if (pf) pf.style.width = '0';
  // Reset leader bars to defaults
  populateLeader('v', { name: 'Aria Chen', archetype: 'The Visionary', colony: 'Ares Horizon', hexaco: { openness: .95, conscientiousness: .35, extraversion: .85, agreeableness: .55, emotionality: .3, honestyHumility: .65 } });
  populateLeader('e', { name: 'Dietrich Voss', archetype: 'The Engineer', colony: 'Meridian Base', hexaco: { openness: .25, conscientiousness: .97, extraversion: .3, agreeableness: .45, emotionality: .7, honestyHumility: .9 } });
  $('rpt-content').innerHTML = '<div class="rpt-empty">Run a simulation or load a saved game to see the full report.</div>';
  $('debug').innerHTML = '';
  $('save-game-btn').style.display = 'none';
  applySetupPreset('default');
  switchTab('settings');
}

function saveGame() {
  gameData.completedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(gameData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${window.SCENARIO?.labels?.shortName || 'mars'}-${gameData.config?.seed || 950}-${gameData.events.length}events.json`;
  a.click();
}

function loadGame(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const saved = JSON.parse(reader.result);
      if (!saved.events || !saved.events.length) { alert('No game events found in file'); return; }
      gameData.config = saved.config || null;
      gameData.events = saved.events || [];
      gameData.results = saved.results || [];
      gameData.startedAt = saved.startedAt || '';
      gameData.completedAt = saved.completedAt || '';
      if (gameData.config) applySetupConfig(gameData.config);
      resetSimulationView(gameData.config);
      switchTab('sim');
      // Replay in batches for speed (process multiple events per frame)
      const total = gameData.events.length;
      const batchSize = Math.max(10, Math.ceil(total / 100)); // ~100 frames total
      let i = 0;
      function replayBatch() {
        const end = Math.min(i + batchSize, total);
        while (i < end) handleSimEvent(gameData.events[i++]);
        $('m-status').textContent = `\u25CF Replaying ${i}/${total}...`;
        if (i >= total) {
          $('m-status').textContent = '\u25CF Replay Complete'; $('m-status').style.color = 'var(--amber)'; $('save-game-btn').style.display = 'inline-block';
          return;
        }
        requestAnimationFrame(replayBatch);
      }
      $('m-status').textContent = '\u25CF Replaying...'; $('m-status').style.color = 'var(--vis)';
      replayBatch();
    } catch (err) { alert('Invalid game file: ' + err); }
  };
  reader.readAsText(file);
}

// --- Settings ---
const STRAITS = ['openness','conscientiousness','extraversion','agreeableness','emotionality','honestyHumility'];
function getSHex(p) { const s = document.querySelectorAll(`#s${p}-hex input[type=range]`); const h = {}; s.forEach((el, i) => h[STRAITS[i]] = parseFloat(el.value)); return h; }
function setSHex(p, h) { const s = document.querySelectorAll(`#s${p}-hex input[type=range]`); s.forEach((el, i) => { el.value = h[STRAITS[i]]; el.nextElementSibling.textContent = Number(h[STRAITS[i]]).toFixed(2); }); }

const SETUP_PRESETS = {
  default:{a:{name:'Aria Chen',arch:'The Visionary',colony:'Ares Horizon',hexaco:{openness:.95,conscientiousness:.35,extraversion:.85,agreeableness:.55,emotionality:.3,honestyHumility:.65},instr:'You are Commander Aria Chen. Bold expansion, calculated risks. Favor higher upside. Respond with JSON.'},b:{name:'Dietrich Voss',arch:'The Engineer',colony:'Meridian Base',hexaco:{openness:.25,conscientiousness:.97,extraversion:.3,agreeableness:.45,emotionality:.7,honestyHumility:.9},instr:'You are Commander Dietrich Voss. Engineering discipline, safety margins. Favor lower risk. Respond with JSON.'},turns:12,seed:950},
  balanced:{a:{name:'Maya Torres',arch:'The Diplomat',colony:'Concordia',hexaco:{openness:.6,conscientiousness:.55,extraversion:.65,agreeableness:.7,emotionality:.5,honestyHumility:.6},instr:'You are Commander Maya Torres. Seek consensus. Respond with JSON.'},b:{name:'Kenji Nakamura',arch:'The Pragmatist',colony:'Olympus Landing',hexaco:{openness:.5,conscientiousness:.6,extraversion:.45,agreeableness:.55,emotionality:.55,honestyHumility:.65},instr:'You are Commander Kenji Nakamura. Data-informed pragmatist. Respond with JSON.'},turns:12,seed:950},
  extreme:{a:{name:'Zara Okafor',arch:'The Gambler',colony:'Frontier Prime',hexaco:{openness:.99,conscientiousness:.15,extraversion:.9,agreeableness:.3,emotionality:.1,honestyHumility:.4},instr:'You are Commander Zara Okafor. Maximum risk, maximum reward. Respond with JSON.'},b:{name:'Heinrich Weber',arch:'The Fortress',colony:'Bastion Colony',hexaco:{openness:.05,conscientiousness:.99,extraversion:.1,agreeableness:.6,emotionality:.95,honestyHumility:.95},instr:'You are Commander Heinrich Weber. Zero tolerance for risk. Respond with JSON.'},turns:12,seed:950},
};

const PROVIDER_DEFAULT_MODELS = {
  openai: { commander: 'gpt-5.4', departments: 'gpt-5.4-mini', judge: 'gpt-5.4' },
  anthropic: { commander: 'claude-sonnet-4-6', departments: 'claude-haiku-4-5-20251001', judge: 'claude-sonnet-4-6' },
};

function applySetupPreset(name) {
  const p = SETUP_PRESETS[name]; if (!p) return;
  $('sa-name').value = p.a.name; $('sa-arch').value = p.a.arch; $('sa-colony').value = p.a.colony; $('sa-instr').value = p.a.instr; setSHex('a', p.a.hexaco);
  $('sb-name').value = p.b.name; $('sb-arch').value = p.b.arch; $('sb-colony').value = p.b.colony; $('sb-instr').value = p.b.instr; setSHex('b', p.b.hexaco);
  $('s-turns').value = p.turns; $('s-seed').value = p.seed;
  syncProviderDefaults();
}

function inferProviderFromModel(model) {
  if (!model) return null;
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o')) return 'openai';
  return null;
}

function syncProviderDefaults(force = false, models = {}) {
  const provider = $('s-provider')?.value || 'openai';
  const defaults = PROVIDER_DEFAULT_MODELS[provider] || PROVIDER_DEFAULT_MODELS.openai;

  const applyModel = (el, requested, fallback) => {
    const currentMatches = inferProviderFromModel(el.value) === provider;
    const requestedMatches = inferProviderFromModel(requested) === provider;
    el.value = force ? fallback : requestedMatches ? requested : currentMatches ? el.value : fallback;
    el.dataset.provider = provider;
  };

  applyModel($('s-model-cmd'), models.commander, defaults.commander);
  applyModel($('s-model-dept'), models.departments, defaults.departments);
  applyModel($('s-model-judge'), models.judge, defaults.judge);
}

let sec = 0;
function addSetupEvent(t = '', ti = '') {
  sec++; const d = document.createElement('div'); d.className = 's-evrow'; d.id = `sev-${sec}`;
  d.innerHTML = `<input type="number" min="1" placeholder="T" value="${t}"><input placeholder="Title" value="${ti}"><input placeholder="Description"><button class="s-rm" onclick="this.parentElement.remove()">x</button>`;
  $('s-events').appendChild(d);
}
function getSetupEvents() {
  return Array.from(document.querySelectorAll('.s-evrow')).map(r => { const ins = r.querySelectorAll('input'); return { turn: parseInt(ins[0].value) || 0, title: ins[1].value, description: ins[2].value }; }).filter(e => e.turn > 0 && e.title);
}
function addPersonnel() {
  const d = document.createElement('div'); d.className = 's-person';
  const deptOpts2 = (window.SCENARIO?.departments || MARS_FALLBACK_SCENARIO.departments).map(d2 => `<option value="${d2.id}">${d2.label}</option>`).join('');
  d.innerHTML = `<input placeholder="Name"><input placeholder="Specialization"><input value="35" type="number"><select>${deptOpts2}</select><button class="s-rm" onclick="this.parentElement.remove()">x</button>`;
  $('s-personnel').appendChild(d);
}
function getSetupPersonnel() {
  return Array.from(document.querySelectorAll('.s-person')).map(r => { const ins = r.querySelectorAll('input'); const sel = r.querySelector('select'); return { name: ins[0].value, specialization: ins[1].value, age: parseInt(ins[2].value) || 35, department: sel.value, role: 'Specialist', featured: true }; });
}

function buildSetupConfig() {
  return {
    leaders: [
      { name: $('sa-name').value, archetype: $('sa-arch').value, colony: $('sa-colony').value, hexaco: getSHex('a'), instructions: $('sa-instr').value },
      { name: $('sb-name').value, archetype: $('sb-arch').value, colony: $('sb-colony').value, hexaco: getSHex('b'), instructions: $('sb-instr').value },
    ],
    provider: $('s-provider').value,
    turns: parseInt($('s-turns').value) || 12, seed: parseInt($('s-seed').value) || 950,
    startYear: parseInt($('s-year').value) || 2035,
    population: parseInt($('s-pop').value) || 100,
    activeDepartments: getActiveDepartments(),
    startingResources: {
      food: parseInt($('s-food').value) || 18,
      water: parseInt($('s-water').value) || 800,
      power: parseInt($('s-power').value) || 400,
      morale: parseInt($('s-morale').value) || 85,
      lifeSupportCapacity: parseInt($('s-lifesup').value) || 120,
      infrastructureModules: parseInt($('s-infra').value) || 3,
      pressurizedVolumeM3: parseInt($('s-volume').value) || 3000,
    },
    startingPolitics: {
      earthDependencyPct: parseInt($('s-earthdep').value) || 95,
    },
    execution: {
      commanderMaxSteps: parseInt($('s-cmd-steps').value) || 5,
      departmentMaxSteps: parseInt($('s-dept-steps').value) || 8,
      sandboxTimeoutMs: parseInt($('s-sandbox-timeout').value) || 10000,
      sandboxMemoryMB: parseInt($('s-sandbox-mem').value) || 128,
    },
    liveSearch: $('s-search').value === 'true', customEvents: getSetupEvents(),
    keyPersonnel: getSetupPersonnel(),
    models: { commander: $('s-model-cmd').value, departments: $('s-model-dept').value, judge: $('s-model-judge').value },
  };
}

function exportSetup() {
  const cfg = buildSetupConfig(); const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${window.SCENARIO?.labels?.shortName || 'mars'}-config.json`; a.click();
}
function importSetup(e) {
  const file = e.target.files[0]; if (!file) return; const r = new FileReader();
  r.onload = () => { try {
    applySetupConfig(JSON.parse(r.result));
  } catch (err) { alert('Invalid config file'); } }; r.readAsText(file);
}

async function testApiKey() {
  const st = $('s-test-status'), btn = $('s-test-btn');
  const provider = $('s-provider').value;
  const key = provider === 'anthropic' ? $('s-anthropic').value : $('s-apikey').value;
  if (!key || key.includes('...')) { st.textContent = 'Enter a full API key first'; st.style.color = 'var(--rust)'; return; }
  btn.disabled = true; st.textContent = 'Testing...'; st.style.color = 'var(--text-3)';
  try {
    const res = provider === 'anthropic'
      ? await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        })
      : await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` },
        });
    if (res.ok) { st.textContent = 'Connected.'; st.style.color = 'var(--green)'; }
    else { const d = await res.json().catch(() => ({})); st.textContent = 'Failed: ' + (d.error?.message || res.status); st.style.color = 'var(--rust)'; }
  } catch (err) { st.textContent = 'Network error: ' + err; st.style.color = 'var(--rust)'; }
  btn.disabled = false;
}

// Check and display rate limit status
async function checkRateLimit() {
  try {
    const res = await fetch('/rate-limit');
    const data = await res.json();
    const info = $('s-rate-info');
    if (!info) return;
    if (data.unlimited) {
      info.textContent = 'Unlimited (local dev mode). No rate limit.';
      info.style.color = 'var(--green)';
    } else {
      const color = data.remaining > 0 ? 'var(--text-2)' : 'var(--rust)';
      info.innerHTML = `<span style="color:${color}">${data.remaining}/${data.limit} simulations remaining today.</span> Resets at midnight UTC.`;
      if (data.remaining === 0) {
        const btn = $('s-launch-btn');
        if (btn) btn.disabled = true;
        toast('info', 'Rate Limit', `You have used all ${data.limit} simulations for today. Resets at midnight UTC.`, 8000);
      }
    }
  } catch {}
}
checkRateLimit();

function saveSettingsToStorage() {
  const cfg = buildSetupConfig();
  try {
    localStorage.setItem(storageKey('settings'), JSON.stringify(cfg));
    const st = $('s-launch-status');
    if (st) { st.textContent = 'Settings saved.'; setTimeout(() => { st.textContent = ''; }, 2000); }
  } catch (err) { alert('Failed to save: ' + err); }
}

function resetSettingsToDefaults() {
  applySetupPreset('default');
  localStorage.removeItem(storageKey('settings'));
  const st = $('s-launch-status');
  if (st) { st.textContent = 'Reset to defaults.'; setTimeout(() => { st.textContent = ''; }, 2000); }
}

// Restore saved settings on load
function restoreSettings() {
  try {
    const saved = localStorage.getItem(storageKey('settings'));
    if (!saved) return;
    const cfg = JSON.parse(saved);
    if (cfg.leaders?.length >= 2) {
      const a = cfg.leaders[0], b = cfg.leaders[1];
      $('sa-name').value = a.name || ''; $('sa-arch').value = a.archetype || ''; $('sa-colony').value = a.colony || ''; $('sa-instr').value = a.instructions || '';
      if (a.hexaco) setSHex('a', a.hexaco);
      $('sb-name').value = b.name || ''; $('sb-arch').value = b.archetype || ''; $('sb-colony').value = b.colony || ''; $('sb-instr').value = b.instructions || '';
      if (b.hexaco) setSHex('b', b.hexaco);
    }
    if (cfg.turns) $('s-turns').value = cfg.turns;
    if (cfg.seed) $('s-seed').value = cfg.seed;
    $('s-preset').value = 'custom';
  } catch {}
}

async function launchFromSettings() {
  const btn = $('s-launch-btn'), st = $('s-launch-status');
  btn.disabled = true; st.textContent = 'Starting...';
  const cfg = buildSetupConfig();
  cfg.apiKey = $('s-apikey').value; cfg.anthropicKey = $('s-anthropic').value;
  cfg.serperKey = $('s-serper').value; cfg.tavilyKey = $('s-tavily')?.value; cfg.firecrawlKey = $('s-firecrawl')?.value; cfg.cohereKey = $('s-cohere')?.value;
  try {
    const res = await fetch('/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    const data = await res.json();
    if (res.status === 429) {
      toast('error', 'Rate Limit Reached', data.error || `Maximum ${data.limit || 3} simulations per day. Resets at midnight UTC.`, 10000);
      st.textContent = 'Rate limited'; btn.disabled = false;
      return;
    }
    if (data.redirect) {
      gameData.config = cfg;
      gameData.events = [];
      gameData.results = [];
      gameData.startedAt = new Date().toISOString();
      gameData.completedAt = null;
      gameData._cleared = false; // Allow SSE events for new sim
      gameData._restoredCount = 0;
      liveEventCount = 0;
      localStorage.removeItem(storageKey('cleared'));
      resetSimulationView(cfg);
      localStorage.removeItem(storageKey('game-data')); // Clear cache for fresh run
      const pf = $('progress-fill'); if (pf) pf.style.width = '0';
      st.textContent = 'Running...';
      switchTab('sim');
    }
    else { st.textContent = 'Error: ' + (data.error || 'unknown'); btn.disabled = false; }
  } catch (err) { st.textContent = 'Failed: ' + err; btn.disabled = false; }
}

// --- Reports ---
function generateReport() {
  if (!gameData.events.length) { alert('No simulation data. Run a simulation first or load a saved game.'); return; }
  const content = $('rpt-content');
  switchTab('reports');

  // Deduplicate events by creating a unique key per event
  // Deduplicate but allow turn_start updates (Director generating... -> real title)
  const seen = new Set();
  const uniqueEvents = gameData.events.filter(evt => {
    const dd = evt.data || {};
    // turn_start with placeholder title should be skipped entirely
    if (evt.type === 'turn_start' && dd.title === 'Director generating...') return false;
    const key = `${evt.type}-${evt.leader}-${dd.turn}-${dd.department || ''}-${dd.outcome || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Group by turn and side
  const turns = {};
  for (const evt of uniqueEvents) {
    const s = side(evt.leader);
    if (!s) continue;
    const dd = evt.data || {};
    const turn = dd.turn;
    if (!turn) continue;
    if (!turns[turn]) turns[turn] = { v: {}, e: {} };
    const t = turns[turn][s];
    if (evt.type === 'turn_start' && dd.title && dd.title !== 'Director generating...') { t.title = dd.title; t.year = dd.year; t.category = dd.category; t.emergent = dd.emergent; t.colony = dd.colony; }
    if (evt.type === 'commander_decided' && dd.decision) { t.decision = dd.decision; }
    if (evt.type === 'outcome' && dd.outcome) { t.outcome = dd.outcome; }
    if (evt.type === 'dept_done') {
      t.depts = t.depts || {};
      t.depts[dd.department] = { summary: dd.summary, tools: (dd.forgedTools || []).length, citations: dd.citations };
    }
    if (evt.type === 'colonist_reactions') { t.reactions = (dd.reactions || []).slice(0, 3); t.totalReactions = dd.totalReactions; }
  }

  let html = '';
  const vName = gameData.config?.leaders?.[0]?.name || Object.keys(leaderMap).find(k => leaderMap[k] === 'v') || 'Leader A';
  const eName = gameData.config?.leaders?.[1]?.name || Object.keys(leaderMap).find(k => leaderMap[k] === 'e') || 'Leader B';

  for (const [turnNum, sides] of Object.entries(turns).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const v = sides.v || {}, e = sides.e || {};
    const year = v.year || e.year || '?';
    const diverged = v.title && e.title && v.title !== e.title;

    const renderSide = (data, name, color) => {
      if (!data.title) return `<div class="rpt-col"><h4 class="${color}">${name}</h4><div style="color:var(--text-3);font-size:14px;padding:12px 0">Awaiting data...</div></div>`;
      const outcomeColor = (data.outcome || '').includes('success') ? 'var(--green)' : 'var(--rust)';
      const outcomeBg = (data.outcome || '').includes('success') ? 'rgba(106,173,72,.12)' : 'rgba(224,101,48,.12)';
      const outcomeLabel = data.outcome ? data.outcome.replace(/_/g, ' ').toUpperCase() : 'PENDING';
      const deptList = data.depts ? Object.entries(data.depts).map(([dept, d]) => `<span style="color:var(--text-1);font-weight:600">${dept.charAt(0).toUpperCase()+dept.slice(1)}</span> <span style="color:var(--text-3)">${d.citations}c ${d.tools}t</span>`).join(' \u00B7 ') : '';
      const colony = data.colony ? `Pop ${data.colony.population} \u00B7 Morale ${Math.round((data.colony.morale||0)*100)}% \u00B7 Food ${(data.colony.foodMonthsReserve||0).toFixed(0)}mo` : '';
      const topQuotes = (data.reactions || []).map(r => {
        const q = esc(r.quote);
        return `<div class="rpt-quote hover-tip">\u201C${q.slice(0,100)}${q.length>100?'...':''}\u201D <span class="rpt-quote-name">\u2014 ${esc(r.name)}</span><div class="htip"><b>${esc(r.name)}</b><div class="ht-quote">\u201C${q}\u201D</div></div></div>`;
      }).join('');

      // Causality inspector: department summaries and tools
      const deptDetails = data.depts ? Object.entries(data.depts).map(([dept, d]) =>
        `<div style="margin:4px 0"><span style="color:var(--amber);font-weight:700;font-size:11px">${dept.charAt(0).toUpperCase()+dept.slice(1)}</span>: ${esc(d.summary || 'No summary').slice(0, 200)}</div>`
      ).join('') : '';

      return `<div class="rpt-col">
        <h4 class="${color}">${esc(name)}</h4>
        <div class="rpt-crisis">\u26A1 ${esc(data.title)} <span style="font-size:11px;color:var(--text-3);background:var(--bg-deep);padding:2px 8px;border-radius:3px;margin-left:6px;font-family:var(--mono)">${data.category || ''}</span></div>
        <div class="rpt-decision">${esc((data.decision || '').slice(0, 350))}</div>
        <div class="rpt-outcome" style="color:${outcomeColor};background:${outcomeBg};border:1px solid ${outcomeColor}">${outcomeLabel}</div>
        ${deptList ? `<div style="font-size:12px;margin-top:8px;font-family:var(--mono);line-height:1.6">${deptList}</div>` : ''}
        ${colony ? `<div style="font-size:12px;color:var(--text-3);margin-top:4px">${colony}</div>` : ''}
        ${topQuotes ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">${topQuotes}</div>` : ''}
        <details style="margin-top:8px">
          <summary style="font-size:11px;color:var(--${color});cursor:pointer;font-weight:600">Causal chain</summary>
          <div style="margin-top:6px;padding:8px 10px;background:var(--bg-deep);border-radius:4px;font-size:12px;line-height:1.6">
            <div style="color:var(--text-3);font-size:10px;font-weight:700;text-transform:uppercase;margin-bottom:4px">Crisis \u2192 Department Analysis \u2192 Decision \u2192 Outcome \u2192 Colony Effect</div>
            <div style="color:var(--rust);font-weight:600">\u26A1 ${esc(data.title)} (${data.category || '?'})</div>
            ${data.emergent ? `<div style="color:var(--text-3);font-size:11px;font-style:italic">Emergent: generated by Crisis Director based on colony state</div>` : `<div style="color:var(--text-3);font-size:11px;font-style:italic">Milestone: fixed narrative event</div>`}
            ${deptDetails ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">${deptDetails}</div>` : ''}
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)"><span style="color:var(--amber);font-weight:700;font-size:11px">Commander:</span> ${esc((data.decision || '').slice(0, 250))}</div>
            <div style="margin-top:4px"><span style="color:${outcomeColor};font-weight:700">\u2192 ${outcomeLabel}</span></div>
            ${colony ? `<div style="margin-top:4px;color:var(--text-3)">\u2192 ${colony}</div>` : ''}
          </div>
        </details>
      </div>`;
    };

    html += `<div class="rpt-turn">
      <div class="rpt-turn-h">
        <span class="rpt-turn-title">Turn ${turnNum} \u2014 ${year}</span>
        <span class="rpt-turn-meta" style="color:${diverged ? 'var(--rust)' : 'var(--text-3)'}">${diverged ? 'DIVERGENT' : 'MILESTONE'}</span>
      </div>
      <div class="rpt-cols">${renderSide(v, vName, 'v')}${renderSide(e, eName, 'e')}</div>
    </div>`;
  }

  // Deduplicated final summary
  const resultsSeen = new Set();
  const uniqueResults = (gameData.results || []).filter(r => {
    const key = `${r.leader}-${r.summary?.population}`;
    if (resultsSeen.has(key)) return false;
    resultsSeen.add(key);
    return true;
  });
  if (uniqueResults.length) {
    html += `<div class="rpt-analysis"><h3>Final Comparison</h3><div class="rpt-cols">`;
    for (const r of uniqueResults) {
      const s = r.summary || {};
      const color = r.leader === 'visionary' ? 'v' : 'e';
      const name = r.leader === 'visionary' ? vName : eName;
      html += `<div class="rpt-col"><h4 class="${color}">${esc(name)}</h4><div style="font-size:15px;line-height:2.2"><b>Population:</b> ${s.population || '?'}<br><b>Morale:</b> ${s.morale ? Math.round(s.morale*100)+'%' : '?'}<br><b>Tools Forged:</b> ${s.toolsForged || 0}<br><b>Citations:</b> ${s.citations || 0}</div></div>`;
    }
    html += `</div></div>`;
  }

  // Replay controls
  const turnNums = Object.keys(turns).sort((a, b) => Number(a) - Number(b));
  html += `<div style="margin-top:16px;padding:14px 20px;background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <b style="font-size:13px;color:var(--text-2);font-family:var(--mono)">REPLAY</b>
    <input type="range" id="rpt-scrubber" min="0" max="${turnNums.length - 1}" value="${turnNums.length - 1}" style="flex:1;min-width:100px;accent-color:var(--amber);height:6px" oninput="scrubToTurn(this.value)">
    <span id="rpt-scrub-label" style="font-size:14px;color:var(--text-1);font-family:var(--mono);min-width:60px;font-weight:600">Turn ${turnNums[turnNums.length - 1] || '?'}</span>
    <span style="color:var(--text-3);font-size:12px">Speed:</span>
    <input type="range" min="50" max="1000" value="500" step="50" style="width:100px;accent-color:var(--rust);height:6px" oninput="setReplaySpeed(this.value)">
    <span id="replay-speed-label" style="font-size:12px;color:var(--text-2);font-family:var(--mono);min-width:50px">Slow</span>
    <button class="act-btn" style="font-size:13px;padding:6px 16px" onclick="replayInSim()">Replay in Sim</button>
  </div>`;

  content.innerHTML = html || '<div class="rpt-empty">No turn data found.</div>';

  // Store turn data for scrubber
  window._rptTurns = turns;
  window._rptTurnNums = turnNums;
}

function scrubToTurn(idx) {
  const turns = window._rptTurns;
  const turnNums = window._rptTurnNums;
  if (!turns || !turnNums) return;
  const turnNum = turnNums[idx];
  $('rpt-scrub-label').textContent = 'Turn ' + turnNum;

  // Highlight the selected turn, dim others
  document.querySelectorAll('.rpt-turn').forEach((el, i) => {
    el.style.opacity = i <= idx ? '1' : '0.3';
  });
}

function replayInSim() {
  if (!gameData.events.length) return;
  resetSimulationView(gameData.config);
  switchTab('sim');
  const total = gameData.events.length;
  const batchSize = Math.max(10, Math.ceil(total / 100));
  let i = 0;
  function batch() {
    const end = Math.min(i + batchSize, total);
    while (i < end) handleSimEvent(gameData.events[i++]);
    $('m-status').textContent = `\u25CF Replaying ${i}/${total}...`;
    if (i >= total) {
      $('m-status').textContent = '\u25CF Replay Complete'; $('m-status').style.color = 'var(--amber)'; $('save-game-btn').style.display = 'inline-block';
      return;
    }
    requestAnimationFrame(batch);
  }
  $('m-status').textContent = '\u25CF Replaying...'; $('m-status').style.color = 'var(--vis)';
  batch();
}

function setReplaySpeed(val) {
  replaySpeed = parseInt(val);
  const label = $('replay-speed-label');
  if (label) label.textContent = replaySpeed < 100 ? 'Fast' : replaySpeed < 300 ? 'Medium' : replaySpeed < 700 ? 'Slow' : 'Very Slow';
}

function loadGameForReport(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const saved = JSON.parse(reader.result);
      if (!saved.events?.length) { alert('No events in file'); return; }
      // Replace game data
      gameData.events = saved.events;
      gameData.results = saved.results || [];
      gameData.config = saved.config || null;
      gameData.startedAt = saved.startedAt || '';
      gameData.completedAt = saved.completedAt || '';
      if (gameData.config) applySetupConfig(gameData.config);
      // Reset leader map for replay
      Object.keys(leaderMap).forEach(k => delete leaderMap[k]);
      // Re-assign sides from events
      for (const evt of saved.events) { if (evt.leader) side(evt.leader); }
      generateReport();
    } catch (err) { alert('Invalid game file: ' + err); }
  };
  reader.readAsText(file);
}

// --- SSE ---
try {
  const es = new EventSource('/events');
  es.addEventListener('connected', () => { log('ok', '✓ Connected'); $('m-status').textContent = '● Connected'; });
  es.addEventListener('status', e => {
    const d = JSON.parse(e.data);
    log('info', `Phase: ${d.phase}`);
    if (d.maxTurns) {
      $('m-max-turns').textContent = d.maxTurns;
      // Update tagline dynamically
      const tag = $('top-tagline');
      if (tag) tag.textContent = `Same ${window.SCENARIO?.labels?.settlementNoun || 'colony'}, two different leaders. ${d.maxTurns} turns.`;
    }
    if (Array.isArray(d.customEvents) && d.customEvents.length) {
      log('info', `Custom events: ${d.customEvents.map(event => event.title).join(', ')}`);
    }
    if (d.phase === 'parallel') {
      $('m-status').textContent = '\u25CF Running'; $('m-status').style.color = 'var(--green)';
      if (d.leaders && d.leaders.length >= 2) {
        populateLeader('v', d.leaders[0]);
        populateLeader('e', d.leaders[1]);
        // Update tagline with leader names
        const tag = $('top-tagline');
        const maxT = $('m-max-turns')?.textContent || '12';
        if (tag) tag.textContent = `${d.leaders[0].name} vs ${d.leaders[1].name}. ${maxT} turns.`;
      }
    }
  });

  liveEventCount = 0;
  es.addEventListener('sim', e => {
    try {
      const d = JSON.parse(e.data);
      liveEventCount++;
      // Skip if cleared (ignore server buffer replay after user cleared)
      if (gameData._cleared) return;
      // Skip if this event was already replayed from server buffer during cache restore
      const cachedLen = gameData._restoredCount || 0;
      if (liveEventCount <= cachedLen) return; // Already rendered from cache
      gameData.events.push(d);
      handleSimEvent(d);
      try { localStorage.setItem(storageKey('game-data'), JSON.stringify(gameData)); } catch {}
    } catch (err) { log('no', 'Event parse error: ' + err); }
  });

  es.addEventListener('result', e => {
    try {
      const d = JSON.parse(e.data);
      gameData.results.push(d);
      log('ok', `\u2713 ${d.leader} done: pop ${d.summary?.population}, ${d.summary?.toolsForged} tools`);
      // Display fingerprint in the simulation column
      if (d.fingerprint) {
        const s = d.leader === 'visionary' || Object.keys(leaderMap).find(k => leaderMap[k] === 'v' && d.leader) ? 'v' : 'e';
        const fp = d.fingerprint;
        const color = s === 'v' ? 'vis' : 'eng';
        addToBody(s, `<div style="background:linear-gradient(135deg,rgba(232,180,74,.06),rgba(76,168,168,.06));border:2px solid var(--${color});border-radius:8px;padding:12px 16px;margin-top:6px">
          <div style="font-size:11px;color:var(--${color});font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">\u2605 COLONY FINGERPRINT</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span style="background:var(--bg-deep);padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;color:var(--text-1)">${esc(fp.resilience)}</span>
            <span style="background:var(--bg-deep);padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;color:var(--text-1)">${esc(fp.autonomy)}</span>
            <span style="background:var(--bg-deep);padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;color:var(--text-1)">${esc(fp.governance)}</span>
            <span style="background:var(--bg-deep);padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;color:var(--text-1)">${esc(fp.riskProfile)}</span>
            <span style="background:var(--bg-deep);padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;color:var(--text-1)">${esc(fp.identity)}</span>
            <span style="background:var(--bg-deep);padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;color:var(--text-1)">${esc(fp.innovation)}</span>
          </div>
        </div>`);
        log('ok', `  Fingerprint: ${fp.summary}`);
      }
    } catch (err) { log('no', 'Result parse error: ' + err); }
  });
  es.addEventListener('complete', () => {
    $('m-status').textContent = '\u25CF Complete'; $('m-status').style.color = 'var(--amber)'; $('m-status').style.animation = 'none';
    const pf = $('progress-fill'); if (pf) pf.style.width = '100%';
    try { localStorage.setItem(storageKey('game-data'), JSON.stringify(gameData)); } catch {}
    gameData.completedAt = new Date().toISOString();
    $('save-game-btn').style.display = 'inline-block';
    const launchBtn = $('s-launch-btn'); if (launchBtn) launchBtn.disabled = false;
    const launchSt = $('s-launch-status'); if (launchSt) launchSt.textContent = 'Complete.';
    log('ok', '\u2713 All complete. Click Reports tab for full analysis. Click Chat to talk to colonists. Click Save Game to download.');
    // Auto-generate report data and populate chat sidebar
    if (typeof generateReport === 'function') try { generateReport(); switchTab('sim'); } catch {}
    if (typeof populateChatSidebar === 'function') try { populateChatSidebar(); } catch {}
  });
  es.addEventListener('sim_error', e => {
    try { log('no', '\u2717 ' + JSON.parse(e.data).error); } catch { log('no', '\u2717 Error'); }
    $('s-launch-btn').disabled = false;
    $('s-launch-status').textContent = 'Simulation error.';
  });
  es.onerror = () => { log('dim', 'SSE reconnecting...'); };
} catch (e) { log('dim', 'Static mode'); }

// --- Event handler (shared by SSE and replay) ---
function handleSimEvent(d) {
  const s = side(d.leader);
  if (!s) return;
  const dd = d.data || {};

  switch (d.type) {
    case 'turn_start': {
      $('m-turn').textContent = dd.turn; $('m-year').textContent = dd.year;
      $('crisis').textContent = `\u26A1 T${dd.turn} \u2014 ${dd.year}: ${dd.title || 'Crisis'}`;
      // Progress bar
      const maxT = parseInt($('m-max-turns')?.textContent || '12');
      const pct = Math.round((dd.turn / maxT) * 100);
      const pf = $('progress-fill'); if (pf) pf.style.width = pct + '%';
      // Per-column crisis header
      const crisisEl = $(`crisis-${s}`);
      if (crisisEl && dd.title && dd.title !== 'Director generating...') {
        $(`crisis-${s}-title`).textContent = `\u26A1 T${dd.turn}: ${dd.title}`;
        $(`crisis-${s}-cat`).textContent = dd.category || '';
        $(`crisis-${s}-summary`).textContent = dd.turnSummary || '';
        crisisEl.style.display = 'block';
      }
      state[s].crisis = { turn: dd.turn, title: dd.title, category: dd.category, emergent: dd.emergent };
      if (dd.colony) updateGauges(s, dd.colony);
      if (dd.deaths) { state[s].deaths += Number(dd.deaths) || 0; $(`s-${s}-deaths`).textContent = state[s].deaths; }
      log('info', `[${d.leader}] Turn ${dd.turn} \u2014 ${dd.year}: ${dd.title}${dd.emergent ? ' [EMERGENT]' : ''}`);
      break;
    }

    case 'promotion': {
      // Accumulate promotions into a single compact list
      let promoList = $(`promo-list-${s}`);
      if (!promoList) {
        addToBody(s, `<div class="card" style="padding:8px 12px"><div style="font-size:12px;color:var(--amber);font-weight:700;margin-bottom:6px">\u2726 DEPARTMENT HEADS PROMOTED</div><div id="promo-list-${s}" style="font-size:12px;line-height:1.8"></div></div>`);
        promoList = $(`promo-list-${s}`);
      }
      if (promoList) {
        const rawName = (dd.colonistId || '').replace('col-', '').replace(/-/g, ' ');
        const capName = esc(rawName.replace(/\b\w/g, c => c.toUpperCase()));
        const role = esc(dd.role || '');
        const dept = esc(dd.department || 'N/A');
        const reason = esc(dd.reason || 'No reason provided');
        const reasonShort = reason.length > 60 ? reason.slice(0, 60) + '...' : reason;
        promoList.insertAdjacentHTML('beforeend', `<div class="hover-tip" style="display:flex;gap:6px;align-items:baseline;font-size:12px;padding:2px 0">
          <span style="color:var(--text-1);font-weight:600">${capName}</span>
          <span style="color:var(--text-3)">\u2192</span>
          <span style="color:var(--amber);font-weight:600">${role}</span>
          <span style="color:var(--text-3);font-size:10px;font-style:italic;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${reasonShort}</span>
          <div class="htip">
            <b>${capName}</b>
            <div style="font-size:12px;color:var(--text-2);margin:4px 0">Promoted to: <span style="color:var(--amber);font-weight:700">${role}</span></div>
            <div style="font-size:12px;color:var(--text-2);margin:2px 0">Department: <span style="color:var(--text-1)">${dept}</span></div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:12px;line-height:1.6">
              <span style="color:var(--amber);font-weight:600">Commander reasoning:</span><br>
              ${reason}
            </div>
          </div>
        </div>`);
        // Bind tooltips on newly added promo rows
        promoList.querySelectorAll('.hover-tip').forEach(el => { if (typeof bindTip === 'function') bindTip(el); });
      }
      break;
    }

    case 'dept_start': {
      const dIcon = (window.DEPT_ICONS || {})[dd.department] || '📋';
      // Remove previous loading indicator for this side
      const prev = $(`loading-${s}`);
      if (prev) prev.remove();
      addToBody(s, `<div class="loading-card" id="loading-${s}" style="font-size:11px;color:var(--text-3);padding:4px 10px;display:flex;align-items:center;gap:6px"><span style="animation:pulse 1.5s infinite">${dIcon}</span>${(dd.department || '').charAt(0).toUpperCase() + (dd.department || '').slice(1)} analyzing...</div>`);
      break;
    }

    case 'commander_deciding': {
      const prev2 = $(`loading-${s}`);
      if (prev2) prev2.remove();
      addToBody(s, `<div class="loading-card" id="loading-${s}" style="font-size:11px;color:var(--text-3);padding:4px 10px;display:flex;align-items:center;gap:6px"><span style="animation:pulse 1.5s infinite">\u26A1</span>Commander deciding...</div>`);
      break;
    }

    case 'dept_done': {
      const loadEl = $(`loading-${s}`);
      if (loadEl) loadEl.remove();
      const dept = (dd.department || '');
      const deptUp = dept.toUpperCase();
      const icon = (window.DEPT_ICONS || {})[dept] || '📋';
      const summary = dd.summary || '';
      const seenTools = state[s]._shownTools || new Set();
      state[s]._shownTools = seenTools;
      const tools = (dd.forgedTools || []).filter(t => { if (!t.name || t.name === 'unnamed' || seenTools.has(t.name)) return false; seenTools.add(t.name); return true; });
      const risksArr = Array.isArray(dd.risks) ? dd.risks : [];
      const severity = risksArr.some(r => r.severity === 'critical') ? 'critical' : risksArr.some(r => r.severity === 'high') ? 'high' : '';

      // Department pill (accumulate into a row)
      let pillRow = $(`dept-pills-${s}-${dd.turn}`);
      if (!pillRow) {
        addToBody(s, `<div id="dept-pills-${s}-${dd.turn}" style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px"></div>`);
        pillRow = $(`dept-pills-${s}-${dd.turn}`);
      }
      if (pillRow) {
        const sevColor = severity === 'critical' ? 'rgba(224,101,48,.2)' : severity === 'high' ? 'rgba(232,180,74,.15)' : 'rgba(48,42,34,.6)';
        const sevText = severity === 'critical' ? 'color:var(--rust)' : severity === 'high' ? 'color:var(--amber)' : 'color:var(--text-2)';
        const sevLabel = severity ? ` \u00B7 ${severity.toUpperCase()}` : '';
        const recActions = Array.isArray(dd.recommendedActions) ? dd.recommendedActions : [];
        const citeList = Array.isArray(dd.citationList) ? dd.citationList : [];
        const citesHtml = citeList.map(c => `<div style="font-size:11px;margin:2px 0"><a href="${esc(c.url)}" target="_blank" rel="noopener" style="color:var(--amber);text-decoration:underline">${esc(c.text)}</a>${c.doi ? ` <span style="color:var(--text-3);font-size:10px">DOI:${esc(c.doi)}</span>` : ''}</div>`).join('');
        const pillPop = `<div class="htip"><b>${icon} ${deptUp}</b><div class="ht-stats">Citations: ${dd.citations || 0} | Tools: ${tools.length}</div>${summary ? `<div style="margin:4px 0;color:var(--text-1);font-size:12px">${esc(summary)}</div>` : ''}${risksArr.map(r => `<div style="font-size:11px;margin:2px 0"><span style="color:${r.severity === 'critical' ? 'var(--rust)' : 'var(--amber)'};font-weight:700">${esc((r.severity||'').toUpperCase())}</span>: ${esc(r.description||'')}</div>`).join('')}${recActions.map(r => `<div style="font-size:11px;color:var(--amber)">\u2192 ${esc(r)}</div>`).join('')}${citesHtml ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)"><span style="font-size:10px;color:var(--text-3);font-weight:700">CITATIONS:</span>${citesHtml}</div>` : ''}</div>`;
        pillRow.innerHTML += `<span class="hover-tip tip-dot" style="background:${sevColor};${sevText};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">${icon} ${dept.charAt(0).toUpperCase() + dept.slice(1)} \u00B7 ${dd.citations || 0}c ${tools.length}t${sevLabel}${pillPop}</span>`;
        // innerHTML += destroys+recreates all children, rebind all tips
        pillRow.querySelectorAll('.hover-tip').forEach(el => { if (typeof bindTip === 'function') bindTip(el); });
      }

      // Tool cards with collapsible details
      for (const t of tools) {
        const desc = t.description || t.name.replace(/_v\d+$/, '').replace(/_/g, ' ');
        const outFields = (t.outputFields || []).join(', ');
        const whyDept = t.department ? (t.department.charAt(0).toUpperCase() + t.department.slice(1)) : dept;
        // Parse key values from output for inline display
        let parsedValues = '';
        if (t.output) {
          try {
            const p = typeof t.output === 'string' ? JSON.parse(t.output) : t.output;
            if (p && typeof p === 'object') {
              parsedValues = Object.entries(p).slice(0, 4).map(([k, v]) => {
                const val = typeof v === 'number' ? (v % 1 ? v.toFixed(1) : v) : String(v).slice(0, 15);
                return `<span style="color:var(--text-3);font-size:10px">${esc(k)}:</span> <b style="color:var(--text-1)">${esc(String(val))}</b>`;
              }).join('<span style="color:var(--border);margin:0 6px">\u00B7</span>');
            }
          } catch {}
        }
        const toolPop = `<div class="htip"><b>\uD83D\uDD27 ${esc(t.name)}</b><div style="margin:6px 0;color:var(--text-1);font-size:12px;line-height:1.5">${esc(desc)}</div><div class="ht-stats">Mode: ${t.mode || 'sandbox'} | Confidence: ${(t.confidence || .85).toFixed(2)} | ${whyDept} dept</div>${outFields ? `<div class="ht-hexaco">OUTPUTS: ${esc(outFields)}</div>` : ''}${t.output ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-size:11px;font-family:var(--mono);color:var(--text-2);max-height:100px;overflow-y:auto;word-break:break-all;line-height:1.5">${esc(String(t.output).slice(0, 400))}</div>` : ''}</div>`;

        addToBody(s, `<div class="forge ok hover-tip" style="padding:10px 14px">
          <span style="font-size:16px">\uD83D\uDD27</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-size:9px;color:var(--green);text-transform:uppercase;letter-spacing:.5px;font-weight:800;flex-shrink:0">FORGED</span>
              <span style="font-size:13px;font-weight:600;color:var(--text-1)">${esc(desc.length > 80 ? desc.slice(0,80)+'...' : desc)}</span>
              <span style="color:var(--green);font-weight:800;font-family:var(--mono);font-size:11px">\u2713 ${(t.confidence || .85).toFixed(2)}</span>
            </div>
            ${parsedValues ? `<div style="font-size:12px;color:var(--text-2);margin-top:6px;padding:4px 0;font-family:var(--mono);display:flex;align-items:baseline;flex-wrap:wrap;gap:2px">${parsedValues}</div>` : ''}
            <details style="margin-top:6px"><summary style="font-size:11px;color:var(--text-3);cursor:pointer">${esc(t.name)} \u00B7 ${t.mode || 'sandbox'} \u00B7 ${whyDept}</summary><div style="margin-top:4px;font-family:var(--mono);font-size:11px;color:var(--text-3);background:var(--bg-deep);padding:6px 8px;border-radius:4px;max-height:80px;overflow:auto;word-break:break-all;line-height:1.5">${t.output ? esc(String(t.output).slice(0, 400)) : '<span style="color:var(--text-3);font-style:italic">Tool approved by judge but produced no computed output. The model created the tool definition without executing it against colony data.</span>'}</div></details>
          </div>
          ${toolPop}
        </div>`);
      }
      state[s].tools += tools.length; $(`s-${s}-tools`).textContent = state[s].tools || 0;
      state[s].cites += (Number(dd.citations) || 0); const citesEl = $(`s-${s}-cites`); if (citesEl) citesEl.textContent = state[s].cites || 0;
      log('ok', `[${d.leader}] ${icon} ${deptUp}: ${dd.citations || 0} cites, ${tools.length} tools`);
      break;
    }

    case 'forge_attempt':
      if (dd.approved) log('ok', `  \uD83D\uDD27 \u2713 ${dd.name}`);
      else log('no', `  \uD83D\uDD27 \u2717 ${dd.name}: ${(dd.reason || '').slice(0, 60)}`);
      break;

    case 'commander_decided': {
      const loadEl3 = $(`loading-${s}`);
      if (loadEl3) loadEl3.remove();
      state[s].pendingDecision = dd.decision;
      state[s].pendingRationale = dd.rationale || '';
      state[s].pendingPolicies = dd.selectedPolicies || [];
      log('info', `[${d.leader}] ${(dd.decision || '').slice(0, 60)}`);
      break;
    }

    case 'outcome': {
      const dec = state[s].pendingDecision || '';
      const rationale = state[s].pendingRationale || '';
      const policies = state[s].pendingPolicies || [];
      const oc = dd.outcome || '';
      const cls = oc === 'risky_success' ? 'rs' : oc === 'conservative_success' ? 'cs' : 'rf';
      const badge = oc === 'risky_success' ? 'RISKY WIN' : oc === 'risky_failure' ? 'RISKY LOSS' : oc === 'conservative_success' ? 'SAFE WIN' : 'SAFE LOSS';
      const icon = oc.includes('success') ? '\u2713' : '\u2717';
      const outcomeColor = oc.includes('success') ? 'var(--green)' : 'var(--rust)';
      const decShort = dec.length > 150 ? esc(dec.slice(0, 150)) + '...' : esc(dec);
      const decFull = esc(dec);
      const ratFull = esc(rationale);
      const polList = policies.length ? policies.map(p => `<div style="font-size:11px;color:var(--amber);margin:2px 0">\u2192 ${esc(p)}</div>`).join('') : '';
      state[s].decisions = (state[s].decisions || 0) + 1;
      const decNum = state[s].decisions;
      const colDeltas = dd.colonyDeltas ? Object.entries(dd.colonyDeltas).map(([k, v]) => `<span style="color:${(v > 0) ? 'var(--green)' : 'var(--rust)'};font-family:var(--mono)">${esc(k)} ${v > 0 ? '+' : ''}${v}</span>`).join(' \u00B7 ') : '';
      addToBody(s, `<div class="dec ${s}" style="padding:10px 14px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="flex:1;min-width:0">
            <span style="color:var(--${s === 'v' ? 'vis' : 'eng'});font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px">\u26A1 DECISION #${decNum}</span>
            <span style="color:var(--text-3);font-size:10px;margin-left:8px;font-family:var(--mono)">${state[s].tools} tools \u00B7 ${state[s].cites} citations</span>
            <div style="color:var(--text-1);font-size:13px;margin-top:4px;line-height:1.5">${decShort}</div>
          </div>
          <span class="ob ${cls}" style="flex-shrink:0">${icon} ${badge}</span>
        </div>
        ${colDeltas ? `<div style="margin-top:6px;font-size:11px">${colDeltas}</div>` : ''}
        <details style="margin-top:6px">
          <summary style="font-size:11px;color:var(--${s === 'v' ? 'vis' : 'eng'});cursor:pointer;font-weight:600">Full reasoning &amp; policies</summary>
          <div style="margin-top:6px;padding:8px 10px;background:var(--bg-deep);border-radius:4px;font-size:12px;line-height:1.6">
            <div style="color:var(--text-1);margin-bottom:6px">${decFull}</div>
            ${ratFull ? `<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px"><span style="color:var(--amber);font-weight:700;font-size:10px;text-transform:uppercase">Rationale:</span><div style="color:var(--text-2);margin-top:2px">${ratFull}</div></div>` : ''}
            ${polList ? `<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px"><span style="color:var(--amber);font-weight:700;font-size:10px;text-transform:uppercase">Selected Policies:</span>${polList}</div>` : ''}
          </div>
        </details>
        <div id="drift-slot-${s}-${dd.turn}" class="drift-inline" style="display:none"></div>
      </div>`);
      addTimeline(s, dd.year, dec, cls, icon, dec);
      state[s].outcome = oc; state[s].decision = dec;
      // Divergence check
      const other = s === 'v' ? 'e' : 'v';
      if (state[other].crisis && state[s].crisis && state[other].outcome && state[s].crisis.turn === state[other].crisis.turn) {
        const vC = state.v.crisis, eC = state.e.crisis;
        if (vC.title !== eC.title || state.v.outcome !== state.e.outcome) {
          const rail = $('diverge-rail');
          const fmtOutcome = o => (o || '').replace(/_/g, ' ').toUpperCase();
          const outcomeStyle = o => (o || '').includes('success') ? 'color:var(--green)' : 'color:var(--rust)';
          const sameCrisis = vC.title === eC.title;
          rail.innerHTML = `<div class="diverge-title">\u26A1 TURN ${vC.turn} DIVERGENCE ${sameCrisis ? '(same crisis, different outcome)' : '(different crises)'}</div>
            <div class="diverge-row">
              <div class="diverge-side v">
                <b style="color:var(--vis)">${esc(vC.title)}</b>
                <div style="font-size:11px;color:var(--text-2);margin:2px 0">${esc((state.v.decision || '').slice(0, 100))}${(state.v.decision || '').length > 100 ? '...' : ''}</div>
                <span style="${outcomeStyle(state.v.outcome)};font-weight:800;font-family:var(--mono);font-size:12px">${fmtOutcome(state.v.outcome)}</span>
              </div>
              <div class="diverge-side e">
                <b style="color:var(--eng)">${esc(eC.title)}</b>
                <div style="font-size:11px;color:var(--text-2);margin:2px 0">${esc((state.e.decision || '').slice(0, 100))}${(state.e.decision || '').length > 100 ? '...' : ''}</div>
                <span style="${outcomeStyle(state.e.outcome)};font-weight:800;font-family:var(--mono);font-size:12px">${fmtOutcome(state.e.outcome)}</span>
              </div>
            </div>`;
          rail.style.display = 'block';
        }
      }
      log(oc.includes('success') ? 'ok' : 'no', `  \u2192 ${oc}`);
      break;
    }

    case 'drift': {
      const entries = Object.values(dd.colonists || {});
      if (entries.length) {
        const slot = $(`drift-slot-${s}-${dd.turn}`);
        if (slot) {
          const color = s === 'v' ? 'vis' : 'eng';
          slot.innerHTML = `<span style="font-size:9px;color:var(--text-3);font-weight:700">DRIFT:</span> ` + entries.slice(0, 3).map(c => `<span style="color:var(--${color})">${c.name.split(' ')[0]}</span> O${c.hexaco?.O ?? '?'} C${c.hexaco?.C ?? '?'}`).join(' \u00B7 ');
          slot.style.display = 'block';
        }
        state[s].prevDrift = {};
        for (const c of entries) { if (c.hexaco) state[s].prevDrift[c.name] = c.hexaco; }
      }
      break;
    }

    case 'colonist_reactions': {
      const reactions = dd.reactions || [];
      if (reactions.length) {
        const color = s === 'v' ? 'vis' : 'eng';
        const moodColors = { positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)', defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)' };

        // Calculate mood distribution
        const moodCounts = {};
        for (const r of reactions) { moodCounts[r.mood] = (moodCounts[r.mood] || 0) + 1; }
        // Use totalReactions for percentages
        const total = dd.totalReactions || reactions.length;
        const moodBarSegments = Object.entries(moodCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([mood, count]) => {
            const pct = Math.round((count / reactions.length) * 100);
            const bgColor = { positive: '#6aad48', negative: '#e06530', anxious: '#e8b44a', defiant: '#e06530', hopeful: '#6aad48', resigned: '#a89878', neutral: '#a89878' }[mood] || '#a89878';
            return { mood, count, pct, bgColor };
          });
        const barHtml = moodBarSegments.map(m => `<div style="flex:${m.pct};background:${m.bgColor}" title="${m.pct}% ${m.mood}"></div>`).join('');
        const legendHtml = moodBarSegments.slice(0, 3).map(m => `<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.bgColor};margin-right:3px"></span>${m.pct}% ${m.mood}</span>`).join(' ');

        // Individual quotes with tooltip popovers
        // Key: the .htip must NOT be inside the flex row. It sits as a sibling below the flex row,
        // both wrapped by the .hover-tip container which is display:block (not flex).
        const quotesHtml = reactions.slice(0, 6).map(r => {
          const moodColor = moodColors[r.mood] || 'var(--text-2)';
          const h = r.hexaco || {};
          const q = esc(r.quote || '');
          const n = esc(r.name || '');
          return `<div class="hover-tip" style="display:block;padding:5px 0;border-bottom:1px solid rgba(48,42,34,.5)"><div style="display:flex;gap:8px;align-items:baseline"><span style="font-weight:600;color:var(--${color});font-size:12px;min-width:100px;flex-shrink:0">${n}</span><span style="font-style:italic;color:var(--text-1);font-size:12px;flex:1">\u201C${esc((r.quote||'').slice(0, 90))}${(r.quote||'').length > 90 ? '...' : ''}\u201D</span><span style="font-size:10px;color:${moodColor};font-weight:700;flex-shrink:0">${(r.mood||'').toUpperCase()}</span></div><div class="htip"><b>${n}</b><div style="font-size:11px;color:var(--text-2);margin:4px 0">Age ${r.age || '?'}${r.marsborn ? ' (Mars-born)' : ''} \u00B7 ${esc(r.role||'')} \u00B7 ${esc(r.specialization || r.department || '')}</div><div class="ht-hexaco">O=${h.O||'?'} C=${h.C||'?'} E=${h.E||'?'} A=${h.A||'?'} Em=${h.Em||'?'} HH=${h.HH||'?'}</div><div class="ht-stats">Psych: ${r.psychScore||'?'} | Bone: ${r.boneDensity||'?'}% | Rad: ${r.radiation||'?'} mSv</div><div class="ht-mood" style="color:${moodColor}">${(r.mood||'').toUpperCase()} (intensity: ${(r.intensity||0).toFixed(2)})</div><div class="ht-quote">\u201C${q}\u201D</div></div></div>`;
        }).join('');

        addToBody(s, `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-top:2px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <span style="font-size:10px;color:var(--${color});font-weight:800;text-transform:uppercase;letter-spacing:.5px">\uD83D\uDDE3 ${total} voices</span>
            <div style="flex:1;display:flex;height:14px;border-radius:4px;overflow:hidden;gap:1px">${barHtml}</div>
          </div>
          <div style="display:flex;gap:14px;font-size:11px;margin-bottom:4px">${legendHtml}</div>
          <details open>
            <summary style="font-size:11px;color:var(--${color});cursor:pointer;font-weight:600">Individual quotes</summary>
            <div style="margin-top:4px">${quotesHtml}</div>
          </details>
        </div>`);
        // Track colonists for post-sim chat
        for (const r of reactions) {
          if (r.name) chatColonists.set(r.name, r);
        }
        log('ok', `[${d.leader}] ${total} colonist reactions`);
      }
      break;
    }

    case 'bulletin': {
      const posts = dd.posts || [];
      if (posts.length) {
        const color = s === 'v' ? 'vis' : 'eng';
        const postsHtml = posts.map(p => {
          const moodColors = { positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)', defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)' };
          const moodColor = moodColors[p.mood] || 'var(--text-2)';
          return `<div class="bb-post">
            <div class="bb-header">
              <span class="bb-name" style="color:var(--${color})">${esc(p.name)}</span>
              <span class="bb-meta">${esc(p.role || '')} \u00B7 ${esc(p.department || '')}</span>
              ${p.marsborn ? '<span class="bb-meta" style="color:var(--rust)">\u00B7 Mars-born</span>' : ''}
            </div>
            <div class="bb-text">${esc(p.post)}</div>
            <div class="bb-footer">
              <span style="color:${moodColor}">${(p.mood || '').toUpperCase()}</span>
              <span>\u2661 ${p.likes || 0}</span>
              <span>\u21A9 ${p.replies || 0}</span>
            </div>
          </div>`;
        }).join('');
        addToBody(s, `<div style="margin-top:2px">
          <div style="font-size:10px;color:var(--${color});font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">📢 ${(window.SCENARIO?.labels?.settlementNoun || 'Colony').charAt(0).toUpperCase() + (window.SCENARIO?.labels?.settlementNoun || 'colony').slice(1)} Bulletin — Year ${dd.year || ''}</div>
          <div style="display:flex;flex-direction:column;gap:4px">${postsHtml}</div>
        </div>`);
      }
      break;
    }

    case 'turn_done':
      if (dd.colony) updateGauges(s, dd.colony);
      addToBody(s, `<div class="turn-sep">Turn ${dd.turn} complete</div>`);
      break;
  }
}

// --- Colonist Chat ---
let chatColonistId = null;
let chatHistory = [];
const chatColonists = new Map(); // name -> last reaction data

function populateChatSidebar() {
  const list = $('chat-colonist-list');
  if (!list) return;
  if (!chatColonists.size) {
    list.innerHTML = '<div style="color:var(--text-3);font-size:12px">Run a simulation to chat with colonists.</div>';
    return;
  }
  const moodColors = { positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)', defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)' };
  let html = '';
  for (const [name, r] of chatColonists) {
    const moodColor = moodColors[r.mood] || 'var(--text-2)';
    html += `<div class="chat-colonist${chatColonistId === name ? ' active' : ''}" onclick="selectChatColonist('${esc(name)}')">
      <span class="cc-name">${esc(name)}</span>
      <span class="cc-role">${esc(r.role || '')} · ${esc(r.department || '')}</span>
      <span class="cc-mood" style="color:${moodColor}">${(r.mood || '').toUpperCase()}</span>
    </div>`;
  }
  list.innerHTML = html;
}

function selectChatColonist(name) {
  chatColonistId = name;
  chatHistory = [];
  const msgs = $('chat-messages');
  const colonist = chatColonists.get(name);
  const _sc = window.SCENARIO || MARS_FALLBACK_SCENARIO;
  msgs.innerHTML = `<div class="chat-msg colonist"><div class="cm-name">${esc(name)}</div>${colonist ? `${esc(colonist.role)} in ${esc(colonist.department)}. Age ${colonist.age || '?'}.` : ''} Ask me anything about life in the ${_sc.labels?.settlementNoun || 'colony'}.</div>`;
  $('chat-input').disabled = false;
  $('chat-send-btn').disabled = false;
  $('chat-input').focus();
  populateChatSidebar();
}

async function sendChat() {
  const input = $('chat-input');
  const message = input.value.trim();
  if (!message || !chatColonistId) return;
  input.value = '';
  input.disabled = true;
  $('chat-send-btn').disabled = true;

  const msgs = $('chat-messages');
  msgs.innerHTML += `<div class="chat-msg user">${esc(message)}</div>`;
  msgs.innerHTML += `<div class="chat-msg colonist" id="chat-pending" style="opacity:.5">Thinking...</div>`;
  msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });

  chatHistory.push({ role: 'user', content: message });

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colonistId: chatColonistId, message, history: chatHistory }),
    });
    const data = await res.json();
    const pending = $('chat-pending');
    if (pending) pending.remove();
    if (data.reply) {
      chatHistory.push({ role: 'assistant', content: data.reply });
      msgs.innerHTML += `<div class="chat-msg colonist"><div class="cm-name">${esc(data.colonist || chatColonistId)}</div>${esc(data.reply)}</div>`;
    } else {
      msgs.innerHTML += `<div class="chat-msg colonist" style="color:var(--rust)">${esc(data.error || 'No response')}</div>`;
    }
  } catch (err) {
    const pending = $('chat-pending');
    if (pending) pending.remove();
    msgs.innerHTML += `<div class="chat-msg colonist" style="color:var(--rust)">Chat failed: ${esc(String(err))}</div>`;
  }

  input.disabled = false;
  $('chat-send-btn').disabled = false;
  input.focus();
  msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });
}

// Tooltip system: uses mouseenter/mouseleave which do NOT fire for child transitions.
// MutationObserver auto-attaches listeners to dynamically added .hover-tip and .tip-wrap elements.
let _activeTip = null;

// Shared floating tooltip container appended to body (escapes all overflow/transform ancestors)
const _tipContainer = document.createElement('div');
_tipContainer.id = 'tip-float';
_tipContainer.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;top:0;left:0';
document.body.appendChild(_tipContainer);

function showTip(trigger, popup) {
  if (_activeTip && _activeTip !== popup) {
    // Return previous tip to its original parent
    if (_activeTip._origParent) { _activeTip._origParent.appendChild(_activeTip); }
    _activeTip.style.display = 'none';
  }
  _activeTip = popup;
  // Move popup to the floating container so it escapes overflow/transform ancestors
  if (!popup._origParent) popup._origParent = popup.parentNode;
  _tipContainer.appendChild(popup);
  popup.style.left = '-9999px';
  popup.style.top = '-9999px';
  popup.style.display = 'block';
  const rect = trigger.getBoundingClientRect();
  const tipH = popup.offsetHeight || 300;
  const tipW = popup.offsetWidth || 380;
  let left = rect.left;
  let top = rect.top - tipH - 12;
  if (top < 10) top = rect.bottom + 12;
  if (left + tipW > window.innerWidth - 10) left = window.innerWidth - tipW - 10;
  if (left < 10) left = 10;
  if (top + tipH > window.innerHeight - 10) top = window.innerHeight - tipH - 10;
  if (top < 10) top = 10;
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
}

function bindTip(el) {
  if (el._tipBound) return; // already bound
  el._tipBound = true;
  const popup = el.querySelector(':scope > .htip') || el.querySelector('.htip') || el.querySelector('.tip-pop');
  if (!popup) {
    console.warn('[tooltip] bindTip: no .htip/.tip-pop found in', el.className, el.textContent?.slice(0, 40));
    return;
  }
  el.addEventListener('mouseenter', () => showTip(el, popup));
  el.addEventListener('mouseleave', () => {
    popup.style.display = 'none';
    // Return to original parent so querySelector still finds it next time
    if (popup._origParent && popup.parentNode !== popup._origParent) popup._origParent.appendChild(popup);
    if (_activeTip === popup) _activeTip = null;
  });
}

// Bind all existing elements
document.querySelectorAll('.hover-tip, .tip-wrap').forEach(bindTip);

// Auto-bind dynamically added elements
new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.('.hover-tip, .tip-wrap')) bindTip(node);
      if (node.querySelectorAll) node.querySelectorAll('.hover-tip, .tip-wrap').forEach(bindTip);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// Dismiss intro if previously dismissed
if (localStorage.getItem(storageKey('intro-dismissed')) === '1') {
  const intro = $('intro-bar');
  if (intro) intro.style.display = 'none';
}

// Restore cached game data on page load (survives refresh)
function restoreFromCache() {
  try {
    // Skip restore if user explicitly cleared
    if (localStorage.getItem(storageKey('cleared'))) return false;
    const cached = localStorage.getItem(storageKey('game-data'));
    if (!cached) return false;
    const saved = JSON.parse(cached);
    if (!saved.events || !saved.events.length) return false;
    // Restore game data
    gameData.events = saved.events;
    gameData.results = saved.results || [];
    gameData.config = saved.config || null;
    gameData.startedAt = saved.startedAt || '';
    gameData.completedAt = saved.completedAt || null;
    // Replay all events instantly (no delay)
    for (const evt of saved.events) {
      if (evt.leader) side(evt.leader); // ensure leader mapping
      handleSimEvent(evt);
    }
    // Show save button if completed
    if (saved.completedAt) {
      $('m-status').textContent = '\u25CF Complete'; $('m-status').style.color = 'var(--amber)'; $('m-status').style.animation = 'none';
      $('save-game-btn').style.display = 'inline-block';
      const pf = $('progress-fill'); if (pf) pf.style.width = '100%';
    } else {
      $('m-status').textContent = '\u25CF Restored'; $('m-status').style.color = 'var(--vis)';
    }
    gameData._restoredCount = saved.events.length;
    log('ok', `Restored ${saved.events.length} events from cache`);
    return true;
  } catch (err) {
    log('dim', 'Cache restore failed: ' + err);
    return false;
  }
}

// Load config from URL params on startup
if (loadFromParams()) {
  syncProviderDefaults();
  switchTab('settings');
} else if (window.location.hash === '#settings') {
  syncProviderDefaults();
  switchTab('settings');
} else {
  syncProviderDefaults();
  restoreSettings();
  // Try restoring cached game data
  restoreFromCache();
}
