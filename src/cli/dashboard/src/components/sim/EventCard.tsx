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

export function EventCard({ event, side }: EventCardProps) {
  const scenario = useScenarioContext();
  const sideColor = side === 'a' ? 'var(--vis)' : 'var(--eng)';
  const dd = event.data;

  switch (event.type) {
    case 'turn_start':
      return null;

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
          <div style={{ padding: '1px 10px', fontSize: '11px', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>
            <span style={{ color: 'var(--text-3)' }}>&rarr; </span>
            <span style={{ fontWeight: 700, color: sideColor }}>{role}</span>
            <span style={{ color: 'var(--text-3)', marginLeft: '6px' }}>{reason.slice(0, 60)}{reason.length > 60 ? '...' : ''}</span>
          </div>
        </Tooltip>
      );
    }

    case 'dept_start': {
      const dept = String(dd.department || '');
      return (
        <div style={{ padding: '1px 10px', fontSize: '10px', color: 'var(--text-3)', animation: 'pulse 1.5s infinite', fontFamily: 'var(--mono)' }}>
          {dept.charAt(0).toUpperCase() + dept.slice(1)} analyzing...
        </div>
      );
    }

    case 'commander_deciding':
      return (
        <div style={{ padding: '1px 10px', fontSize: '10px', color: 'var(--text-3)', animation: 'pulse 1.5s infinite', fontFamily: 'var(--mono)' }}>
          Commander deciding...
        </div>
      );

    case 'dept_done': {
      const dept = String(dd.department || '');
      const tools = (dd._filteredTools as Array<Record<string, unknown>>) || [];
      const risks = Array.isArray(dd.risks) ? dd.risks : [];
      const severity = risks.some((r: any) => r.severity === 'critical') ? 'critical' : risks.some((r: any) => r.severity === 'high') ? 'high' : '';

      return (
        <div>
          {/* Department pill - compact inline */}
          <div style={{ padding: '2px 10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
              background: severity === 'critical' ? 'rgba(224,101,48,.15)' : severity === 'high' ? 'rgba(232,180,74,.1)' : 'var(--bg-elevated)',
              color: severity === 'critical' ? 'var(--rust)' : severity === 'high' ? 'var(--amber)' : 'var(--text-2)',
              border: '1px solid var(--border)',
            }}>
              {scenario.ui.departmentIcons[dept] || ''} {dept.charAt(0).toUpperCase() + dept.slice(1)} &middot; {dd.citations || 0}c {tools.length}t
              {severity && <span style={{ textTransform: 'uppercase', fontSize: '8px', fontWeight: 800, fontFamily: 'var(--mono)', marginLeft: '2px' }}>{severity}</span>}
            </span>
          </div>

          {/* Citation links */}
          {Array.isArray(dd.citationList) && (dd.citationList as Array<Record<string, string>>).length > 0 && (
            <div style={{ padding: '0 10px 3px' }}>
              {(dd.citationList as Array<Record<string, string>>).map((c, i) => (
                <div key={i} style={{ fontSize: '11px', margin: '1px 0' }}>
                  <a href={c.url} target="_blank" rel="noopener" style={{ color: 'var(--amber)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                    {c.text}
                  </a>
                  {c.doi && <span style={{ marginLeft: '4px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-4)' }}>DOI:{c.doi}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Tool forge cards with glow */}
          {tools.map((t: any, i: number) => (
            <div key={i} style={{
              margin: '0 8px 4px', borderRadius: '4px', padding: '8px 12px', fontSize: '12px',
              display: 'flex', alignItems: 'center', gap: '10px',
              animation: 'forgeSlide 0.4s ease both, forgeGlow 2s ease both',
              background: t.approved !== false ? 'rgba(106,173,72,.08)' : 'rgba(224,101,48,.04)',
              borderLeft: `3px solid ${t.approved !== false ? 'var(--green)' : 'var(--rust)'}`,
              border: `1px solid ${t.approved !== false ? 'rgba(106,173,72,.25)' : 'rgba(224,101,48,.15)'}`,
              borderLeftWidth: '3px',
              boxShadow: 'var(--card-shadow)',
            }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '9px', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '2px' }}>
                  FORGED
                </span>
                <span style={{ fontSize: '14px', color: 'var(--text-1)', fontWeight: 600, lineHeight: 1.3 }}>
                  {String(t.description || t.name || '').slice(0, 80)}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                  {t.name} {t.mode ? `(${t.mode})` : ''}
                </span>
              </div>
              <span style={{
                padding: '2px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 800,
                fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
                background: t.approved !== false ? 'rgba(106,173,72,.15)' : 'rgba(224,101,48,.1)',
                color: t.approved !== false ? 'var(--green)' : 'var(--rust)',
                border: `1px solid ${t.approved !== false ? 'rgba(106,173,72,.3)' : 'rgba(224,101,48,.2)'}`,
              }}>
                {t.approved !== false ? 'PASS' : 'FAIL'} {(t.confidence || 0.85).toFixed(2)}
              </span>
            </div>
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
      const turnNum = dd.turn || '';
      const toolCount = dd._toolCount ?? 0;
      const citeCount = dd._citeCount ?? 0;

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
      const moodColors: Record<string, string> = {
        positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)',
        defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)',
      };
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
          <details open>
            <summary style={{ fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: sideColor, fontFamily: 'var(--mono)' }}>quotes</summary>
            <div style={{ marginTop: '3px' }}>
              {reactions.slice(0, 6).map((r, i) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                    <Tooltip dot content={
                      <div>
                        <b style={{ color: sideColor, display: 'block', marginBottom: '4px' }}>{r.name}</b>
                        <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>
                          {r.role} in {r.department} {r.age ? `\u00b7 Age ${r.age}` : ''} {r.marsborn ? '\u00b7 Born here' : ''}
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', marginTop: '6px', color: 'var(--text-1)' }}>
                          O:{r.hexaco?.O} C:{r.hexaco?.C} E:{r.hexaco?.E} A:{r.hexaco?.A} Em:{r.hexaco?.Em} HH:{r.hexaco?.HH}
                        </div>
                        <div style={{ fontSize: '11px', marginTop: '4px' }}>
                          Bone: {r.boneDensity}% \u00b7 Radiation: {r.radiation}mSv \u00b7 Psych: {r.psychScore}
                        </div>
                        <div style={{ fontStyle: 'italic', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', lineHeight: 1.5 }}>
                          &ldquo;{r.quote}&rdquo;
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '4px', color: moodColors[r.mood] || 'var(--text-3)' }}>
                          {String(r.mood || '').toUpperCase()} \u00b7 intensity {r.intensity?.toFixed?.(2) || '?'}
                        </div>
                      </div>
                    }>
                      <span style={{ fontWeight: 700, minWidth: '90px', flexShrink: 0, color: sideColor }}>{r.name}</span>
                    </Tooltip>
                    <span style={{ fontStyle: 'italic', flex: 1, color: 'var(--text-1)', lineHeight: 1.5 }}>
                      &ldquo;{String(r.quote || '').slice(0, 100)}{String(r.quote || '').length > 100 ? '...' : ''}&rdquo;
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 700, flexShrink: 0, color: moodColors[r.mood] || 'var(--text-3)' }}>
                      {String(r.mood || '').toUpperCase()}
                    </span>
                  </div>
                  {r.memory && (r.memory.beliefs?.length > 0 || r.memory.stances?.length > 0 || r.memory.relationships?.length > 0) && (
                    <details style={{ marginTop: '2px', marginLeft: '96px' }}>
                      <summary style={{ fontSize: '10px', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>memory</summary>
                      <div style={{ marginTop: '2px', paddingLeft: '8px', fontSize: '10px', color: 'var(--text-3)', borderLeft: `2px solid ${sideColor}` }}>
                        {r.memory.beliefs?.map((b: string, bi: number) => <div key={bi}>{b}</div>)}
                        {r.memory.stances?.map((s: { topic: string; value: number }, si: number) => (
                          <div key={si} style={{ color: s.value > 0 ? 'var(--green)' : 'var(--rust)' }}>
                            {s.topic}: {s.value > 0.5 ? 'confident' : s.value > 0 ? 'cautious' : s.value > -0.5 ? 'wary' : 'fearful'}
                          </div>
                        ))}
                        {r.memory.relationships?.map((rel: { name: string; sentiment: number }, ri: number) => (
                          <div key={ri}>
                            {rel.name}: <span style={{ color: rel.sentiment > 0 ? 'var(--green)' : 'var(--rust)' }}>
                              {rel.sentiment > 0.5 ? 'close ally' : rel.sentiment > 0 ? 'friendly' : rel.sentiment > -0.5 ? 'tense' : 'adversarial'}
                            </span>
                          </div>
                        ))}
                        {r.memory.recentMemories?.slice(0, 2).map((m: { year: number; content: string }, mi: number) => (
                          <div key={mi} style={{ fontStyle: 'italic' }}>Y{m.year}: {m.content.slice(0, 80)}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
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
          {posts.map((p, i) => (
            <div key={i} style={{ ...cardBase, padding: '8px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, fontSize: '12px', color: sideColor }}>{p.name}</span>
                <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>{p.role} {p.department}</span>
              </div>
              <div style={{ color: 'var(--text-1)', fontSize: '13px', lineHeight: 1.5 }}>{p.post}</div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '10px', color: 'var(--text-3)' }}>
                <span style={{ color: moodColors[p.mood] || 'var(--text-3)' }}>{String(p.mood || '').toUpperCase()}</span>
                <span>&hearts; {p.likes || 0}</span>
                <span>&crarr; {p.replies || 0}</span>
              </div>
            </div>
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
          Turn {dd.turn} complete
        </div>
      );

    default:
      return null;
  }
}
