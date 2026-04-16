import type { ProcessedEvent, Side } from '../../hooks/useGameState';
import { useScenarioContext } from '../../App';
import { Badge } from '../shared/Badge';
import { Tooltip } from '../shared/Tooltip';

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
        <div style={{ margin: '0 8px 4px' }}>
          <div style={{
            padding: '8px 10px', borderRadius: '6px', fontSize: '11px',
            background: severity === 'critical' ? 'rgba(224,101,48,.08)' : severity === 'high' ? 'rgba(232,180,74,.06)' : 'var(--bg-card)',
            border: `1px solid ${severity === 'critical' ? 'rgba(224,101,48,.25)' : severity === 'high' ? 'rgba(232,180,74,.2)' : 'var(--border)'}`,
            borderLeft: `3px solid ${severity === 'critical' ? 'var(--rust)' : severity === 'high' ? 'var(--amber)' : 'var(--teal)'}`,
          }}>
            {/* Header: dept name, stats, severity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--teal)' }}>
                {scenario.ui.departmentIcons[dept] || ''} {dept}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                {[citeCount > 0 && `${citeCount} citations`, tools.length > 0 && `${tools.length} tools forged`].filter(Boolean).join(' · ') || ''}
              </span>
              {severity && (
                <span style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--mono)', padding: '1px 5px', borderRadius: '2px', background: severity === 'critical' ? 'rgba(224,101,48,.15)' : 'rgba(232,180,74,.1)', color: severity === 'critical' ? 'var(--rust)' : 'var(--amber)' }}>
                  {severity.toUpperCase()} RISK
                </span>
              )}
            </div>

            {/* Summary */}
            {summary && (
              <div style={{ fontSize: '12px', color: 'var(--text-1)', lineHeight: 1.5, marginBottom: '6px' }}>
                {summary}
              </div>
            )}

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

            {/* Inline citations */}
            {Array.isArray(dd.citationList) && (dd.citationList as Array<Record<string, string>>).length > 0 && (
              <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
                {(dd.citationList as Array<Record<string, string>>).map((c, i) => (
                  <div key={i} style={{ fontSize: '10px', lineHeight: 1.4 }}>
                    <a href={c.url} target="_blank" rel="noopener" style={{ color: 'var(--amber)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                      {c.text}
                    </a>
                    {c.doi && <span style={{ marginLeft: '4px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text-4)' }}>DOI:{c.doi}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tool forge cards with expandable detail */}
          {tools.map((t: any, i: number) => (
            <details key={i} style={{
              margin: '0 8px 4px', borderRadius: '4px', fontSize: '12px',
              animation: 'forgeSlide 0.4s ease both, forgeGlow 2s ease both',
              background: t.approved !== false ? 'rgba(106,173,72,.08)' : 'rgba(224,101,48,.04)',
              borderLeft: `3px solid ${t.approved !== false ? 'var(--green)' : 'var(--rust)'}`,
              border: `1px solid ${t.approved !== false ? 'rgba(106,173,72,.25)' : 'rgba(224,101,48,.15)'}`,
              borderLeftWidth: '3px',
              boxShadow: 'var(--card-shadow)',
            }}>
              <summary style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '9px', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '2px' }}>
                    FORGED
                  </span>
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
                  background: t.approved !== false ? 'rgba(106,173,72,.15)' : 'rgba(224,101,48,.1)',
                  color: t.approved !== false ? 'var(--green)' : 'var(--rust)',
                  border: `1px solid ${t.approved !== false ? 'rgba(106,173,72,.3)' : 'rgba(224,101,48,.2)'}`,
                }}>
                  {t.approved !== false ? 'PASS' : 'FAIL'} {(t.confidence || 0.85).toFixed(2)}
                </span>
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
                {Array.isArray(t.inputFields) && t.inputFields.length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.5px' }}>INPUT FIELDS: </span>
                    <span style={{ color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>{t.inputFields.join(', ')}</span>
                  </div>
                )}
                {Array.isArray(t.outputFields) && t.outputFields.length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.5px' }}>OUTPUT FIELDS: </span>
                    <span style={{ color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>{t.outputFields.join(', ')}</span>
                  </div>
                )}
                {t.output && (
                  <details style={{ marginTop: '4px' }}>
                    <summary style={{ fontSize: '10px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>Raw Output</summary>
                    <pre style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: '4px', padding: '8px', overflow: 'auto', maxHeight: '200px', fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginTop: '4px' }}>
                      {typeof t.output === 'object' ? JSON.stringify(t.output, null, 2) : String(t.output)}
                    </pre>
                  </details>
                )}
                {!t.output && (!t.inputFields || t.inputFields.length === 0) && (
                  <div style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Tool forged but no output captured. The tool will be available for subsequent turns.</div>
                )}
              </div>
            </details>
          ))}
        </div>
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
