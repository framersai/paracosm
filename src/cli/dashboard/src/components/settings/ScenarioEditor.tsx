import { useState, useCallback, useEffect, useRef } from 'react';
import { emitScenarioUpdated, subscribeScenarioUpdates } from '../../scenario-sync';
import { buildScenarioCompileRequest } from './scenarioCompileRequest';

interface AdminConfig {
  adminWrite: boolean;
  memoryScenarios: string[];
}

interface CompileProgress {
  hook: string;
  status: string;
}

const EXAMPLE_SCENARIO = {
  id: 'my-scenario',
  version: '1.0.0',
  engineArchetype: 'closed_turn_based_settlement',
  labels: { name: 'My Scenario', shortName: 'custom', populationNoun: 'agents', settlementNoun: 'settlement', currency: 'credits' },
  theme: { primaryColor: '#6366f1', accentColor: '#818cf8', cssVariables: {} },
  setup: { defaultTurns: 8, defaultSeed: 100, defaultStartYear: 2040, defaultPopulation: 50, configurableSections: ['leaders', 'departments', 'models'] },
  departments: [
    { id: 'operations', label: 'Operations', role: 'Operations Lead', icon: '', defaultModel: 'gpt-5.4-mini', instructions: 'You analyze operations.' },
    { id: 'research', label: 'Research', role: 'Head of Research', icon: '', defaultModel: 'gpt-5.4-mini', instructions: 'You analyze research.' },
  ],
  metrics: [{ id: 'population', label: 'Population', source: 'metrics.population', format: 'number' }],
  effects: { environmental: { morale: 0.08 }, resource: { morale: 0.05 } },
  ui: { headerMetrics: [{ id: 'population', format: 'number' }], tooltipFields: [], reportSections: ['crisis'], departmentIcons: {}, setupSections: ['leaders'] },
  policies: { toolForging: { enabled: true }, liveSearch: { enabled: false, mode: 'off' }, bulletin: { enabled: true }, characterChat: { enabled: true }, sandbox: { timeoutMs: 10000, memoryMB: 128 } },
  presets: [],
};

