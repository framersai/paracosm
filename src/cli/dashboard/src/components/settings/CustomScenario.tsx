import { useState, useCallback } from 'react';

interface CompileProgress {
  hook: string;
  status: string;
}

export function CustomScenario() {
  const [jsonText, setJsonText] = useState('');
  const [seedText, setSeedText] = useState('');
  const [seedUrl, setSeedUrl] = useState('');
  const [webSearch, setWebSearch] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [progress, setProgress] = useState<CompileProgress[]>([]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const compile = useCallback(async () => {
    if (!jsonText.trim()) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setResult({ success: false, message: 'Invalid JSON. Check syntax and try again.' });
      return;
    }

    setCompiling(true);
    setProgress([]);
    setResult(null);

    try {
      const body: Record<string, unknown> = { scenario: parsed, webSearch };
      if (seedUrl.trim()) body.seedUrl = seedUrl.trim();
      else if (seedText.trim()) body.seedText = seedText.trim();

      const res = await fetch('/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          if (line.startsWith('event: progress')) continue;
          if (line.startsWith('event: complete')) continue;
          if (line.startsWith('event: error')) continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.hook) {
                setProgress(prev => {
                  const existing = prev.findIndex(p => p.hook === data.hook);
                  if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = data;
                    return updated;
                  }
                  return [...prev, data];
                });
              }
              if (data.id) {
                setResult({
                  success: true,
                  message: `Compiled: ${data.id} (${data.departments} departments, ${data.hooks} hooks). Scenario is now active. Go to Settings to configure leaders and launch.`,
                });
              }
              if (data.error) {
                setResult({ success: false, message: data.error });
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setResult({ success: false, message: String(err) });
    }
    setCompiling(false);
  }, [jsonText, seedText, seedUrl, webSearch]);

  const loadExample = () => {
    setJsonText(JSON.stringify({
      id: 'my-scenario',
      version: '1.0.0',
      engineArchetype: 'closed_turn_based_settlement',
      labels: { name: 'My Scenario', shortName: 'custom', populationNoun: 'agents', settlementNoun: 'settlement', currency: 'credits' },
      theme: { primaryColor: '#6366f1', accentColor: '#818cf8', cssVariables: {} },
      setup: { defaultTurns: 8, defaultSeed: 100, defaultStartYear: 2040, defaultPopulation: 50, configurableSections: ['leaders', 'departments', 'models'] },
      departments: [
        { id: 'operations', label: 'Operations', role: 'Operations Lead', icon: '\u2699\uFE0F', defaultModel: 'gpt-5.4-mini', instructions: 'You analyze operations.' },
        { id: 'research', label: 'Research', role: 'Head of Research', icon: '\uD83D\uDD2C', defaultModel: 'gpt-5.4-mini', instructions: 'You analyze research.' },
      ],
      metrics: [{ id: 'population', label: 'Population', source: 'metrics.population', format: 'number' }],
      events: [{ id: 'crisis', label: 'Crisis', icon: '\u26A0\uFE0F', color: '#ef4444' }],
      effects: { environmental: { morale: 0.08 }, resource: { morale: 0.05 } },
      ui: { headerMetrics: [{ id: 'population', format: 'number' }], tooltipFields: [], reportSections: ['crisis'], departmentIcons: {}, setupSections: ['leaders'] },
      policies: { toolForging: { enabled: true }, liveSearch: { enabled: false, mode: 'off' }, bulletin: { enabled: true }, characterChat: { enabled: true }, sandbox: { timeoutMs: 10000, memoryMB: 128 } },
      presets: [],
    }, null, 2));
  };

  const statusIcon = (status: string) => {
    if (status === 'done') return '\u2705';
    if (status === 'generating') return '\u23F3';
    if (status === 'cached') return '\uD83D\uDCBE';
    if (status === 'fallback') return '\u26A0\uFE0F';
    return '\u2022';
  };

  return (
    <div className="rounded-lg p-4 mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Custom Scenario</h3>
        <button
          onClick={loadExample}
          className="text-[10px] px-2 py-1 rounded cursor-pointer"
          style={{ background: 'var(--bg-elevated)', color: 'var(--amber)', border: '1px solid var(--border)' }}
        >
          Load Example
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
        Paste a scenario JSON. The compiler generates all runtime hooks via LLM (~$0.10, cached after first compile).
      </p>

      {/* JSON input */}
      <textarea
        value={jsonText}
        onChange={e => setJsonText(e.target.value)}
        placeholder='{"id": "my-scenario", "labels": { "name": "My World" }, "departments": [...], ...}'
        rows={8}
        className="w-full px-3 py-2 rounded text-xs font-mono mb-3 resize-y"
        style={{ background: 'var(--bg-deep)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
      />

      {/* Seed enrichment */}
      <details className="mb-3">
        <summary className="text-xs font-semibold cursor-pointer select-none" style={{ color: 'var(--text-2)' }}>
          Seed Enrichment (optional)
        </summary>
        <div className="mt-2 space-y-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-3)' }}>
              Seed URL (fetched via Firecrawl)
            </label>
            <input
              value={seedUrl}
              onChange={e => setSeedUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full px-2 py-1.5 rounded text-xs"
              style={{ background: 'var(--bg-deep)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: 'var(--text-3)' }}>
              Or paste seed text
            </label>
            <textarea
              value={seedText}
              onChange={e => setSeedText(e.target.value)}
              placeholder="Paste a document, report, or article to enrich the scenario knowledge bundle..."
              rows={3}
              className="w-full px-2 py-1.5 rounded text-xs resize-y"
              style={{ background: 'var(--bg-deep)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} id="webSearch" />
            <label htmlFor="webSearch" className="text-xs" style={{ color: 'var(--text-2)' }}>
              Web search enrichment (requires Serper/Tavily/Firecrawl API keys)
            </label>
          </div>
        </div>
      </details>

      {/* Progress */}
      {progress.length > 0 && (
        <div className="mb-3 rounded p-2 space-y-1" style={{ background: 'var(--bg-elevated)' }}>
          {progress.map(p => (
            <div key={p.hook} className="text-[11px] font-mono flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
              <span>{statusIcon(p.status)}</span>
              <span>{p.hook}</span>
              <span style={{ color: 'var(--text-3)' }}>{p.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className="mb-3 rounded p-3 text-xs"
          style={{
            background: result.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: result.success ? 'var(--color-success, #22c55e)' : 'var(--color-error, #ef4444)',
            border: `1px solid ${result.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {result.message}
        </div>
      )}

      {/* Compile button */}
      <button
        onClick={compile}
        disabled={compiling || !jsonText.trim()}
        className="px-5 py-2 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50 transition-all"
        style={{ background: 'var(--amber)', color: 'var(--bg-deep)' }}
      >
        {compiling ? 'Compiling...' : 'Compile Scenario'}
      </button>
    </div>
  );
}
