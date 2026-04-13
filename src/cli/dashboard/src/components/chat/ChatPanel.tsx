import { useState, useRef, useEffect, useMemo } from 'react';
import { useScenarioContext } from '../../App';
import type { GameState } from '../../hooks/useGameState';

interface ChatMessage {
  role: 'user' | 'colonist';
  name?: string;
  text: string;
}

interface ColonistInfo {
  name: string;
  role: string;
  department: string;
  mood: string;
  age?: number;
  marsborn?: boolean;
}

interface ChatPanelProps {
  state: GameState;
}

export function ChatPanel({ state }: ChatPanelProps) {
  const scenario = useScenarioContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Collect colonists from reaction events
  const colonists = useMemo(() => {
    const map = new Map<string, ColonistInfo>();
    for (const side of ['a', 'b'] as const) {
      for (const evt of state[side].events) {
        if (evt.type === 'colonist_reactions') {
          const reactions = evt.data.reactions as Array<Record<string, unknown>> || [];
          for (const r of reactions) {
            if (r.name) {
              map.set(r.name as string, {
                name: r.name as string,
                role: r.role as string || '',
                department: r.department as string || '',
                mood: r.mood as string || 'neutral',
                age: r.age as number,
                marsborn: r.marsborn as boolean,
              });
            }
          }
        }
      }
    }
    return Array.from(map.values());
  }, [state]);

  const selected = colonists.find(c => c.name === selectedId);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const selectColonist = (name: string) => {
    setSelectedId(name);
    setMessages([]);
    setHistory([]);
    const c = colonists.find(col => col.name === name);
    if (c) {
      setMessages([{
        role: 'colonist',
        name: c.name,
        text: `${c.role} in ${c.department}. Age ${c.age || '?'}. Ask me anything about life in the ${scenario.labels.settlementNoun}.`,
      }]);
    }
  };

  const send = async () => {
    if (!input.trim() || !selectedId || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);

    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    const newHistory = [...history, { role: 'user', content: msg }];
    setHistory(newHistory);

    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colonistId: selectedId, message: msg, history: newHistory }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'colonist', name: data.colonist || selectedId, text: data.reply }]);
        setHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'colonist', text: data.error || 'No response' }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'colonist', text: `Chat failed: ${err}` }]);
    }
    setSending(false);
  };

  const moodColors: Record<string, string> = {
    positive: 'var(--color-success)', negative: 'var(--color-error)', anxious: 'var(--color-warning)',
    defiant: 'var(--color-error)', hopeful: 'var(--color-success)', resigned: 'var(--text-muted)', neutral: 'var(--text-secondary)',
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 shrink-0 overflow-y-auto border-r" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
        <div className="p-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
          {colonists.length ? `${colonists.length} ${scenario.labels.populationNoun}` : `Run a simulation to chat with ${scenario.labels.populationNoun}.`}
        </div>
        {colonists.map(c => (
          <button
            key={c.name}
            onClick={() => selectColonist(c.name)}
            className="w-full text-left px-3 py-2 text-xs border-b cursor-pointer transition-colors"
            style={{
              borderColor: 'var(--border-subtle)',
              background: selectedId === c.name ? 'var(--bg-tertiary)' : 'transparent',
            }}
          >
            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
            <div style={{ color: 'var(--text-muted)' }}>{c.role} · {c.department}</div>
            <div className="text-[10px] font-bold" style={{ color: moodColors[c.mood] || 'var(--text-muted)' }}>
              {c.mood.toUpperCase()}
            </div>
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {!selectedId && (
            <div className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
              Select a {scenario.labels.populationNoun.replace(/s$/, '')} to start chatting.
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`max-w-[80%] ${msg.role === 'user' ? 'ml-auto' : 'mr-auto'}`}>
              {msg.name && (
                <div className="text-[10px] font-bold mb-0.5" style={{ color: 'var(--accent-primary)' }}>{msg.name}</div>
              )}
              <div
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-card)',
                  color: msg.role === 'user' ? 'var(--text-contrast)' : 'var(--text-primary)',
                  border: msg.role === 'colonist' ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 border-t flex gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            disabled={!selectedId || sending}
            placeholder={selectedId ? `Ask ${selected?.name || 'colonist'}...` : 'Select a colonist first'}
            className="flex-1 px-3 py-2 rounded-lg text-sm disabled:opacity-50"
            style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
          />
          <button
            onClick={send}
            disabled={!selectedId || sending || !input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent-primary)', color: 'var(--text-contrast)' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
