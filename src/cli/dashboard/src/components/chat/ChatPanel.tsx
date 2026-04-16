import { useState, useRef, useEffect, useMemo } from 'react';
import { useScenarioContext } from '../../App';
import type { GameState } from '../../hooks/useGameState';

interface ChatMessage {
  role: 'user' | 'agent';
  name?: string;
  text: string;
}

interface AgentMemoryInfo {
  beliefs: string[];
  stances: Array<{ topic: string; value: number }>;
  relationships: Array<{ name: string; sentiment: number }>;
  recentMemories: Array<{ year: number; content: string; valence: string }>;
}

interface AgentInfo {
  name: string;
  role: string;
  department: string;
  mood: string;
  age?: number;
  marsborn?: boolean;
  agentId?: string;
  memory?: AgentMemoryInfo | null;
}

interface ChatPanelProps {
  state: GameState;
}

const moodColors: Record<string, string> = {
  positive: 'var(--green)', negative: 'var(--rust)', anxious: 'var(--amber)',
  defiant: 'var(--rust)', hopeful: 'var(--green)', resigned: 'var(--text-3)', neutral: 'var(--text-2)',
};

function EventContext({ memory, events, scenario }: { memory: AgentMemoryInfo; events: GameState; scenario: { labels: { eventNoun?: string; eventNounSingular?: string } } }) {
  // Collect crisis/event titles from both sides
  const eventTimeline: Array<{ turn: number; year: number; title: string; category: string }> = [];
  for (const side of ['a', 'b'] as const) {
    for (const evt of events[side].events) {
      if (evt.type === 'turn_start' && evt.data.title && evt.data.title !== 'Director generating...') {
        const turn = evt.data.turn as number;
        if (!eventTimeline.some(e => e.turn === turn)) {
          eventTimeline.push({
            turn,
            year: evt.data.year as number || 0,
            title: String(evt.data.title),
            category: String(evt.data.category || ''),
          });
        }
      }
    }
  }
  eventTimeline.sort((a, b) => a.turn - b.turn);

  const eventNoun = scenario.labels.eventNoun || 'events';
  const hasMemories = memory.recentMemories?.length > 0;
  const hasRelationships = memory.relationships?.length > 0;

  if (!eventTimeline.length && !hasMemories) return null;

  return (
    <div style={{
      padding: '8px 14px', borderRadius: 6, fontSize: 10, lineHeight: 1.5,
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      marginBottom: 4,
    }}>
      {eventTimeline.length > 0 && (
        <div style={{ marginBottom: hasMemories ? 8 : 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--rust)', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', marginBottom: 4 }}>
            {eventNoun.toUpperCase()} EXPERIENCED
          </div>
          {eventTimeline.map(e => (
            <div key={e.turn} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', flexShrink: 0, minWidth: 45 }}>T{e.turn} {e.year}</span>
              <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{e.title}</span>
              {e.category && <span style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{e.category}</span>}
            </div>
          ))}
        </div>
      )}
      {hasMemories && (
        <div style={{ marginBottom: hasRelationships ? 6 : 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', marginBottom: 3 }}>
            RECENT MEMORIES
          </div>
          {memory.recentMemories.slice(0, 3).map((m, i) => (
            <div key={i} style={{ color: 'var(--text-2)', paddingLeft: 6, borderLeft: `2px solid ${m.valence === 'positive' ? 'var(--green)' : m.valence === 'negative' ? 'var(--rust)' : 'var(--border)'}`, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>Y{m.year}</span> {m.content}
            </div>
          ))}
        </div>
      )}
      {hasRelationships && (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', marginBottom: 3 }}>
            RELATIONSHIPS
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {memory.relationships.map((r, i) => (
              <span key={i} style={{ color: r.sentiment > 0 ? 'var(--green)' : 'var(--rust)' }}>
                {r.name} {r.sentiment > 0 ? '+' : ''}{r.sentiment.toFixed(1)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ state }: ChatPanelProps) {
  const scenario = useScenarioContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Per-agent message threads — switching agents no longer wipes history.
  // The server-side AgentOS session also keeps its own history, so messages
  // here are kept in sync on the client for visual continuity.
  const [threads, setThreads] = useState<Map<string, ChatMessage[]>>(() => new Map());
  const [historyByAgent, setHistoryByAgent] = useState<Map<string, Array<{ role: string; content: string }>>>(() => new Map());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const messages = selectedId ? (threads.get(selectedId) ?? []) : [];
  const history = selectedId ? (historyByAgent.get(selectedId) ?? []) : [];

  const agents = useMemo(() => {
    const map = new Map<string, AgentInfo>();
    for (const side of ['a', 'b'] as const) {
      for (const evt of state[side].events) {
        if (evt.type === 'agent_reactions') {
          const reactions = evt.data.reactions as Array<Record<string, unknown>> || [];
          for (const r of reactions) {
            if (r.name) {
              map.set(r.name as string, {
                name: r.name as string, role: r.role as string || '',
                department: r.department as string || '', mood: r.mood as string || 'neutral',
                age: r.age as number, marsborn: r.marsborn as boolean,
                agentId: r.agentId as string, memory: r.memory as AgentMemoryInfo | null,
              });
            }
          }
        }
      }
    }
    return Array.from(map.values());
  }, [state]);

  const selected = agents.find(c => c.name === selectedId);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const selectAgent = (name: string) => {
    setSelectedId(name);
    // Initialize a thread the first time we open this agent. Re-selects keep
    // the existing thread intact so the user can switch agents and back
    // without losing the conversation.
    setThreads(prev => {
      if (prev.has(name)) return prev;
      const c = agents.find(a => a.name === name);
      const greeting: ChatMessage = c ? {
        role: 'agent', name: c.name,
        text: `${c.role} in ${c.department}. Age ${c.age || '?'}. Ask me anything about life in the ${scenario.labels.settlementNoun}.`,
      } : { role: 'agent', text: 'Connected.' };
      const next = new Map(prev);
      next.set(name, [greeting]);
      return next;
    });
  };

  const setMessagesFor = (agentId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setThreads(prev => {
      const next = new Map(prev);
      next.set(agentId, updater(prev.get(agentId) ?? []));
      return next;
    });
  };

  const setHistoryFor = (agentId: string, updater: (prev: Array<{ role: string; content: string }>) => Array<{ role: string; content: string }>) => {
    setHistoryByAgent(prev => {
      const next = new Map(prev);
      next.set(agentId, updater(prev.get(agentId) ?? []));
      return next;
    });
  };

  const send = async () => {
    if (!input.trim() || !selectedId || sending) return;
    const targetId = selectedId;
    const msg = input.trim();
    setInput('');
    setSending(true);
    setMessagesFor(targetId, prev => [...prev, { role: 'user', text: msg }]);
    const currentHistory = historyByAgent.get(targetId) ?? [];
    const newHistory = [...currentHistory, { role: 'user', content: msg }];
    setHistoryFor(targetId, () => newHistory);
    try {
      const res = await fetch('/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: targetId, message: msg, history: newHistory }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessagesFor(targetId, prev => [...prev, { role: 'agent', name: data.colonist || targetId, text: data.reply }]);
        setHistoryFor(targetId, prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessagesFor(targetId, prev => [...prev, { role: 'agent', text: data.error || 'No response' }]);
      }
    } catch (err) {
      setMessagesFor(targetId, prev => [...prev, { role: 'agent', text: `Chat failed: ${err}` }]);
    }
    setSending(false);
  };

  return (
    <div className="chat-layout" role="region" aria-label="Agent chat" style={{ display: 'flex', height: '100%', gap: '1px', background: 'var(--border)' }}>
      {/* Sidebar */}
      <div className="chat-sidebar" style={{ width: '240px', background: 'var(--bg-panel)', overflowY: 'auto', padding: '12px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '14px', color: 'var(--amber)', fontFamily: 'var(--mono)', margin: '0 0 6px 0' }}>
          {agents.length ? `${agents.length} Agents` : 'Agent Chat'}
        </h3>
        <p style={{ fontSize: '10px', color: 'var(--text-3)', marginBottom: '10px', lineHeight: 1.5 }}>
          {agents.length
            ? `Talk to any ${scenario.labels.populationNoun.replace(/s$/, '')} from the simulation. Each agent has persistent memory, personality, and relationships shaped by the crises they experienced.`
            : `Chat becomes available after the first turn completes. Start a simulation and come back once agents have reacted to the first crisis. Each agent has persistent memory, personality, and relationships shaped by the crises they experience.`
          }
        </p>
        {agents.map(c => (
          <button
            key={c.name}
            onClick={() => selectAgent(c.name)}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '6px',
              cursor: 'pointer', marginBottom: '4px', fontSize: '12px',
              border: selectedId === c.name ? '1px solid var(--amber)' : '1px solid transparent',
              background: selectedId === c.name ? 'var(--bg-card)' : 'transparent',
              color: 'var(--text-1)', display: 'block',
            }}
          >
            <span style={{ fontWeight: 700 }}>{c.name}</span>
            <div style={{ color: 'var(--text-3)', fontSize: '10px' }}>{c.role} {c.department}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, marginTop: '2px', color: moodColors[c.mood] || 'var(--text-3)' }}>
              {c.mood.toUpperCase()}
            </div>
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-deep)' }}>
        {/* Memory bar */}
        {selected?.memory && (selected.memory.beliefs?.length > 0 || selected.memory.stances?.length > 0) && (
          <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', fontSize: '10px' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>MEMORY </span>
            {selected.memory.beliefs?.slice(0, 2).map((b, i) => <span key={i} style={{ color: 'var(--text-2)', marginRight: '8px' }}>{b}</span>)}
            {selected.memory.stances?.map((s, i) => (
              <span key={i} style={{ color: s.value > 0 ? 'var(--green)' : 'var(--rust)', marginRight: '8px' }}>
                {s.topic}: {s.value > 0.5 ? 'confident' : s.value > 0 ? 'cautious' : 'wary'}
              </span>
            ))}
          </div>
        )}

        <div ref={messagesRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!selectedId && (
            <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: '30px 20px' }}>
              <div style={{ fontSize: '14px', marginBottom: '10px' }}>
                {agents.length ? `Select an agent to start chatting.` : 'No agents available yet.'}
              </div>
              <div style={{ fontSize: '11px', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>
                {agents.length
                  ? `Each agent is a simulated ${scenario.labels.populationNoun.replace(/s$/, '')} with a unique HEXACO personality, persistent memory of events they survived, evolving stances on topics, and relationships with other agents. Their responses reflect their actual simulation experience.`
                  : `Run a simulation from the Settings tab. Once the first turn completes, agents become available for conversation. The chat system uses each agent's personality profile, memory, and event history to generate authentic in-character responses.`
                }
              </div>
            </div>
          )}

          {/* Event context when agent is selected */}
          {selectedId && selected?.memory && (
            <EventContext memory={selected.memory} events={state} scenario={scenario} />
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ maxWidth: '80%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.name && <div style={{ fontSize: '10px', color: 'var(--amber)', fontWeight: 700, marginBottom: '4px' }}>{msg.name}</div>}
              <div style={{
                padding: '10px 14px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.6,
                background: msg.role === 'user' ? 'rgba(232,180,74,.12)' : 'var(--bg-card)',
                border: msg.role === 'user' ? '1px solid var(--amber-dim)' : '1px solid var(--border)',
                color: 'var(--text-1)',
                boxShadow: 'var(--card-shadow)',
              }}>
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing indicator while waiting on agent response */}
          {sending && selectedId && (
            <div style={{ maxWidth: '80%', alignSelf: 'flex-start' }} aria-live="polite" aria-label={`${selected?.name || 'Agent'} is typing`}>
              <div style={{ fontSize: '10px', color: 'var(--amber)', fontWeight: 700, marginBottom: '4px' }}>
                {selected?.name || selectedId}
              </div>
              <div style={{
                padding: '10px 14px', borderRadius: '8px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: 'var(--card-shadow)',
              }}>
                <span style={{ fontSize: 11, fontStyle: 'italic' }}>typing</span>
                <span className="chat-dot" style={{ animationDelay: '0ms' }}>.</span>
                <span className="chat-dot" style={{ animationDelay: '160ms' }}>.</span>
                <span className="chat-dot" style={{ animationDelay: '320ms' }}>.</span>
              </div>
              <style>{`
                @keyframes chat-dot-bounce {
                  0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
                  30%           { opacity: 1;   transform: translateY(-2px); }
                }
                .chat-dot {
                  display: inline-block;
                  font-weight: 800;
                  font-size: 14px;
                  line-height: 1;
                  color: var(--amber);
                  animation: chat-dot-bounce 1s ease-in-out infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                  .chat-dot { animation: none; opacity: 0.6; }
                }
              `}</style>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            disabled={!selectedId || sending}
            aria-label={selectedId ? `Message ${selected?.name || 'agent'}` : 'Select an agent first'}
            placeholder={selectedId ? `Ask ${selected?.name || 'agent'}...` : `Select a ${scenario.labels.populationNoun.replace(/s$/, '')} first`}
            style={{
              flex: 1, background: 'var(--bg-card)', color: 'var(--text-1)',
              border: '1px solid var(--border)', padding: '10px 14px', borderRadius: '6px',
              fontSize: '14px', fontFamily: 'var(--sans)', opacity: !selectedId ? 0.5 : 1,
            }}
          />
          <button
            onClick={send}
            disabled={!selectedId || sending || !input.trim()}
            style={{
              background: 'linear-gradient(135deg, var(--rust), #c44a1e)', color: 'white',
              border: 'none', padding: '10px 20px', borderRadius: '6px',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              opacity: (!selectedId || sending || !input.trim()) ? 0.4 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