export function ScenarioEditor() {
  const [adminConfig, setAdminConfig] = useState<AdminConfig>({ adminWrite: false, memoryScenarios: [] });
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState('');
  const [seedText, setSeedText] = useState('');
  const [seedUrl, setSeedUrl] = useState('');
  const [webSearch, setWebSearch] = useState(true);
  const [maxSearches, setMaxSearches] = useState('5');
  const [compileProvider, setCompileProvider] = useState('');
  const [compileModel, setCompileModel] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [storing, setStoring] = useState(false);
  const [progress, setProgress] = useState<CompileProgress[]>([]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/admin-config').then(r => r.json()).then(setAdminConfig).catch(() => {});
  }, []);

  // Auto-load the active scenario JSON into the editor on mount and when scenario changes
  const loadActiveIntoEditor = useCallback(() => {
    fetch('/scenario')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.id) {
          setJsonText(JSON.stringify(data, null, 2));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadActiveIntoEditor();
    return subscribeScenarioUpdates(window, loadActiveIntoEditor);
  }, [loadActiveIntoEditor]);

  // Validate JSON on change
  useEffect(() => {
    if (!jsonText.trim()) { setParseError(''); return; }
    try { JSON.parse(jsonText); setParseError(''); }
    catch (e) { setParseError(String(e).replace('SyntaxError: ', '')); }
  }, [jsonText]);

  const loadExample = () => setJsonText(JSON.stringify(EXAMPLE_SCENARIO, null, 2));

  const loadActiveScenario = useCallback(async () => {
    try {
      const res = await fetch('/scenario');
      const data = await res.json();
      setJsonText(JSON.stringify(data, null, 2));
      setResult({ success: true, message: `Loaded active scenario: ${data.labels?.name || data.id}` });
    } catch (err) { setResult({ success: false, message: `Failed to load: ${err}` }); }
  }, []);

  const importFile = () => fileInputRef.current?.click();

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setJsonText(text);
      try { JSON.parse(text); setResult({ success: true, message: `Imported ${file.name} (${(file.size / 1024).toFixed(1)}KB)` }); }
      catch { setResult({ success: false, message: `Imported ${file.name} but JSON is invalid` }); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportFile = () => {
    if (!jsonText.trim()) return;
    try {
      const parsed = JSON.parse(jsonText);
      const name = parsed.id || 'scenario';
      const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${name}.json`; a.click();
      URL.revokeObjectURL(url);
      setResult({ success: true, message: `Exported ${name}.json` });
    } catch { setResult({ success: false, message: 'Fix JSON errors before exporting' }); }
  };

  const storeInMemory = useCallback(async () => {
    if (!jsonText.trim() || parseError) return;
    setStoring(true);
    try {
      const scenario = JSON.parse(jsonText);
      const res = await fetch('/scenario/store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, saveToDisk: false }),
      });
      const data = await res.json();
      if (data.stored) {
        emitScenarioUpdated(window);
        setResult({
          success: true,
          message: data.switchable
            ? `Stored "${data.id}" in memory and added it to the scenario selector.`
            : `Stored "${data.id}" as draft JSON in memory. Compile it to make it runnable and switchable.`,
        });
        setAdminConfig(prev => ({ ...prev, memoryScenarios: [...new Set([...prev.memoryScenarios, data.id])] }));
      } else {
        setResult({ success: false, message: data.error || 'Store failed' });
      }
    } catch (err) { setResult({ success: false, message: String(err) }); }
    setStoring(false);
  }, [jsonText, parseError]);

  const saveToDisk = useCallback(async () => {
    if (!jsonText.trim() || parseError || !adminConfig.adminWrite) return;
    try {
      const scenario = JSON.parse(jsonText);
      const res = await fetch('/scenario/store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, saveToDisk: true }),
      });
      const data = await res.json();
      if (data.savedToDisk) {
        emitScenarioUpdated(window);
        setResult({
          success: true,
          message: data.switchable
            ? `Saved "${data.id}" to disk at scenarios/${data.id}.json and loaded it into the live scenario catalog.`
            : `Saved "${data.id}" draft JSON to disk at scenarios/${data.id}.json. Compile it to make it runnable after restart.`,
        });
      } else {
        setResult({ success: false, message: data.error || 'Disk write not enabled (ADMIN_WRITE=false)' });
      }
    } catch (err) { setResult({ success: false, message: String(err) }); }
  }, [jsonText, parseError, adminConfig.adminWrite]);

  const compile = useCallback(async () => {
    if (!jsonText.trim() || parseError) return;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(jsonText); }
    catch { setResult({ success: false, message: 'Fix JSON errors before compiling' }); return; }

    setCompiling(true);
    setProgress([]);
    setResult(null);

    try {
      const body = buildScenarioCompileRequest({
        scenario: parsed,
        seedText,
        seedUrl,
        webSearch,
        maxSearches,
        provider: compileProvider,
        model: compileModel,
      });

      const res = await fetch('/compile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.hook) {
                setProgress(prev => {
                  const idx = prev.findIndex(p => p.hook === data.hook);
                  if (idx >= 0) { const u = [...prev]; u[idx] = data; return u; }
                  return [...prev, data];
                });
              }
              if (data.id) {
                emitScenarioUpdated(window);
                setResult({ success: true, message: `Compiled: ${data.id} (${data.departments} departments, ${data.hooks} hooks). Go to Settings to configure leaders and launch.` });
              }
              if (data.error) setResult({ success: false, message: data.error });
            } catch {}
          }
        }
      }
    } catch (err) { setResult({ success: false, message: String(err) }); }
    setCompiling(false);
  }, [jsonText, parseError, seedText, seedUrl, webSearch, maxSearches, compileProvider, compileModel]);

  const lineCount = jsonText.split('\n').length;
  const byteSize = new Blob([jsonText]).size;

  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
      marginBottom: '16px', boxShadow: 'var(--card-shadow)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px',
      }}>
        <div>
          <h3 style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            Scenario Editor
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '4px 0 0' }}>
            Write or import a scenario JSON. Store in memory, compile, or export.
            {!adminConfig.adminWrite && ' Disk saves are disabled on this instance.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={loadActiveScenario} style={{ ...btnStyle, color: 'var(--amber)', borderColor: 'var(--amber-dim, var(--border))' }} aria-label="Load active scenario JSON">Load Active</button>
          <button onClick={loadExample} style={btnStyle} aria-label="Load example scenario">Template</button>
          <button onClick={importFile} style={btnStyle} aria-label="Import JSON file">Import</button>
          <button onClick={exportFile} style={btnStyle} disabled={!jsonText.trim() || !!parseError} aria-label="Export as JSON file">Export</button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileImport} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Editor */}
      <div style={{ position: 'relative' }}>
        <textarea
          ref={editorRef}
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
          placeholder='{\n  "id": "my-scenario",\n  "labels": { "name": "My World" },\n  "departments": [...]\n}'
          spellCheck={false}
          aria-label="Scenario JSON editor"
          style={{
            width: '100%', minHeight: '240px', maxHeight: '500px', resize: 'vertical',
            padding: '14px 16px', margin: 0, border: 'none', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-deep)', color: 'var(--text-1)',
            fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: 1.6,
            outline: 'none',
          }}
        />
        {/* Status bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', padding: '6px 16px',
          background: 'var(--bg-elevated)', fontSize: '10px', fontFamily: 'var(--mono)',
          color: parseError ? 'var(--rust)' : 'var(--text-3)',
        }}>
          <span>{parseError || (jsonText.trim() ? 'Valid JSON' : 'Empty')}</span>
          <span>{lineCount} lines, {(byteSize / 1024).toFixed(1)}KB</span>
        </div>
      </div>

      {/* Seed enrichment */}
      <details style={{ borderBottom: '1px solid var(--border)' }}>
        <summary style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
          Seed Enrichment (optional)
        </summary>
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <label style={labelStyle}>Seed Text</label>
            <textarea
              value={seedText}
              onChange={e => setSeedText(e.target.value)}
              placeholder="Paste notes, a brief, or source text to turn into research facts and category mapping."
              style={{ ...inputStyle, minHeight: '96px', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Seed URL (fetched via Firecrawl)</label>
            <input value={seedUrl} onChange={e => setSeedUrl(e.target.value)} placeholder="https://example.com/article" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Max Web Searches</label>
            <input
              value={maxSearches}
              onChange={e => setMaxSearches(e.target.value)}
              inputMode="numeric"
              placeholder="5"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Compile Provider Override</label>
            <input
              value={compileProvider}
              onChange={e => setCompileProvider(e.target.value)}
              placeholder="anthropic or openai (optional)"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Compile Model Override</label>
            <input
              value={compileModel}
              onChange={e => setCompileModel(e.target.value)}
              placeholder="gpt-5.4-mini, claude-sonnet-4-6, etc. (optional)"
              style={inputStyle}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-2)' }}>
            <input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} />
            Web search enrichment (requires Serper/Tavily/Firecrawl API keys)
          </label>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
            If both seed text and a seed URL are provided, the URL takes precedence and the compiler ingests the fetched page.
          </p>
        </div>
      </details>

      {/* Compile progress */}
      {progress.length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          {progress.map(p => (
            <div key={p.hook} style={{ fontSize: '11px', fontFamily: 'var(--mono)', display: 'flex', gap: '8px', padding: '2px 0', color: 'var(--text-2)' }}>
              <span>{p.status === 'done' ? '\u2714' : p.status === 'generating' ? '\u23F3' : p.status === 'cached' ? '\u2714' : '\u2022'}</span>
              <span>{p.hook}</span>
              <span style={{ color: 'var(--text-3)' }}>{p.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Result message */}
      {result && (
        <div style={{
          padding: '10px 16px', fontSize: '12px', borderBottom: '1px solid var(--border)',
          color: result.success ? 'var(--green)' : 'var(--rust)',
          background: result.success ? 'rgba(106,173,72,.06)' : 'rgba(224,101,48,.06)',
        }}>
          {result.message}
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={storeInMemory}
          disabled={!jsonText.trim() || !!parseError || storing}
          style={{ ...actionBtnStyle, background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
          aria-label="Store scenario in memory"
        >
          {storing ? 'Storing...' : 'Store in Memory'}
        </button>
        <button
          onClick={compile}
          disabled={!jsonText.trim() || !!parseError || compiling}
          style={{ ...actionBtnStyle, background: 'linear-gradient(135deg, var(--rust), #c44a1e)', color: '#fff', border: 'none' }}
          aria-label="Compile scenario"
        >
          {compiling ? 'Compiling...' : 'Compile Scenario'}
        </button>
        {adminConfig.adminWrite && (
          <button
            onClick={saveToDisk}
            disabled={!jsonText.trim() || !!parseError}
            style={{ ...actionBtnStyle, background: 'var(--bg-card)', color: 'var(--amber)', border: '1px solid var(--amber-dim, var(--border))' }}
            aria-label="Save scenario to disk"
          >
            Save to Disk
          </button>
        )}
        <span style={{ flex: 1 }} />
        {adminConfig.memoryScenarios.length > 0 && (
          <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            {adminConfig.memoryScenarios.length} in memory
          </span>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'var(--bg-card)', color: 'var(--text-2)', border: '1px solid var(--border)',
  padding: '4px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
  fontWeight: 600, fontFamily: 'var(--mono)', transition: 'all .2s',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'all .2s',
  opacity: 1,
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '10px', color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: '4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-card)', color: 'var(--text-1)',
  border: '1px solid var(--border)', padding: '6px 10px', borderRadius: '4px',
  fontFamily: 'var(--sans)', fontSize: '12px',
};
