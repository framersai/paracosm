import type { ToolRegistry } from '../../hooks/useToolRegistry';

interface ToolboxSectionProps {
  registry: ToolRegistry;
  title?: string;
  collapsible?: boolean;
}

/**
 * Numbered list of every tool forged during the simulation. Each entry
 * shows when/where it was first forged, every department that used it,
 * how many times it was reused, and the actual input/output JSON Schema
 * pulled from EmergentToolRegistry on first forge.
 *
 * Rendered at the bottom of SimView (collapsible) and ReportView
 * (always-on). Inline tool cards in EventCard reference these by name.
 */
export function ToolboxSection({ registry, title = 'Forged Toolbox', collapsible = false }: ToolboxSectionProps) {
  if (registry.list.length === 0) return null;

  const inner = (
    <ol style={{
      margin: 0, padding: 0, listStyle: 'none',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {registry.list.map(entry => {
        const depts = [...entry.departments].join(', ');
        const sidesLabel = entry.sides.size === 2 ? 'A · B' : entry.sides.has('a') ? 'A' : 'B';
        const inputCount = countSchemaFields(entry.inputSchema, entry.inputFields);
        const outputCount = countSchemaFields(entry.outputSchema, entry.outputFields);
        return (
          <li
            key={entry.n}
            id={`tool-${entry.n}`}
            style={{
              display: 'grid', gridTemplateColumns: '32px 1fr', gap: 8,
              fontSize: 12, lineHeight: 1.55,
              padding: '8px 10px', borderRadius: 4,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${entry.approved ? 'var(--green)' : 'var(--rust)'}`,
            }}
          >
            <span style={{
              fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--amber)',
              textAlign: 'right',
            }}>
              [{entry.n}]
            </span>
            <span>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--mono)' }}>
                  {entry.name}
                </span>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--mono)', padding: '1px 5px', borderRadius: 2,
                  color: entry.approved ? 'var(--green)' : 'var(--rust)',
                  background: entry.approved ? 'rgba(106,173,72,.10)' : 'rgba(224,101,48,.08)',
                  border: `1px solid ${entry.approved ? 'rgba(106,173,72,.3)' : 'rgba(224,101,48,.2)'}`,
                  fontWeight: 800,
                }}>
                  {entry.approved ? 'PASS' : 'FAIL'} {entry.confidence.toFixed(2)}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
                  {entry.mode}
                </span>
              </div>
              {entry.description && entry.description !== entry.name && (
                <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>
                  {entry.description}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <span>first forged T{entry.firstForgedTurn} · {entry.firstForgedDepartment}</span>
                {entry.reuseCount > 0 && <span style={{ color: 'var(--green)' }}>reused {entry.reuseCount}×</span>}
                {depts && <span>used by {depts}</span>}
                <span>leader {sidesLabel}</span>
                {inputCount > 0 && <span style={{ color: 'var(--teal)' }}>{inputCount} input field{inputCount === 1 ? '' : 's'}</span>}
                {outputCount > 0 && <span style={{ color: 'var(--green)' }}>{outputCount} output field{outputCount === 1 ? '' : 's'}</span>}
              </div>
              {Boolean(entry.inputSchema || entry.outputSchema) && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--amber)', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.05em' }}>
                    SCHEMA
                  </summary>
                  <pre style={{
                    margin: '4px 0 0', padding: 8, fontSize: 10, lineHeight: 1.45,
                    fontFamily: 'var(--mono)', color: 'var(--text-2)',
                    background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 4,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 240, overflow: 'auto',
                  }}>
                    {JSON.stringify({ input: entry.inputSchema ?? null, output: entry.outputSchema ?? null }, null, 2)}
                  </pre>
                </details>
              )}
              {entry.sampleOutput && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--green)', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.05em' }}>
                    LATEST OUTPUT
                  </summary>
                  <pre style={{
                    margin: '4px 0 0', padding: 8, fontSize: 10, lineHeight: 1.45,
                    fontFamily: 'var(--mono)', color: 'var(--text-2)',
                    background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 4,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto',
                  }}>
                    {entry.sampleOutput}
                  </pre>
                </details>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );

  if (collapsible) {
    return (
      <details style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)' }}>
        <summary style={{
          fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800,
          color: 'var(--amber)', letterSpacing: '0.06em',
          cursor: 'pointer', textTransform: 'uppercase', marginBottom: 8,
        }}>
          {title} · {registry.list.length}
        </summary>
        {inner}
      </details>
    );
  }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)' }}>
      <h3 style={{
        fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800,
        color: 'var(--amber)', letterSpacing: '0.06em',
        margin: '0 0 8px', textTransform: 'uppercase',
      }}>
        {title} · {registry.list.length}
      </h3>
      {inner}
    </div>
  );
}

function countSchemaFields(schema: unknown, fallback: string[]): number {
  if (schema && typeof schema === 'object' && (schema as any).properties) {
    return Object.keys((schema as any).properties).length;
  }
  return fallback.length;
}
