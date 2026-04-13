const $ = id => document.getElementById(id);
let replaySpeed = 500; // ms between events during replay (default: readable pace)
const log = (cls, msg) => { const d = $('debug'); d.innerHTML += `<br><span class="${cls}">${msg}</span>`; d.scrollTop = d.scrollHeight; };

function switchTab(tab) {
  const panels = { sim: ['main-view','tl-view'], reports: ['reports-panel'], log: ['debug'], settings: ['settings-panel'], about: ['about-panel'] };
  document.querySelectorAll('.tab-bar button').forEach(b => b.classList.remove('active'));
  for (const ids of Object.values(panels)) ids.forEach(id => { const el = $(id); if (el) { el.style.display = 'none'; el.style.flex = ''; } });
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
  v: { pop: [], morale: [], deaths: 0, tools: 0, cites: 0, crisis: null, decision: null, outcome: null, prevColony: null, prevDrift: {} },
  e: { pop: [], morale: [], deaths: 0, tools: 0, cites: 0, crisis: null, decision: null, outcome: null, prevColony: null, prevDrift: {} }
};
const sparkChars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
const spark = arr => arr.map(v => sparkChars[Math.min(7, Math.floor(v / (Math.max(...arr) || 1) * 7.99))]).join('');

function delta(curr, prev) {
  if (prev == null) return '';
  const d = curr - prev;
  if (d === 0) return '';
  // Return as a small superscript-style suffix, not a line break
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
  body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
}
function addTimeline(s, year, text, badgeCls, badge) {
  const tl = $(`tl-${s}`);
  const key = `${year}-${text.slice(0,20)}`;
  if (tl.dataset.lastEntry === key) return;
  tl.dataset.lastEntry = key;
  tl.querySelectorAll('.tr.now').forEach(el => el.classList.remove('now'));
  const div = document.createElement('div');
  div.className = 'tr now hover-tip';
  div.innerHTML = `<span class="ty ${s}">${year}</span><span class="tt">${text}</span><span class="ob ${badgeCls}" style="font-size:9px;padding:1px 5px">${badge}</span><div class="htip" style="bottom:100%;top:auto;width:280px"><b>Year ${year}</b><div style="margin-top:3px;color:var(--text-1);line-height:1.5">${text}</div></div>`;
  tl.appendChild(div);
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
  return { pop: [], morale: [], deaths: 0, tools: 0, crisis: null, decision: null, outcome: null, prevColony: null, prevDrift: {} };
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
  row.innerHTML = `<input value="${person.name || ''}"><input value="${person.specialization || ''}"><input value="${person.age ?? 35}" type="number"><select><option value="medical">Medical</option><option value="engineering">Engineering</option><option value="agriculture">Agriculture</option><option value="psychology">Psychology</option><option value="science">Science</option></select>`;
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

function saveGame() {
  gameData.completedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(gameData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mars-genesis-${gameData.config?.seed || 950}-${gameData.events.length}events.json`;
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
      let i = 0;
      function replayNext() {
        if (i >= gameData.events.length) { $('m-status').textContent = '\u25CF Replay Complete'; $('m-status').style.color = 'var(--amber)'; $('save-game-btn').style.display = 'inline-block'; return; }
        handleSimEvent(gameData.events[i++]);
        $('m-status').textContent = `\u25CF Replaying ${i}/${gameData.events.length}...`;
        setTimeout(replayNext, replaySpeed);
      }
      $('m-status').textContent = '\u25CF Replaying...'; $('m-status').style.color = 'var(--vis)';
      replayNext();
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
  d.innerHTML = '<input placeholder="Name"><input placeholder="Specialization"><input value="35" type="number"><select><option value="medical">Medical</option><option value="engineering">Engineering</option><option value="agriculture">Agriculture</option><option value="psychology">Psychology</option><option value="science">Science</option><option value="governance">Governance</option></select><button class="s-rm" onclick="this.parentElement.remove()">x</button>';
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
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mars-genesis-config.json'; a.click();
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

function saveSettingsToStorage() {
  const cfg = buildSetupConfig();
  try {
    localStorage.setItem('mars-settings', JSON.stringify(cfg));
    const st = $('s-launch-status');
    if (st) { st.textContent = 'Settings saved.'; setTimeout(() => { st.textContent = ''; }, 2000); }
  } catch (err) { alert('Failed to save: ' + err); }
}

function resetSettingsToDefaults() {
  applySetupPreset('default');
  localStorage.removeItem('mars-settings');
  const st = $('s-launch-status');
  if (st) { st.textContent = 'Reset to defaults.'; setTimeout(() => { st.textContent = ''; }, 2000); }
}

// Restore saved settings on load
function restoreSettings() {
  try {
    const saved = localStorage.getItem('mars-settings');
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
    if (data.redirect) {
      gameData.config = cfg;
      gameData.events = [];
      gameData.results = [];
      gameData.startedAt = new Date().toISOString();
      gameData.completedAt = null;
      resetSimulationView(cfg);
      localStorage.removeItem('mars-game-data'); // Clear cache for fresh run
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
      if (!data.title) return `<div class="rpt-col"><h4 class="${color}">${name}</h4><div style="color:var(--text-3);font-size:11px">Awaiting data...</div></div>`;
      const outcomeColor = (data.outcome || '').includes('success') ? 'var(--green)' : 'var(--rust)';
      const outcomeLabel = data.outcome ? data.outcome.replace(/_/g, ' ').toUpperCase() : 'PENDING';
      const deptList = data.depts ? Object.entries(data.depts).map(([dept, d]) => `<span style="color:var(--text-2)">${dept}</span> ${d.citations}c ${d.tools}t`).join(' \u00B7 ') : '';
      const colony = data.colony ? `Pop ${data.colony.population} \u00B7 Morale ${Math.round((data.colony.morale||0)*100)}% \u00B7 Food ${(data.colony.foodMonthsReserve||0).toFixed(0)}mo` : '';
      const topQuotes = (data.reactions || []).map(r => `<div style="font-size:10px;color:var(--text-2);font-style:italic;margin-top:2px">"${r.quote.slice(0,80)}${r.quote.length>80?'...':''}" <span style="color:var(--text-3)">— ${r.name}</span></div>`).join('');

      return `<div class="rpt-col">
        <h4 class="${color}">${name}</h4>
        <div class="rpt-crisis">\u26A1 ${data.title} <span style="font-size:9px;color:var(--text-3)">${data.category || ''}</span></div>
        <div class="rpt-decision">${(data.decision || '').slice(0, 250)}</div>
        <div class="rpt-outcome" style="color:${outcomeColor}">${outcomeLabel}</div>
        ${deptList ? `<div style="font-size:10px;margin-top:3px;font-family:var(--mono)">${deptList}</div>` : ''}
        ${colony ? `<div style="font-size:10px;color:var(--text-3);margin-top:2px">${colony}</div>` : ''}
        ${topQuotes}
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
      html += `<div class="rpt-col"><h4 class="${color}">${name}</h4><div style="font-size:12px;line-height:1.8"><b>Population:</b> ${s.population || '?'}<br><b>Morale:</b> ${s.morale ? Math.round(s.morale*100)+'%' : '?'}<br><b>Tools Forged:</b> ${s.toolsForged || 0}<br><b>Citations:</b> ${s.citations || 0}</div></div>`;
    }
    html += `</div></div>`;
    html += `</div>`;
  }

  // Replay controls
  const turnNums = Object.keys(turns).sort((a, b) => Number(a) - Number(b));
  html += `<div style="margin-top:10px;padding:10px 14px;background:var(--bg-panel);border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <b style="font-size:11px;color:var(--text-2);font-family:var(--mono)">REPLAY</b>
    <input type="range" id="rpt-scrubber" min="0" max="${turnNums.length - 1}" value="${turnNums.length - 1}" style="flex:1;min-width:80px;accent-color:var(--amber)" oninput="scrubToTurn(this.value)">
    <span id="rpt-scrub-label" style="font-size:11px;color:var(--text-1);font-family:var(--mono);min-width:50px">Turn ${turnNums[turnNums.length - 1] || '?'}</span>
    <span style="color:var(--text-3);font-size:10px">Speed:</span>
    <input type="range" min="50" max="1000" value="500" step="50" style="width:80px;accent-color:var(--rust)" oninput="setReplaySpeed(this.value)">
    <span id="replay-speed-label" style="font-size:10px;color:var(--text-2);font-family:var(--mono);min-width:40px">Slow</span>
    <button class="act-btn" onclick="replayInSim()">Replay in Sim</button>
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
  let i = 0;
  function next() {
    if (i >= gameData.events.length) { $('m-status').textContent = '\u25CF Replay Complete'; $('m-status').style.color = 'var(--amber)'; $('save-game-btn').style.display = 'inline-block'; return; }
    handleSimEvent(gameData.events[i++]);
    $('m-status').textContent = `\u25CF Replaying ${i}/${gameData.events.length}...`;
    setTimeout(next, replaySpeed);
  }
  $('m-status').textContent = '\u25CF Replaying...'; $('m-status').style.color = 'var(--vis)';
  next();
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
      if (tag) tag.textContent = `Same colony, two different leaders. ${d.maxTurns} turns on Mars.`;
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
        if (tag) tag.textContent = `${d.leaders[0].name} vs ${d.leaders[1].name}. ${maxT} turns on Mars.`;
      }
    }
  });

  let liveEventCount = 0;
  es.addEventListener('sim', e => {
    try {
      const d = JSON.parse(e.data);
      liveEventCount++;
      // Skip if this event was already replayed from server buffer during cache restore
      const cachedLen = gameData._restoredCount || 0;
      if (liveEventCount <= cachedLen) return; // Already rendered from cache
      gameData.events.push(d);
      handleSimEvent(d);
      try { localStorage.setItem('mars-game-data', JSON.stringify(gameData)); } catch {}
    } catch (err) { log('no', 'Event parse error: ' + err); }
  });

  es.addEventListener('result', e => {
    try {
      const d = JSON.parse(e.data);
      gameData.results.push(d);
      log('ok', `\u2713 ${d.leader} done: pop ${d.summary?.population}, ${d.summary?.toolsForged} tools`);
    } catch (err) { log('no', 'Result parse error: ' + err); }
  });
  es.addEventListener('complete', () => {
    $('m-status').textContent = '\u25CF Complete'; $('m-status').style.color = 'var(--amber)'; $('m-status').style.animation = 'none';
    const pf = $('progress-fill'); if (pf) pf.style.width = '100%';
    try { localStorage.setItem('mars-game-data', JSON.stringify(gameData)); } catch {}
    gameData.completedAt = new Date().toISOString();
    $('save-game-btn').style.display = 'inline-block';
    const launchBtn = $('s-launch-btn'); if (launchBtn) launchBtn.disabled = false;
    const launchSt = $('s-launch-status'); if (launchSt) launchSt.textContent = 'Complete.';
    log('ok', '\u2713 All complete. Click Reports tab for full analysis. Click Save Game to download.');
    // Auto-generate report data
    if (typeof generateReport === 'function') try { generateReport(); switchTab('sim'); } catch {}
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
      if (dd.deaths) { state[s].deaths += dd.deaths; $(`s-${s}-deaths`).textContent = state[s].deaths; }
      log('info', `[${d.leader}] Turn ${dd.turn} \u2014 ${dd.year}: ${dd.title}${dd.emergent ? ' [EMERGENT]' : ''}`);
      break;
    }

    case 'promotion': {
      // Accumulate promotions into a single compact list
      let promoList = $(`promo-list-${s}`);
      if (!promoList) {
        addToBody(s, `<div class="card" style="padding:5px 10px"><div style="font-size:10px;color:var(--amber);font-weight:700;margin-bottom:3px">\u2726 DEPARTMENT HEADS PROMOTED</div><div id="promo-list-${s}" style="font-size:11px;line-height:1.6"></div></div>`);
        promoList = $(`promo-list-${s}`);
      }
      if (promoList) {
        const name = (dd.colonistId || '').replace('col-', '').replace(/-/g, ' ');
        const capName = name.replace(/\b\w/g, c => c.toUpperCase());
        const reasonShort = dd.reason ? dd.reason.slice(0, 60) : '';
        promoList.innerHTML += `<div class="hover-tip" style="display:flex;gap:4px;align-items:baseline;font-size:11px"><span style="color:var(--text-1);font-weight:600">${capName}</span><span style="color:var(--text-3)">\u2192</span><span style="color:var(--amber)">${dd.role}</span>${reasonShort ? `<span style="color:var(--text-3);font-size:9px;font-style:italic"> ${reasonShort}...</span>` : ''}<div class="htip"><b>${capName}</b><br>Promoted to: <b style="color:var(--amber)">${dd.role}</b><br>Department: ${dd.department || 'N/A'}<div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border)"><b>Commander reasoning:</b><br>${dd.reason || 'No reason provided'}</div></div></div>`;
      }
      break;
    }

    case 'dept_start': {
      const dIcon = { medical: '\uD83C\uDFE5', engineering: '\u2699\uFE0F', agriculture: '\uD83C\uDF3E', psychology: '\uD83E\uDDE0', governance: '\uD83C\uDFDB\uFE0F' }[dd.department] || '\uD83D\uDCCB';
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
      // Remove loading indicator
      const loadEl = $(`loading-${s}`);
      if (loadEl) loadEl.remove();
      const dept = (dd.department || '').toUpperCase();
      const icon = { medical: '\uD83C\uDFE5', engineering: '\u2699\uFE0F', agriculture: '\uD83C\uDF3E', psychology: '\uD83E\uDDE0', governance: '\uD83C\uDFDB\uFE0F' }[dd.department] || '\uD83D\uDCCB';
      const summary = dd.summary || '';
      const risks = (dd.risks || []).slice(0, 2).map(r => `<div class="risk"><span class="rd ${r.severity === 'critical' ? 'cr' : r.severity === 'high' ? 'hi' : 'lo'}"></span>${r.severity.toUpperCase()}: ${(r.description || '').slice(0, 120)}</div>`).join('');
      const recs = (dd.recommendedActions || []).slice(0, 2);
      const recsHtml = recs.length ? `<div style="margin-top:4px;color:var(--amber);font-size:11px">\u2192 ${recs.join('<br>\u2192 ')}</div>` : '';
      // Deduplicate tools by name (same tool can appear in multiple forge attempts)
      const seenTools = state[s]._shownTools || new Set();
      state[s]._shownTools = seenTools;
      const tools = (dd.forgedTools || []).filter(t => {
        if (!t.name || t.name === 'unnamed') return false;
        if (seenTools.has(t.name)) return false;
        seenTools.add(t.name);
        return true;
      });
      const showSummary = summary && summary.length > 10 && !summary.startsWith('{') && !summary.endsWith('complete.');

      if (showSummary || risks) {
        const severity = (dd.risks || []).some(r => r.severity === 'critical') ? 'critical' : (dd.risks || []).some(r => r.severity === 'high') ? 'high' : 'normal';
        const citeLinks = (dd.citationList || []).map(c =>
          `<a href="${c.url}" target="_blank" rel="noopener" style="color:var(--amber);font-size:9px;text-decoration:none;margin-right:6px" title="${c.text}">${c.doi ? 'DOI: ' + c.doi : c.text.slice(0, 30)}</a>`
        ).join('');
        const citesHtml = citeLinks ? `<div style="margin-top:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${citeLinks}</div>` : '';
        const deptRisksFull = (dd.risks || []).map(r => `<div style="font-size:10px;margin:2px 0"><span style="color:${r.severity === 'critical' ? 'var(--rust)' : r.severity === 'high' ? 'var(--amber)' : 'var(--green)'};font-weight:700">${r.severity.toUpperCase()}</span>: ${r.description}</div>`).join('');
        const deptRecsFull = (dd.recommendedActions || []).map(r => `<div style="font-size:10px;color:var(--amber);margin:1px 0">\u2192 ${r}</div>`).join('');
        const deptPop = `<div class="htip" style="width:340px"><b>${icon} ${dept} Department</b><div class="ht-stats">Citations: ${dd.citations || 0} | Tools forged: ${tools.length}</div>${summary ? `<div style="margin:4px 0;color:var(--text-1);font-size:11px">${summary}</div>` : ''}${deptRisksFull}${deptRecsFull}</div>`;
        addToBody(s, `<div class="card ${severity} hover-tip"><div class="card-h"><span class="card-title">${icon} ${dept}</span><span class="card-badge">${dd.citations || 0} cites</span></div>${showSummary ? `<div class="card-text">${summary}</div>` : ''}${risks}${recsHtml}${citesHtml}${deptPop}</div>`);
      }
      for (const t of tools) {
        const desc = t.description || t.name.replace(/_v\d+$/, '').replace(/_/g, ' ');
        const inFields = (t.inputFields || []).join(', ');
        const outFields = (t.outputFields || []).join(', ');
        const whyDept = t.department ? (t.department.charAt(0).toUpperCase() + t.department.slice(1)) : dept.toLowerCase();
        const whyCrisis = t.crisis || '';

        // Schema line showing input/output types
        let schemaHtml = '';
        if (inFields || outFields) {
          schemaHtml = `<div style="margin-top:2px;font-size:9px;font-family:var(--mono);color:var(--text-2)">`;
          if (inFields) schemaHtml += `<span style="color:var(--text-3)">INPUTS:</span> ${inFields} `;
          if (outFields) schemaHtml += `<span style="color:var(--text-3)">\u2192 OUTPUTS:</span> ${outFields}`;
          schemaHtml += `</div>`;
        }

        // Result preview
        let resultHtml = '';
        if (t.output) {
          resultHtml = `<div style="margin-top:3px;font-size:10px;color:var(--text-2);background:var(--bg-deep);padding:3px 6px;border-radius:3px;font-family:var(--mono);max-height:36px;overflow-y:auto;overflow-x:hidden;word-break:break-all;white-space:pre-wrap;line-height:1.3"><b style="color:var(--text-3)">RESULT:</b> ${String(t.output).slice(0, 250)}</div>`;
        }

        // Why context
        const whyHtml = `<div style="font-size:9px;color:var(--text-3);margin-top:2px">${whyDept} agent created this tool to analyze "${whyCrisis}"</div>`;

        // CSS popover tooltip
        const toolPop = `<div class="htip" style="width:360px"><b>\uD83D\uDD27 ${t.name}</b><div style="margin:4px 0;color:var(--text-1)">${desc}</div><div class="ht-stats">Mode: ${t.mode || 'sandbox'} | Confidence: ${(t.confidence || .85).toFixed(2)}</div><div class="ht-stats">Created by: ${whyDept} department</div><div class="ht-stats">Crisis: ${whyCrisis}</div>${inFields ? `<div class="ht-hexaco" style="margin-top:4px"><span style="color:var(--text-3)">INPUTS:</span> ${inFields}</div>` : ''}${outFields ? `<div class="ht-hexaco"><span style="color:var(--text-3)">OUTPUTS:</span> ${outFields}</div>` : ''}${t.output ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;font-family:var(--mono);color:var(--text-2);max-height:80px;overflow-y:auto;word-break:break-all"><b style="color:var(--text-3)">FULL RESULT:</b><br>${String(t.output).slice(0, 400)}</div>` : ''}</div>`;

        addToBody(s, `<div class="forge ok hover-tip"><span style="font-size:16px">\uD83D\uDD27</span><div style="flex:1"><span class="forge-label">Agent-Forged Tool \u2014 Judge Approved</span><div class="fd">${desc}</div><div class="fn">${t.name} \u00B7 ${t.mode || 'sandbox'} \u00B7 invented at runtime</div>${schemaHtml}${whyHtml}${resultHtml}</div><span class="jb p">\u2713 ${(t.confidence || .85).toFixed(2)}</span>${toolPop}</div>`);
      }
      state[s].tools += tools.length; $(`s-${s}-tools`).textContent = state[s].tools;
      state[s].cites += (dd.citations || 0); const citesEl = $(`s-${s}-cites`); if (citesEl) citesEl.textContent = state[s].cites;
      log('ok', `[${d.leader}] ${icon} ${dept}: ${dd.citations || 0} cites, ${tools.length} tools`);
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
      log('info', `[${d.leader}] ${(dd.decision || '').slice(0, 60)}`);
      break;
    }

    case 'outcome': {
      const dec = (state[s].pendingDecision || '').slice(0, 500);
      const oc = dd.outcome || '';
      const cls = oc === 'risky_success' ? 'rs' : oc === 'conservative_success' ? 'cs' : 'rf';
      const badge = oc === 'risky_success' ? 'RISKY WIN' : oc === 'risky_failure' ? 'RISKY LOSS' : oc === 'conservative_success' ? 'SAFE WIN' : 'SAFE LOSS';
      const icon = oc.includes('success') ? '\u2713' : '\u2717';
      const outcomeColor = oc.includes('success') ? 'var(--green)' : 'var(--rust)';
      const decPop = `<div class="htip" style="width:380px"><b>\u26A1 Commander Decision</b><div class="ht-stats">Outcome: <span style="color:${outcomeColor};font-weight:700">${oc.replace(/_/g,' ').toUpperCase()}</span></div><div style="margin-top:4px;color:var(--text-1);line-height:1.5">${dec}</div></div>`;
      addToBody(s, `<div class="dec ${s} hover-tip"><div class="dl ${s}">\u26A1 Commander Decision</div><div class="ddt">${dec}</div><div class="out"><span class="ob ${cls}">${icon} ${badge}</span></div><div id="drift-slot-${s}-${dd.turn}" class="drift-inline" style="display:none"></div>${decPop}</div>`);
      addTimeline(s, dd.year, dec.slice(0, 40), cls, icon);
      state[s].outcome = oc; state[s].decision = dec;
      // Divergence check
      const other = s === 'v' ? 'e' : 'v';
      if (state[other].crisis && state[s].crisis && state[other].outcome && state[s].crisis.turn === state[other].crisis.turn) {
        const vC = state.v.crisis, eC = state.e.crisis;
        if (vC.title !== eC.title || state.v.outcome !== state.e.outcome) {
          const rail = $('diverge-rail');
          rail.innerHTML = `<div class="diverge-title">TURN ${vC.turn} DIVERGENCE</div><div class="diverge-row"><div class="diverge-side v"><b style="color:var(--vis)">${vC.title}</b> <span>${vC.category || ''}</span><br><span>${(state.v.decision || '').slice(0, 80)}</span><br><b>${state.v.outcome}</b></div><div class="diverge-side e"><b style="color:var(--eng)">${eC.title}</b> <span>${eC.category || ''}</span><br><span>${(state.e.decision || '').slice(0, 80)}</span><br><b>${state.e.outcome}</b></div></div>`;
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
        const quotesHtml = reactions.slice(0, 6).map(r => {
          const moodColor = moodColors[r.mood] || 'var(--text-2)';
          const shortQuote = r.quote.length > 100 ? r.quote.slice(0, 100) + '...' : r.quote;
          const h = r.hexaco || {};
          return `<div class="hover-tip" style="display:flex;gap:6px;align-items:baseline;padding:3px 0;border-bottom:1px solid rgba(48,42,34,.5)"><span style="font-weight:600;color:var(--${color});font-size:12px;min-width:90px;flex-shrink:0">${r.name}</span><span style="font-style:italic;color:var(--text-2);font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${shortQuote}"</span><span style="font-size:10px;color:${moodColor};font-weight:700;flex-shrink:0">${r.mood.toUpperCase()}</span><div class="htip"><b>${r.name}</b>, age ${r.age}${r.marsborn ? ' (Mars-born)' : ''}<br>${r.role} \u2014 ${r.specialization || r.department}<div class="ht-hexaco">O=${h.O} C=${h.C} E=${h.E} A=${h.A} Em=${h.Em} HH=${h.HH}</div><div class="ht-stats">Psych: ${r.psychScore} | Bone: ${r.boneDensity}% | Rad: ${r.radiation} mSv</div><div class="ht-mood" style="color:${moodColor}">${r.mood.toUpperCase()} (intensity: ${(r.intensity||0).toFixed(2)})</div><div class="ht-quote">"${r.quote}"</div></div></div>`;
        }).join('');
        addToBody(s, `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:4px;padding:5px 10px;border-left:3px solid var(--${color})"><div style="font-size:10px;color:var(--${color});font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">\uD83D\uDDE3 ${dd.totalReactions} Colonist Reactions</div>${quotesHtml}</div>`);
        log('ok', `[${d.leader}] ${dd.totalReactions} colonist reactions (showing top ${reactions.length})`);
      }
      break;
    }

    case 'turn_done':
      if (dd.colony) updateGauges(s, dd.colony);
      addToBody(s, `<div class="turn-sep">Turn ${dd.turn} complete</div>`);
      break;
  }
}

// Dismiss intro if previously dismissed
if (localStorage.getItem('mars-intro-dismissed') === '1') {
  const intro = $('intro-bar');
  if (intro) intro.style.display = 'none';
}

// Restore cached game data on page load (survives refresh)
function restoreFromCache() {
  try {
    const cached = localStorage.getItem('mars-game-data');
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
