import { useState } from 'react';
import type { ProcessedEvent, Side } from '../../hooks/useGameState';
import { useScenarioContext } from '../../App';
import { useToolContext } from '../../hooks/useToolRegistry';
import { Badge } from '../shared/Badge';
import { Tooltip } from '../shared/Tooltip';
import { CitationPills } from '../shared/CitationPills';

interface EventCardProps {
  event: ProcessedEvent;
  side: Side;
}

// Shared card base style
const cardBase = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--card-shadow)',
};

const moodColors: Record<string, string> = {
  positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)',
  defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)',
};

export function EventCard({ event, side }: EventCardProps) {
  const scenario = useScenarioContext();
  const toolRegistry = useToolContext();
  // Open detail modal for a forge_attempt or dept_done tool card. Tracks
  // the inspected tool's name so the modal can pull schema + sample
  // output + reuse stats from the registry.
  const [inspectingTool, setInspectingTool] = useState<string | null>(null);
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';
  const dd = event.data;

  switch (event.type) {
    case 'turn_start':
      return null;

    case 'event_start': {
      const idx = Number(dd.eventIndex ?? 0);
      const total = Number(dd.totalEvents ?? 1);
      const title = String(dd.title || '');
      const category = String(dd.category || '');
      if (total <= 1) return null;
      return (
        <div style={{
          padding: '6px 12px', fontSize: '11px',
          borderTop: idx > 0 ? '2px solid var(--border)' : undefined,
          marginTop: idx > 0 ? '6px' : undefined,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontWeight: 800, color: 'var(--rust)', fontFamily: 'var(--mono)', fontSize: '10px' }}>
            EVENT {idx + 1}/{total}
          </span>
          <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{title}</span>
          {category && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '2px', background: 'var(--bg-deep)', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              {category}
            </span>
          )}
        </div>
      );
    }

    case 'promotion': {
      const reason = String(dd.reason || '');
      const name = String(dd.name || '');
      const role = String(dd.role || '');
      return (
        <Tooltip content={
          <div>
            <b style={{ color: sideColor, fontSize: '14px', display: 'block', marginBottom: '6px' }}>Promotion: {role}</b>
            {name && <div style={{ marginBottom: '4px' }}><span style={{ color: 'var(--text-2)' }}>Agent:</span> <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{name}</span></div>}
            {reason && <div style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>{reason}</div>}
          </div>
        }>
          <div style={{ padding: '1px 10px', fontSize: '11px', lineHeight: 1.3, display: 'flex', gap: '6px', cursor: 'pointer', minWidth: 0 }}>
            <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>&rarr;</span>
            <span style={{ fontWeight: 700, color: sideColor, flexShrink: 0 }}>{role}</span>
            <span style={{ color: 'var(--text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{reason}</span>
          </div>
        </Tooltip>
      );
    }

    case 'dept_start':
      return null;

    case 'commander_deciding':
      return null;

    case 'forge_attempt': {
      // Real-time forge notification. Renders as a slim inline card
      // between dept reports so the user can SEE emergent capabilities
      // appear as they're invented, not buried in a summary later.
      const dept = String(dd.department || '');
      const name = String(dd.name || 'unnamed');
      const description = String(dd.description || name);
      const mode = String(dd.mode || 'sandbox');
      const approved = dd.approved !== false;
      const confidence = typeof dd.confidence === 'number' ? dd.confidence : 0.85;
      const errorReason = dd.errorReason ? String(dd.errorReason) : '';
      const accent = approved ? 'var(--amber)' : 'var(--rust)';
      const inputFields = Array.isArray(dd.inputFields) ? (dd.inputFields as string[]) : [];
      const outputFields = Array.isArray(dd.outputFields) ? (dd.outputFields as string[]) : [];

      return (
        <>
        <button
          type="button"
          onClick={() => setInspectingTool(name)}
          aria-label={`Inspect forged tool ${name}`}
          style={{
            display: 'block', width: 'auto', alignSelf: 'stretch', textAlign: 'left',
            margin: '0 8px 4px',
            padding: '6px 10px',
            fontSize: 11, lineHeight: 1.5,
            background: approved ? 'rgba(232,180,74,0.07)' : 'rgba(224,101,48,0.04)',
            borderLeft: `3px solid ${accent}`,
            border: `1px solid ${approved ? 'rgba(232,180,74,0.25)' : 'rgba(224,101,48,0.2)'}`,
            borderRadius: 4,
            animation: 'forgeSlide 0.4s ease both',
            boxShadow: approved ? '0 0 0 1px rgba(232,180,74,0.1)' : 'var(--card-shadow)',
            cursor: 'pointer', font: 'inherit', color: 'var(--text-1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontWeight: 900, fontFamily: 'var(--mono)',
              padding: '2px 6px', borderRadius: 3,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: approved ? 'var(--bg-deep)' : '#fff',
              background: accent,
              boxShadow: approved ? '0 0 8px rgba(232,180,74,0.4)' : 'none',
            }}>
              {approved ? '✦ FORGED' : '✗ FORGE FAILED'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              {dept}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>
              {description}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              {name} ({mode})
            </span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 9, fontWeight: 800, fontFamily: 'var(--mono)',
              padding: '1px 6px', borderRadius: 3,
              color: approved ? 'var(--green)' : 'var(--rust)',
              background: approved ? 'rgba(106,173,72,0.12)' : 'rgba(224,101,48,0.1)',
              border: `1px solid ${approved ? 'rgba(106,173,72,0.3)' : 'rgba(224,101,48,0.2)'}`,
            }}>
              {approved ? `PASS ${confidence.toFixed(2)}` : 'FAIL'}
            </span>
          </div>
          {(inputFields.length > 0 || outputFields.length > 0) && (
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {inputFields.length > 0 && (
                <span><span style={{ color: 'var(--teal)' }}>in:</span> {inputFields.join(', ')}</span>
              )}
              {outputFields.length > 0 && (
                <span><span style={{ color: 'var(--green)' }}>out:</span> {outputFields.join(', ')}</span>
              )}
            </div>
          )}
          {!approved && errorReason && (
            <div style={{ marginTop: 3, fontSize: 10, color: 'var(--rust)', fontStyle: 'italic' }}>
              {errorReason}
            </div>
          )}
        </button>
        {inspectingTool && (
          <ToolDetailModal
            entry={toolRegistry.getEntry(inspectingTool)}
            fallbackName={inspectingTool}
            onClose={() => setInspectingTool(null)}
          />
        )}
        </>
      );
    }

    case 'dept_done': {
      const dept = String(dd.department || '');
      const tools = (dd._filteredTools as Array<Record<string, unknown>>) || [];
      const risks = Array.isArray(dd.risks) ? dd.risks : [];
      const recs = Array.isArray(dd.recommendedActions) ? dd.recommendedActions.map(String) : [];
      const severity = risks.some((r: any) => r.severity === 'critical') ? 'critical' : risks.some((r: any) => r.severity === 'high') ? 'high' : '';

      const summary = String(dd.summary || '');
      const citeCount = Number(dd.citations) || 0;

      // Don't render empty department cards with no content
      if (!summary && risks.length === 0 && recs.length === 0 && tools.length === 0 && citeCount === 0) {
        return null;
      }

      return (
        <>
        <div style={{ margin: '0 8px 4px' }}>
          <div style={{
            padding: '8px 10px', borderRadius: '6px', fontSize: '11px',
            background: severity === 'critical' ? 'rgba(224,101,48,.08)' : severity === 'high' ? 'rgba(232,180,74,.06)' : 'var(--bg-card)',
            border: `1px solid ${severity === 'critical' ? 'rgba(224,101,48,.25)' : severity === 'high' ? 'rgba(232,180,74,.2)' : 'var(--border)'}`,
            borderLeft: `3px solid ${severity === 'critical' ? 'var(--rust)' : severity === 'high' ? 'var(--amber)' : 'var(--teal)'}`,
          }}>
            {/* Header: dept name, tool count, severity badge, inline citation pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--teal)' }}>
                {scenario.ui.departmentIcons[dept] || ''} {dept}
              </span>
              {tools.length > 0 && (
                <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                  {tools.length} tool{tools.length === 1 ? '' : 's'} forged
                </span>
              )}
              {severity && (
                <span style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--mono)', padding: '1px 5px', borderRadius: '2px', background: severity === 'critical' ? 'rgba(224,101,48,.15)' : 'rgba(232,180,74,.1)', color: severity === 'critical' ? 'var(--rust)' : 'var(--amber)' }}>
                  {severity.toUpperCase()} RISK
                </span>
              )}
              {/* Inline citation pills — same row as the header so the
                  card stays compact and scannable. Hover for full source. */}
              <CitationPills
                citations={(dd.citationList as Array<Record<string, string>>) || []}
                inline
                label=""
              />
            </div>

            {/* Summary — falls back to a compact inventory line when the
                LLM returned a sparse report so the card never looks empty. */}
            {summary ? (
              <div style={{ fontSize: '12px', color: 'var(--text-1)', lineHeight: 1.5, marginBottom: '6px' }}>
                {summary}
              </div>
            ) : (risks.length === 0 && recs.length === 0) && (citeCount > 0 || tools.length > 0) ? (
              <div style={{ fontSize: '11px', color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.5, marginBottom: '6px' }}>
                Department analysis complete &mdash; no narrative summary returned, but
                {citeCount > 0 && ` ${citeCount} source${citeCount === 1 ? '' : 's'} surveyed`}
                {citeCount > 0 && tools.length > 0 && ' and '}
                {tools.length > 0 && ` ${tools.length} tool${tools.length === 1 ? '' : 's'} forged`}
                .
              </div>
            ) : null}

            {/* Risks */}
            {risks.length > 0 && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--rust)', letterSpacing: '0.5px', fontFamily: 'var(--mono)', marginBottom: '2px' }}>RISKS</div>
                {risks.slice(0, 3).map((r: any, i: number) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-2)', lineHeight: 1.4, display: 'flex', gap: '4px', marginBottom: '1px' }}>
                    <span style={{ color: (r.severity === 'critical' || r.severity === 'high') ? 'var(--rust)' : 'var(--amber)', fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>
                      {String(r.severity || 'med').toUpperCase()}
                    </span>
                    <span>{String(r.description || '')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recommended Actions */}
            {recs.length > 0 && (
              <div style={{ marginBottom: '4px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--green)', letterSpacing: '0.5px', fontFamily: 'var(--mono)', marginBottom: '2px' }}>RECOMMENDATIONS</div>
                {recs.slice(0, 3).map((rec, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-2)', lineHeight: 1.4, paddingLeft: '8px', borderLeft: '2px solid var(--border)', marginBottom: '2px' }}>
                    {rec}
                  </div>
                ))}
              </div>
            )}

            {/* Citation pills are rendered inline next to the dept name
                in the header above. The full source list lives in the
                References section at the bottom of the report. */}
          </div>

          {/* Tool cards. NEW (first-forge) gets a bright amber pulse +
              "NEWLY FORGED" badge to make emergent capabilities obvious;
              REUSED stays subtle and green with a back-reference to the
              first-forge turn. Schema and raw output are revealed on
              expand. */}
          {tools.map((t: any, i: number) => {
            const approved = t.approved !== false;
            const isNew = t.isNew === true;
            // Color treatment: NEW = amber/rust accent (emergent); REUSED = green (stable)
            const accent = !approved ? 'var(--rust)' : isNew ? 'var(--amber)' : 'var(--green)';
            const bgTint = !approved
              ? 'rgba(224,101,48,.04)'
              : isNew ? 'rgba(232,180,74,.10)' : 'rgba(106,173,72,.06)';
            const borderTint = !approved
              ? 'rgba(224,101,48,.15)'
              : isNew ? 'rgba(232,180,74,.4)' : 'rgba(106,173,72,.2)';
            const inputSchema = t.inputSchema;
            const outputSchema = t.outputSchema;
            const hasFullSchema = !!inputSchema || !!outputSchema;

            return (
              <details key={i} style={{
                margin: '0 8px 4px', borderRadius: '4px', fontSize: '12px',
                animation: isNew
                  ? 'forgeSlide 0.4s ease both, forgeGlow 2.4s ease both'
                  : 'forgeSlide 0.3s ease both',
                background: bgTint,
                borderLeft: `3px solid ${accent}`,
                border: `1px solid ${borderTint}`,
                borderLeftWidth: '3px',
                boxShadow: isNew ? '0 0 0 1px rgba(232,180,74,.15), var(--card-shadow)' : 'var(--card-shadow)',
              }}>
                <summary style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      {isNew ? (
                        <span style={{
                          fontSize: 9, color: 'var(--bg-deep)', background: 'var(--amber)',
                          textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 900,
                          fontFamily: 'var(--mono)', padding: '2px 6px', borderRadius: 3,
                          boxShadow: '0 0 8px rgba(232,180,74,.4)',
                        }}>
                          NEWLY FORGED
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 9, color: 'var(--green)', background: 'rgba(106,173,72,.12)',
                          textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800,
                          fontFamily: 'var(--mono)', padding: '1px 6px', borderRadius: 3,
                          border: '1px solid rgba(106,173,72,.3)',
                        }}>
                          REUSED
                        </span>
                      )}
                      {!isNew && t.firstForgedTurn != null && (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                          first forged T{t.firstForgedTurn}
                          {t.firstForgedDepartment && t.firstForgedDepartment !== t.department
                            ? ` · ${t.firstForgedDepartment}`
                            : ''}
                        </span>
                      )}
                      {hasFullSchema && (
                        <span style={{
                          fontSize: 8, color: 'var(--teal)', fontFamily: 'var(--mono)',
                          padding: '1px 5px', borderRadius: 2,
                          background: 'rgba(76,168,168,.1)', border: '1px solid rgba(76,168,168,.25)',
                        }}>
                          SCHEMA
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--text-1)', fontWeight: 600, lineHeight: 1.3 }}>
                      {String(t.description || t.name || '')}
                    </span>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                      {t.name} {t.mode ? `(${t.mode})` : ''}
                    </span>
                  </div>
                  <span style={{
                    padding: '2px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 800,
                    fontFamily: 'var(--mono)', whiteSpace: 'nowrap', flexShrink: 0,
                    background: approved ? 'rgba(106,173,72,.15)' : 'rgba(224,101,48,.1)',
                    color: approved ? 'var(--green)' : 'var(--rust)',
                    border: `1px solid ${approved ? 'rgba(106,173,72,.3)' : 'rgba(224,101,48,.2)'}`,
                  }}>
                    {approved
                      ? `PASS ${(typeof t.confidence === 'number' ? t.confidence : 0.85).toFixed(2)}`
                      : 'FAIL'}
                  </span>
                  {/* Open the same ToolDetailModal that forge_attempt cards
                      use, so dept_done summary tools are clickable too. */}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInspectingTool(t.name || ''); }}
                    aria-label={`Inspect tool ${t.name || ''}`}
                    style={{
                      fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700,
                      padding: '2px 6px', borderRadius: 3,
                      border: '1px solid rgba(232,180,74,0.35)',
                      background: 'rgba(232,180,74,0.06)',
                      color: 'var(--amber)', cursor: 'pointer',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    INSPECT
                  </button>
                </summary>
                <div style={{ padding: '0 12px 8px', fontSize: '11px' }}>
                  {t.crisis && (
                    <div style={{ color: 'var(--text-3)', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.5px' }}>CRISIS: </span>
                      {String(t.crisis)}
                    </div>
                  )}
                  {t.department && (
                    <div style={{ color: 'var(--text-3)', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.5px' }}>DEPT: </span>
                      {String(t.department)}
                    </div>
                  )}

                  {/* Input/output schemas — show the actual JSON Schema when
                      available (pulled from EmergentToolRegistry on first
                      forge), otherwise fall back to derived field names. */}
                  {(inputSchema || (Array.isArray(t.inputFields) && t.inputFields.length > 0)) && (
                    <SchemaBlock label="INPUT" color="var(--teal)" schema={inputSchema} fields={t.inputFields} />
                  )}
                  {(outputSchema || (Array.isArray(t.outputFields) && t.outputFields.length > 0)) && (
                    <SchemaBlock label="OUTPUT" color="var(--green)" schema={outputSchema} fields={t.outputFields} />
                  )}

                  {t.output && (
                    <details style={{ marginTop: '4px' }}>
                      <summary style={{ fontSize: '10px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>Raw Output</summary>
                      <pre style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: '4px', padding: '8px', overflow: 'auto', maxHeight: '200px', fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginTop: '4px' }}>
                        {typeof t.output === 'object' ? JSON.stringify(t.output, null, 2) : String(t.output)}
                      </pre>
                    </details>
                  )}
                  {!t.output && !inputSchema && !outputSchema && (!t.inputFields || t.inputFields.length === 0) && (
                    <div style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Tool forged but no output captured. The tool will be available for subsequent turns.</div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
        {inspectingTool && (
          <ToolDetailModal
            entry={toolRegistry.getEntry(inspectingTool)}
            fallbackName={inspectingTool}
            onClose={() => setInspectingTool(null)}
          />
        )}
        </>
      );
    }

    case 'outcome': {
      const outcome = String(dd.outcome || '');
      const decision = String(dd._decision || '');
      const rationale = String(dd._rationale || '');
      const policies = (dd._policies as string[]) || [];
      const colonyDeltas = dd.colonyDeltas as Record<string, number> | undefined;
      const turnNum = String(dd.turn || '');
      const toolCount = Number(dd._toolCount ?? 0);
      const citeCount = Number(dd._citeCount ?? 0);

      return (
        <div style={{
          margin: '0 8px 4px', borderRadius: '4px', padding: '6px 10px',
          animation: 'decisionPulse 2s ease both',
          background: side === 'a' ? 'rgba(232,180,74,.06)' : 'rgba(76,168,168,.06)',
          border: `1px solid ${side === 'a' ? 'var(--amber-dim)' : 'var(--teal-dim)'}`,
          borderLeft: `3px solid ${sideColor}`,
          boxShadow: 'var(--card-shadow)',
        }}>
          {/* Header: DECISION #N  tools · citations  BADGE */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
            <span>
              <span style={{ fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: sideColor }}>
                DECISION #{turnNum}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--mono)', marginLeft: '8px' }}>
                {toolCount} tools &middot; {citeCount} citations
              </span>
            </span>
            <Badge outcome={outcome} />
          </div>
          {/* Decision text */}
          <div style={{ color: 'var(--text-1)', lineHeight: 1.5, fontSize: '13px' }}>
            {decision}
          </div>
          {/* Colony deltas in teal mono */}
          {colonyDeltas && Object.keys(colonyDeltas).length > 0 && (
            <div style={{ marginTop: '4px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--teal)' }}>
              {Object.entries(colonyDeltas).map(([k, v]) => (
                <span key={k} style={{ marginRight: '4px' }}>
                  {k} {v > 0 ? '+' : ''}{typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}
                  {'\u00b7'}
                </span>
              ))}
            </div>
          )}
          {/* Expandable reasoning */}
          {(rationale || policies.length > 0) && (
            <details style={{ marginTop: '4px' }}>
              <summary style={{ fontSize: '12px', color: sideColor, fontWeight: 600, cursor: 'pointer' }}>Full reasoning &amp; policies</summary>
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-2)', lineHeight: 1.5 }}>
                {decision}
                {rationale && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>{rationale}</div>}
                {policies.map((p, i) => <div key={i} style={{ color: 'var(--amber)' }}>&rarr; {p}</div>)}
              </div>
            </details>
          )}
        </div>
      );
    }

    case 'drift': {
      const entries = Object.values(dd.agents as Record<string, any> || {});
      if (!entries.length) return null;
      return (
        <div style={{ padding: '3px 10px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-2)', lineHeight: 1.4 }}>
          <span style={{ color: 'var(--text-3)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>DRIFT </span>
          {entries.slice(0, 3).map((c: any, i: number) => (
            <span key={i}>
              <span style={{ color: sideColor }}>{c.name?.split(' ')[0]}</span>
              {' '}O{c.hexaco?.O ?? '?'} C{c.hexaco?.C ?? '?'}
              {i < Math.min(entries.length, 3) - 1 ? ' \u00b7 ' : ''}
            </span>
          ))}
        </div>
      );
    }

    case 'agent_reactions': {
      const reactions = (dd.reactions as Array<Record<string, any>>) || [];
      const total = (dd.totalReactions as number) || reactions.length;
      if (!reactions.length) return null;

      const moodCounts: Record<string, number> = {};
      for (const r of reactions) moodCounts[r.mood] = (moodCounts[r.mood] || 0) + 1;
      const moodBgColors: Record<string, string> = {
        positive: '#6aad48', negative: '#e06530', anxious: '#e8b44a',
        defiant: '#e06530', hopeful: '#6aad48', resigned: '#a89878', neutral: '#a89878',
      };
      const segments = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).map(([mood, count]) => ({
        mood, count, pct: Math.round((count / reactions.length) * 100), bg: moodBgColors[mood] || '#a89878',
      }));

      return (
        <div style={{ ...cardBase, margin: '0 8px 4px', padding: '6px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'var(--mono)', color: sideColor }}>
              {total} VOICES
            </span>
            <div style={{ flex: 1, display: 'flex', height: '10px', borderRadius: '2px', overflow: 'hidden', gap: '1px' }}>
              {segments.map(m => <div key={m.mood} style={{ flex: m.pct, background: m.bg }} title={`${m.pct}% ${m.mood}`} />)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '11px', marginBottom: '4px' }}>
            {segments.slice(0, 3).map(m => (
              <span key={m.mood} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block', background: m.bg }} />
                {m.pct}% {m.mood}
              </span>
            ))}
          </div>
          <details>
            <summary style={{ fontSize: '10px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>quotes ({reactions.length})</summary>
            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {reactions.slice(0, 4).map((r, i) => (
                <Tooltip key={i} dot content={
                  <div>
                    <b style={{ color: sideColor, display: 'block', marginBottom: '4px' }}>{r.name}</b>
                    <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>{r.role} in {r.department} {r.age ? `· Age ${r.age}` : ''}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', marginTop: '6px', color: 'var(--text-1)' }}>O:{r.hexaco?.O} C:{r.hexaco?.C} E:{r.hexaco?.E} A:{r.hexaco?.A} Em:{r.hexaco?.Em} HH:{r.hexaco?.HH}</div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>Bone: {r.boneDensity}% · Radiation: {r.radiation}mSv · Psych: {r.psychScore}</div>
                    <div style={{ fontStyle: 'italic', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', lineHeight: 1.5 }}>&ldquo;{r.quote}&rdquo;</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '4px', color: moodColors[r.mood] || 'var(--text-3)' }}>{String(r.mood || '').toUpperCase()} · intensity {r.intensity?.toFixed?.(2) || '?'}</div>
                    {r.memory?.beliefs?.length > 0 && <div style={{ fontSize: '10px', marginTop: '6px', color: 'var(--text-3)' }}>Beliefs: {r.memory.beliefs.slice(0, 2).join('; ')}</div>}
                  </div>
                }>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '11px', padding: '3px 0', cursor: 'pointer', borderBottom: i < Math.min(reactions.length, 4) - 1 ? '1px solid rgba(48,42,34,.3)' : 'none' }}>
                    <span style={{ fontWeight: 700, color: sideColor, flexShrink: 0, minWidth: '90px' }}>{r.name}</span>
                    <span style={{ flex: 1, color: 'var(--text-2)', fontStyle: 'italic', lineHeight: 1.4, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      &ldquo;{String(r.quote || '')}&rdquo;
                    </span>
                    <span style={{
                      fontSize: '9px', fontWeight: 800, flexShrink: 0, fontFamily: 'var(--mono)',
                      padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap',
                      color: moodColors[r.mood] || 'var(--text-3)',
                      background: `color-mix(in srgb, ${moodColors[r.mood] || 'var(--text-3)'} 12%, transparent)`,
                    }}>
                      {String(r.mood || '').toUpperCase()}
                    </span>
                  </div>
                </Tooltip>
              ))}
            </div>
          </details>
        </div>
      );
    }

    case 'bulletin': {
      const posts = (dd.posts as Array<Record<string, any>>) || [];
      if (!posts.length) return null;

      return (
        <div style={{ margin: '0 8px 4px' }}>
          {posts.slice(0, 3).map((p, i) => (
            <Tooltip key={i} dot content={
              <div>
                <b style={{ color: sideColor }}>{p.name}</b> <span style={{ color: 'var(--text-3)', fontSize: '11px' }}>{p.role} {p.department}</span>
                <div style={{ marginTop: '6px', lineHeight: 1.6, color: 'var(--text-1)' }}>{p.post}</div>
                <div style={{ marginTop: '4px', fontSize: '11px', color: moodColors[p.mood] || 'var(--text-3)' }}>{String(p.mood || '').toUpperCase()} · {p.likes || 0} likes · {p.replies || 0} replies</div>
              </div>
            }>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px', padding: '2px 0', cursor: 'pointer' }}>
                <span style={{ fontWeight: 700, color: sideColor, flexShrink: 0 }}>{p.name}</span>
                <span style={{ flex: 1, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{String(p.post || '')}</span>
                <span style={{ fontSize: '9px', color: 'var(--text-3)', flexShrink: 0 }}>&hearts;{p.likes || 0}</span>
              </div>
            </Tooltip>
          ))}
        </div>
      );
    }

    case 'turn_done':
      return (
        <div style={{
          textAlign: 'center', padding: '5px 0', fontSize: '11px', color: 'var(--text-3)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px',
          borderTop: '1px solid var(--border)', marginTop: '3px',
          fontFamily: 'var(--mono)',
        }}>
          Turn {String(dd.turn)} complete
        </div>
      );

    default:
      return null;
  }
}

import type { ToolEntry } from '../../hooks/useToolRegistry';

/**
 * Modal that surfaces the full toolbox entry for a forged tool — schemas,
 * sample output, reuse counts, departments. Triggered by clicking a
 * forge_attempt card in the sim flow.
 */
function ToolDetailModal({ entry, fallbackName, onClose }: {
  entry: ToolEntry | undefined;
  fallbackName: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Tool detail · ${entry?.name || fallbackName}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(10,8,6,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderTop: '3px solid var(--amber)',
          borderRadius: 10,
          padding: '16px 20px',
          maxWidth: 720, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
          fontFamily: 'var(--sans)', color: 'var(--text-1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 4 }}>
              FORGED TOOL [{entry?.n ?? '?'}]
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text-1)', marginBottom: 4 }}>
              {entry?.name || fallbackName}
            </div>
            {entry?.description && entry.description !== entry.name && (
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                {entry.description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4, marginLeft: 12 }}
          >
            ×
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '4px 2px' }}>
          {entry ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, fontSize: 11, fontFamily: 'var(--mono)' }}>
                <Pill label={`${entry.mode}`} color="var(--text-3)" />
                <Pill label={entry.approved ? `PASS ${entry.confidence.toFixed(2)}` : 'FAIL'} color={entry.approved ? 'var(--green)' : 'var(--rust)'} />
                <Pill label={`first forged T${entry.firstForgedTurn} · ${entry.firstForgedDepartment}`} color="var(--amber)" />
                {entry.reuseCount > 0 && <Pill label={`reused ${entry.reuseCount}×`} color="var(--green)" />}
                {entry.departments.size > 0 && <Pill label={`used by ${[...entry.departments].join(', ')}`} color="var(--teal)" />}
              </div>

              {entry.inputSchema && (
                <ModalSection title="INPUT SCHEMA">
                  <pre style={preStyle}>{JSON.stringify(entry.inputSchema, null, 2)}</pre>
                </ModalSection>
              )}
              {entry.outputSchema && (
                <ModalSection title="OUTPUT SCHEMA">
                  <pre style={preStyle}>{JSON.stringify(entry.outputSchema, null, 2)}</pre>
                </ModalSection>
              )}
              {!entry.inputSchema && !entry.outputSchema && (entry.inputFields.length > 0 || entry.outputFields.length > 0) && (
                <ModalSection title="FIELDS (DERIVED)">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--mono)', fontSize: 11 }}>
                    {entry.inputFields.length > 0 && <div><span style={{ color: 'var(--teal)' }}>in:</span> {entry.inputFields.join(', ')}</div>}
                    {entry.outputFields.length > 0 && <div><span style={{ color: 'var(--green)' }}>out:</span> {entry.outputFields.join(', ')}</div>}
                  </div>
                </ModalSection>
              )}
              {/* Reuse timeline — every invocation across the run with
                  turn, dept, event title, and output. Re-forge attempts
                  are flagged separately from pure citations so the user
                  can see when the LLM re-ran the judge vs cited an
                  existing tool. */}
              {entry.history && entry.history.length > 0 && (
                <ModalSection title={`USAGE HISTORY · ${entry.history.length} invocation${entry.history.length === 1 ? '' : 's'}`}>
                  <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {entry.history.map((h, i) => (
                      <li
                        key={i}
                        style={{
                          padding: '6px 8px', borderRadius: 4,
                          background: 'var(--bg-deep)', border: '1px solid var(--border)',
                          borderLeft: `3px solid ${
                            h.rejected ? 'var(--rust)' : h.isReforge ? 'var(--amber)' : 'var(--green)'
                          }`,
                          fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.5,
                        }}
                      >
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--amber)', fontWeight: 800 }}>T{h.turn}</span>
                          <span style={{ color: 'var(--text-3)' }}>{h.year}</span>
                          <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>{h.department}</span>
                          <span style={{ color: 'var(--text-3)' }}>· {h.eventTitle}</span>
                          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 2, fontSize: 9, fontWeight: 800,
                              color: h.rejected ? 'var(--rust)' : h.isReforge ? 'var(--amber)' : 'var(--green)',
                              background: 'color-mix(in srgb, ' + (h.rejected ? 'var(--rust)' : h.isReforge ? 'var(--amber)' : 'var(--green)') + ' 12%, transparent)',
                            }}>
                              {h.rejected ? 'JUDGE REJECTED' : h.isReforge ? 'RE-FORGE' : i === 0 ? 'FORGE' : 'REUSE'}
                            </span>
                            {typeof h.confidence === 'number' && (
                              <span style={{ color: 'var(--text-3)', fontSize: 9 }}>conf {h.confidence.toFixed(2)}</span>
                            )}
                          </span>
                        </div>
                        {h.output && (
                          <div style={{ color: 'var(--text-2)', marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10 }}>
                            {h.output.length > 200 ? h.output.slice(0, 200) + '…' : h.output}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </ModalSection>
              )}

              {entry.sampleOutput && (
                <ModalSection title="LATEST OUTPUT">
                  <pre style={preStyle}>{entry.sampleOutput}</pre>
                </ModalSection>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
              Tool entry not yet in the registry — the dept_done summary
              for this forge hasn't arrived yet. Try again in a moment.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const preStyle: React.CSSProperties = {
  margin: '4px 0 0', padding: 10, fontSize: 11, lineHeight: 1.5,
  fontFamily: 'var(--mono)', color: 'var(--text-2)',
  background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 4,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 280, overflow: 'auto',
};

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 3,
      color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      fontWeight: 700, fontSize: 10, letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  );
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
        color: 'var(--amber)', letterSpacing: '0.08em',
        textTransform: 'uppercase', marginBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * Render an INPUT or OUTPUT block for a forged tool.
 *
 * Prefers the actual JSON Schema (pulled from EmergentToolRegistry on
 * first forge) when available, falling back to a simple field-name list
 * derived from the tool's last invocation.
 */
function SchemaBlock({ label, color, schema, fields }: {
  label: 'INPUT' | 'OUTPUT';
  color: string;
  schema?: unknown;
  fields?: string[];
}) {
  const props = (schema && typeof schema === 'object' && (schema as any).properties) || null;
  const required: string[] = (schema && typeof schema === 'object' && Array.isArray((schema as any).required))
    ? (schema as any).required
    : [];

  // No real schema → render the legacy field-name list
  if (!props) {
    if (!fields || fields.length === 0) return null;
    return (
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.5px' }}>
          {label} FIELDS:{' '}
        </span>
        <span style={{ color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
          {fields.join(', ')}
        </span>
      </div>
    );
  }

  const entries = Object.entries(props as Record<string, any>).slice(0, 12);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        fontWeight: 700, color, fontFamily: 'var(--mono)', fontSize: 9,
        letterSpacing: '0.5px', marginBottom: 2,
      }}>
        {label} SCHEMA
      </div>
      <table style={{
        borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 10,
        width: '100%', tableLayout: 'fixed',
      }}>
        <tbody>
          {entries.map(([key, def]) => {
            const type = String(def?.type ?? 'any');
            const desc = typeof def?.description === 'string' ? def.description : '';
            const isRequired = required.includes(key);
            return (
              <tr key={key} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '2px 6px 2px 0', color: 'var(--text-1)', fontWeight: 700, width: '32%', verticalAlign: 'top' }}>
                  {key}
                  {isRequired && <span style={{ color: 'var(--rust)', marginLeft: 2 }}>*</span>}
                </td>
                <td style={{ padding: '2px 6px', color: color, width: '20%', verticalAlign: 'top' }}>
                  {type}
                </td>
                <td style={{ padding: '2px 0', color: 'var(--text-3)', verticalAlign: 'top', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {desc}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
