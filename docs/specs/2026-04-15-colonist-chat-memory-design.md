# Colonist Chat Memory System

**Date:** 2026-04-15
**Status:** Approved

## Problem

The `/chat` endpoint uses raw `generateText()` with 6 messages of history pasted into a prompt. Colonists contradict themselves, forget what they said, and ignore their HEXACO personality traits. There is no memory, no vector search, no self-consistency enforcement.

## Solution

Replace the raw LLM call with AgentOS `agent()` instances that use the full cognitive memory architecture: episodic memory, HEXACO personality modulation, conversation history management, and RAG retrieval.

## Architecture

### Per-Colonist Agent

Each colonist gets a real `agent()` instance on first chat interaction (lazy init):

```typescript
const colonistAgent = agent({
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
  name: colonist.name,
  instructions: buildColonistInstructions(colonist, simData),
  personality: colonist.hexaco,
  memory: { enabled: true },
  memoryProvider: await AgentMemory.sqlite({ path: ':memory:' }),
});
```

AgentOS handles automatically:
- Full conversation history across `session.send()` calls
- `memory.getContext()` before each turn (RAG retrieval of relevant past statements)
- `memory.observe()` after each turn (stores what was said into episodic memory)
- HEXACO personality modulates retrieval bias and response style

### Memory Seeding

Before the first chat message, the colonist's agent memory is seeded with simulation data:

1. **Personal reactions** (all turns): quotes, moods, turn context
2. **Crises witnessed**: crisis titles, descriptions, categories
3. **Department reports**: summaries from departments the colonist worked in
4. **Commander decisions**: what the commander decided and the outcome
5. **Colony state changes**: population, morale, key metrics per turn

Each entry is stored via `memory.remember()` with appropriate tags. The vector store enables semantic retrieval: when the user asks about "dust storms," the agent retrieves the colonist's reaction to the dust crisis, the engineering department's analysis, and the commander's decision.

### Agent Pool

```
Map<agentId, { agent: Agent, session: Session, lastUsed: number }>
```

- Created on first chat message (~2-3s init)
- Reused for subsequent messages (instant)
- LRU eviction when pool exceeds 10 agents
- Agents are in-memory only (`:memory:` SQLite), destroyed on eviction

### System Prompt

The colonist's system prompt includes:
- Name, age, birthplace (Earth/Mars), role, department, specialization
- HEXACO trait descriptions mapped to behavioral tendencies
- Explicit instruction: "You are this person. Stay in character. Reference your actual simulation experiences. Do not contradict yourself."
- Colony context: settlement name, population, current year

The simulation data is NOT in the system prompt. It lives in memory and gets retrieved via RAG when relevant to the user's question.

### API

`POST /chat` request body unchanged:
```json
{
  "agentId": "colonist-id-or-name",
  "message": "What happened during the dust storm?",
  "history": []  // ignored, agent manages its own history
}
```

Response adds memory metadata:
```json
{
  "reply": "...",
  "colonist": "Tariq Okafor",
  "memoryRetrieved": 3,
  "firstMessage": false
}
```

The `history` field in the request is now ignored since the agent maintains its own conversation state. Kept in the interface for backward compatibility.

### UI Documentation

The chat panel shows a brief loading state on first message: "Initializing colonist memory (2-3 seconds)..." with a note in the FAQ/About explaining lazy initialization.

## What AgentOS Provides (Zero Custom Code)

| Capability | AgentOS Component | Manual Code Needed |
|-----------|-------------------|-------------------|
| Conversation history | `session.send()` auto-manages messages array | None |
| Self-consistency | Full history sent to LLM every turn | None |
| Memory storage | `memory.observe()` after each turn | None |
| Memory retrieval | `memory.getContext()` before each turn (RAG) | None |
| Personality modulation | HEXACO traits bias retrieval and response | None |
| Vector search | In-memory SQLite vector store | None |
| Memory seeding | `memory.remember()` for sim data | Seed loop only |
