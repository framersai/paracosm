import type { ToolRegistry, ToolEntry } from '../../hooks/useToolRegistry';
import { useDashboardNavigation } from '../../App';
import { Tooltip } from './Tooltip';

interface ToolboxSectionProps {
  registry: ToolRegistry;
  title?: string;
  collapsible?: boolean;
  /** When collapsible, start expanded if true. */
  defaultOpen?: boolean;
  /** Optional toggle callback — used by ReportView to persist state. */
  onToggle?: (open: boolean) => void;
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
export function ToolboxSection({ registry, title = 'Forged Toolbox', collapsible = false, defaultOpen = false, onToggle }: ToolboxSectionProps) {
  const navigateTab = useDashboardNavigation();
  if (registry.list.length === 0) return null;

  const jumpToLog = (toolName: string) => {
    // Drop a search-hash the Log tab can read, then navigate. The Log
    // tab filters to forge_attempt / specialist_done entries matching the
    // tool name so users land on the exact event that forged (or
    // reused) this tool instead of scrolling through the whole feed.
    try {
      window.location.hash = `log=${encodeURIComponent(toolName)}`;
    } catch {
      /* silent */
    }
    // Log is a sub-tab of Settings after the merge.
    navigateTab('settings');
  };

  const inner = (
    <ol style={{
      margin: 0, padding: 0, listStyle: 'none',
      // Two-column grid matches the side-by-side leader columns above.
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
      gap: 8,
    }}>
      {registry.list.map(entry => {
        const depts = [...entry.departments].join(', ');
        const sidesLabel = [...entry.actorNames].join(' · ');
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
                  {entry.approved ? `PASS ${entry.confidence.toFixed(2)}` : 'FAIL'}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
                  {entry.mode}
                </span>
                <Tooltip
                  content={
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', marginBottom: 6 }}>
                        Open in sim log
                      </div>
                      <div>
                        Jumps to the Log tab and filters the event stream
                        to <code>{entry.name}</code> — showing every
                        forge_attempt, specialist_done, and reuse event this
                        tool fired in. Useful for tracing the exact
                        moment a tool was created and every downstream
                        department that reused it.
                      </div>
                    </div>
                  }
                >
                  <button
                    type="button"
                    onClick={() => jumpToLog(entry.name)}
                    aria-label={`Open ${entry.name} in simulation log`}
                    style={{
                      marginLeft: 'auto', display: 'inline-flex',
                      alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 3,
                      background: 'var(--bg-panel)',
                      color: 'var(--amber)',
                      border: '1px solid var(--amber-dim, var(--border))',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 800,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}
                  >
                    <span aria-hidden="true">↗</span>
                    log
                  </button>
                </Tooltip>
              </div>
              {entry.description && entry.description !== entry.name && (
                <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>
                  {entry.description}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <span>first forged T{entry.firstForgedTurn} · {entry.firstForgedDepartment}</span>
                {entry.reuseCount > 0 && <span style={{ color: 'var(--green)' }}>reused {entry.reuseCount}×</span>}
                {entry.reforgeCount > 0 && (
                  <span style={{ color: 'var(--amber)' }}>
                    {entry.reforgeCount} re-forge{entry.reforgeCount === 1 ? '' : 's'}
                    {entry.rejectedReforges > 0 && (
                      <span style={{ color: 'var(--rust)' }}> ({entry.rejectedReforges} rejected)</span>
                    )}
                  </span>
                )}
                {depts && <span>used by {depts}</span>}
                <span>leader {sidesLabel}</span>
                {inputCount > 0 && <span style={{ color: 'var(--teal)' }}>{inputCount} input field{inputCount === 1 ? '' : 's'}</span>}
                {outputCount > 0 && <span style={{ color: 'var(--green)' }}>{outputCount} output field{outputCount === 1 ? '' : 's'}</span>}
              </div>
              {/* Expandable judge-verdict explanation. Replaces the old
                  hover-popover with inline details that stays open as
                  long as the user wants and is accessible on touch. */}
              <details style={{ marginTop: 6 }}>
                <summary style={{
                  fontSize: 10, fontFamily: 'var(--mono)',
                  color: entry.approved ? 'var(--green)' : 'var(--rust)',
                  cursor: 'pointer', fontWeight: 700, letterSpacing: '0.05em',
                }}>
                  {entry.approved ? 'WHY IT PASSED' : 'WHY IT FAILED'}
                </summary>
                <div style={{
                  marginTop: 6, padding: '8px 10px', borderRadius: 4,
                  background: 'var(--bg-deep)', border: '1px solid var(--border)',
                  fontSize: 11, lineHeight: 1.55, color: 'var(--text-2)',
                }}>
                  <ForgeVerdictBody entry={entry} />
                </div>
              </details>
              {/* Reuse history (when any). Shows each event this tool
                  was used on, so users can verify the tool paid off
                  across multiple turns instead of getting abandoned. */}
              {entry.history.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--teal)', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.05em' }}>
                    USE HISTORY · {entry.history.length}
                  </summary>
                  <ol style={{
                    margin: '6px 0 0', padding: '0 0 0 20px', fontSize: 10, lineHeight: 1.5,
                    fontFamily: 'var(--mono)', color: 'var(--text-2)',
                  }}>
                    {entry.history.map((h, i) => (
                      <li key={i} style={{
                        color: h.rejected ? 'var(--rust)' : (h.isReforge ? 'var(--amber)' : 'var(--text-2)'),
                      }}>
                        T{h.turn} · {h.department} · <span style={{ color: 'var(--teal)' }}>{h.actorName}</span>
                        {' · '}
                        {i === 0 ? 'first forge' : h.isReforge ? (h.rejected ? 're-forge rejected' : 're-forge accepted') : 'reuse'}
                        {typeof h.confidence === 'number' && ` · conf ${h.confidence.toFixed(2)}`}
                        {h.eventTitle && <span style={{ color: 'var(--text-3)' }}> · "{h.eventTitle}"</span>}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {Boolean(entry.inputSchema || entry.outputSchema) && (
                <details style={{ marginTop: 4 }}>
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
      <details
        open={defaultOpen}
        onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined}
        style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)' }}
      >
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

/** Just the inner toolbox grid — for embedding inside a modal. */
export function ToolboxList({ registry }: { registry: ToolRegistry }) {
  return <ToolboxSection registry={registry} title="" collapsible={false} />;
}

function countSchemaFields(schema: unknown, fallback: string[]): number {
  if (schema && typeof schema === 'object' && (schema as any).properties) {
    return Object.keys((schema as any).properties).length;
  }
  return fallback.length;
}

/**
 * Inline verdict body for the PASS/FAIL pill on a forged tool. Rendered
 * in an expandable <details> block so the explanation stays open as long
 * as the user needs it — no hover-timeout, no touch awkwardness.
 *
 * PASS body: judge confidence + what the approved tool adds to the run
 * (capability gain, dept-report grounding, reuse economy).
 *
 * FAIL body: judge's verbatim rejection reason + the concrete cost of a
 * failed forge (outcome bonus, morale hit, power cost, lost insight).
 *
 * Exported so EventCard and other forge-card surfaces can reuse the
 * same copy without duplicating the explanation text.
 */
export function ForgeVerdictBody({ entry }: { entry: ToolEntry }) {
  if (entry.approved) {
    return (
      <div style={{ fontFamily: 'var(--sans)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', fontWeight: 800, marginBottom: 6 }}>
          ✓ judge confidence {entry.confidence.toFixed(2)}
        </div>
        <div>
          The LLM judge reviewed this tool's source code, test outputs, and sandbox allowlist,
          and approved it across safety, correctness, determinism, and bounded execution.
        </div>
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <b style={{ color: 'var(--green)' }}>What this adds to the run:</b>{' '}
          +0.04 outcome bonus for this event · the dept's report cites the tool's computed result ·
          the tool is now reusable by any dept at near-zero cost (+0.02 per reuse).
        </div>
      </div>
    );
  }
  return (
    <div style={{ fontFamily: 'var(--sans)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--rust)', fontWeight: 800, marginBottom: 6 }}>
        ✗ judge rejected
      </div>
      {entry.errorReason ? (
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-1)',
          padding: 8, background: 'rgba(224,101,48,.08)', borderRadius: 4,
          border: '1px solid rgba(224,101,48,.2)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
          marginBottom: 8,
        }}>
          {entry.errorReason}
        </div>
      ) : (
        <div style={{ fontStyle: 'italic', color: 'var(--text-3)', marginBottom: 8 }}>
          (No rejection reason captured. The judge blocked the tool before it could execute.)
        </div>
      )}
      <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <b style={{ color: 'var(--rust)' }}>Cost of a failed forge:</b>{' '}
        −0.06 outcome bonus on this event · −0.015 morale per failure (crew confidence eroded) ·
        −1.2&nbsp;kW power (sandbox compute consumed) · no quantitative grounding in the dept's report ·
        the dept retries or moves on without the insight this tool would have provided.
      </div>
    </div>
  );
}

/**
 * Backwards-compatible alias. EventCard still wraps the forge-verdict pill
 * in a hover Tooltip; when those pills migrate to expandable details too
 * this alias can be removed.
 */
export { ForgeVerdictBody as ForgeVerdictTooltip };
