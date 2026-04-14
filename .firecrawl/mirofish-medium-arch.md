[Sitemap](https://medium.com/sitemap/sitemap.xml)

[Open in app](https://play.google.com/store/apps/details?id=com.medium.reader&referrer=utm_source%3DmobileNavBar&source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2F%40balajibal%2Fmirofish-multi-agent-swarm-intelligence-for-predictive-simulation-09771e60b188&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

[Medium Logo](https://medium.com/?source=post_page---top_nav_layout_nav-----------------------------------------)

Get app

[Write](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fnew-story&source=---top_nav_layout_nav-----------------------new_post_topnav------------------)

[Search](https://medium.com/search?source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2F%40balajibal%2Fmirofish-multi-agent-swarm-intelligence-for-predictive-simulation-09771e60b188&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

![](https://miro.medium.com/v2/resize:fill:32:32/1*dmbNkD5D-u45r44go_cf0g.png)

# MiroFish: Multi-Agent Swarm Intelligence for Predictive Simulation

[![balaji bal](https://miro.medium.com/v2/resize:fill:32:32/0*k-4QkwCAlzMLp_GZ.jpeg)](https://medium.com/@balajibal?source=post_page---byline--09771e60b188---------------------------------------)

[balaji bal](https://medium.com/@balajibal?source=post_page---byline--09771e60b188---------------------------------------)

Follow

12 min read

·

Mar 18, 2026

66

1

[Listen](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2Fplans%3Fdimension%3Dpost_audio_button%26postId%3D09771e60b188&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40balajibal%2Fmirofish-multi-agent-swarm-intelligence-for-predictive-simulation-09771e60b188&source=---header_actions--09771e60b188---------------------post_audio_button------------------)

Share

_A Technical Deep Dive for Software Engineers_

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:1000/1*rcqg0WIbJkRBdkorOxYTgA.png)

**MiroFish** is an open-source AI prediction engine that fundamentally reimagines how we forecast complex outcomes in high-dimensional, non-linear systems. Rather than applying statistical models to historical data, it constructs high-fidelity parallel digital worlds populated by thousands of heterogeneous AI agents, each with independent personalities, long-term memory, and behavioural logic, then runs rigorous simulations to surface emergent patterns and predict future trajectories.

For software engineers building agentic systems, MiroFish demonstrates a production-grade architecture for **emergence-based forecasting,** moving beyond single-model predictions to swarm-generated consensus grounded in knowledge graphs and persistent memory. The system has accumulated 17,000+ GitHub stars since its December 2025 release, indicating significant traction in the developer community.

This article provides a comprehensive technical examination of MiroFish’s architecture, focusing on overall system design, knowledge graph construction via GraphRAG, and memory management via [Zep Cloud](https://www.getzep.com/)— three pillars that enable scalable, grounded agent simulations. _This article is part of a series exploring agentic architectures and their supporting ecosystems in an enterprise context, based on my ongoing work as lead architect for a large enterprise AI platform._

## Demonstrated Use Cases

**Public Opinion Simulation**:

- Feed in news event (e.g., university controversy).
- Simulate how social media sentiment evolves.
- Identify key influencers, tipping points, polarization dynamics.
- Forecast which narratives gain traction.

**Financial Forecasting**:

- Inject market signals (Fed announcement, earnings report).
- Simulate trader, analyst, retail investor reactions.
- Predict market sentiment, volatility, liquidity effects.
- Stress-test scenarios (e.g., “What if earnings missed by 20%?”).

**Crisis PR Simulation**:

- Model how crisis unfolds across social media.
- Test messaging strategies before deploying.
- Identify amplifier accounts, counter-narratives.

**Policy Impact Assessment**:

- Simulate how new policy affects different stakeholder groups.
- Forecast adoption, resistance, unintended consequences.
- Identify winning coalitions, veto players.

## Part 1: Purpose and Conceptual Foundation

## The Emergence Prediction Problem

Traditional forecasting approaches fail in domains where outcomes depend on complex social dynamics, policy interactions, and feedback loops. A Fed interest rate announcement doesn’t move markets through a simple statistical function; it triggers cascading reactions: analyst commentary, retail investor sentiment shifts, algorithmic trading responses, institutional repositioning — all interacting non-linearly.

MiroFish solves this by **simulating the messy, social dynamics of the real world** using thousands of AI agents that talk, argue, persuade, and evolve — just like people do. The result is a prediction that accounts for group behaviour, social contagion, and emergent patterns that traditional models cannot capture.

## Core Innovation: Grounded Emergence

MiroFish’s key architectural insight: **emergence must be anchored to reality**. Unlike toy agent simulations that generate abstract dynamics, MiroFish grounds all agent behavior in structured knowledge extracted from seed material (news, reports, policy docs, even novels).

This prevents hallucinated drift; agents don’t invent fictional relationships; they operate within a knowledge graph reflecting the actual entities, relationships, and pressures in the input data. The simulation becomes a “digital rehearsal” of plausible futures, not speculative fiction.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:1000/1*TX3GOvsJok1oUX3HMuJ_WA.png)

## The 5-Step Prediction Pipeline

MiroFish operationalises emergence prediction through a rigorous five-step workflow:

1. **Knowledge Graph Construction**: Parse seed material, extract entities/relationships, build structured graph.
2. **Environment Setup & Agent Creation**: Generate agent personas from graph, set simulation parameters.
3. **Dual-Platform Parallel Simulation**: Run agents on two social platforms simultaneously (Twitter-like + Reddit-like).
4. **Report Generation**: Synthesise simulation outcomes into structured predictions.
5. **Deep Interaction**: Query agents, explore alternative scenarios, validate reasoning.

Each step is architecturally distinct, enabling modularity and extensibility.

## Part 2: Overall System Architecture

## Layered Design Philosophy

MiroFish employs a **decoupled, event-driven stack** with clear separation of concerns:

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:1000/1*SnK8zdLu8n-3IydLo4almw.png)

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ INGESTION LAYER                                                 │
│ Seed Input (News/Reports/Docs) → GraphRAG Parser               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ KNOWLEDGE LAYER                                                 │
│ Knowledge Graph Storage (Entities, Relations, Communities)      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ ORCHESTRATION LAYER                                             │
│ Environment Config Agent → Persona Templates → Agent Factory    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ SIMULATION LAYER                                                │
│ OASIS Engine: Parallel Agent Loops (Platform A + Platform B)   │
│ Agent State ←→ Zep Cloud (Memory Updates)                      │
│ Event Logs ← Social Actions (23 primitives)                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ ANALYSIS LAYER                                                  │
│ ReportAgent → Metrics Aggregation → Structured Predictions     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ INTERACTION LAYER                                               │
│ Vue.js Frontend → REST API → Agent/Memory Query Endpoints      │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*jbPDet2GTfMahWIPDOKXVA.png)

**Deployment**: Docker-compose (ports 3000 frontend, 5001 backend). Stateless agents + sharded memory enable horizontal scaling.

## Part 3: Knowledge Graph Construction Deep Dive

## Why GraphRAG, Not Vector Search?

Traditional RAG systems flatten documents into vectors, losing relational structure. A vector search might retrieve “Alice is CEO of TechCorp” and “TechCorp opposes regulation X” separately, requiring the LLM to synthesise relationships post-hoc.

**GraphRAG preserves structure**: entities and relationships are explicit nodes and edges, enabling agents to reason over _connected_ information. An agent can directly query “What pressures does Alice face?” and retrieve not just direct facts but transitive influences through the graph.

For agent simulations, this is critical: agents need to understand not just isolated facts but the web of dependencies driving behavior.

## Graph Construction Pipeline

### Step 1: Entity Extraction

Raw seed text → LLM chunking → Entity identification (people, orgs, events, policies, institutions).

**Challenges**:

- **Coreference resolution**: “The CEO,” “Alice,” “she” must resolve to same entity.
- **Deduplication**: Spelling variants, aliases, temporal shifts (“TechCorp” → “TechCorp Inc.”).

**Solution**: Multi-pass refinement with embedding similarity + relation overlap. Entities with >0.9 cosine similarity in embedding space + shared relations are merged.

**Output**: Canonical entity list (~100–1000 nodes for typical seeds).

### Step 2: Relation Inference

For each entity pair, prompted LLM extraction identifies directed relationships:

- `influence_of(Alice, Bob)` — Alice influences Bob's decisions.
- `opposes(TechCorp, Regulation_X)` — Institutional opposition.
- `employs(TechCorp, Alice)` — Structural hierarchy.
- `supports(Alice, Policy_Y)` — Stance alignment.

**Relation types** are domain-configurable; default set covers ~20 common patterns.

**Multi-hop reasoning**: Relations can be chained. Agent reasoning might traverse `Alice → influences → Bob → supports → Policy_Y` to infer transitive influence.

**Output**: Directed edge list with confidence scores. Edges with <0.6 LLM confidence are pruned.

### Step 3: Contextual Enrichment

Each entity/edge receives **temporal and spatial qualifiers**:

- `influence_of(Alice, Bob, temporal_scope="2025-2026")`
- `opposes(TechCorp, Regulation_X, intensity="strong")`

**Community detection** (Louvain algorithm or graph neural networks) identifies clusters:

- Tight-knit groups → agent factions.
- Boundary-spanning nodes → opinion leaders.
- Isolated clusters → separate interest groups.

**Output**: Hierarchical graph with community assignments.

### Step 4: Validation & Pruning

- **Cycle detection**: Circular reasoning patterns flagged for review.
- **Density thresholds**: Nodes with >50 edges (over-connected) may indicate extraction errors.
- **Temporal consistency**: Relations with contradictory temporal scopes are resolved.

**Final graph**: ~10–100k nodes/edges for typical seeds (news articles, policy docs). Larger seeds (novels) can yield 500k+ nodes.

## Graph as Agent Reality

The knowledge graph becomes the **ground truth** for simulation:

- **Agent personas** are seeded from high-centrality nodes (opinion leaders) and community membership.
- **Agent beliefs** are initialized from graph relations (e.g., “Alice opposes Regulation\_X” → agent stance = -0.8 on regulation axis).
- **Agent relationships** are pre-populated from graph edges (mutual follows, influence asymmetries).

This ensures agents don’t hallucinate backgrounds; they operate within a reality anchored to input data.

## Part 4: Memory Management: Zep Cloud Integration

## The Memory Problem in Agent Simulations

Stateless agents (vanilla LLM calls) reset context every turn, preventing emergent learning. An agent influenced by another’s argument in round 5 forgets it by round 10, eliminating history-dependent dynamics like polarisation and conviction shifts.

**Persistent memory solves this**: agents accumulate experience, forming stable beliefs and relationships that evolve organically.

## Zep Cloud Architecture

**Zep** is a managed vector database optimised for agent memory, providing:

- **Threaded sessions**: Per-agent namespaces. Each session = chronological message log + auto-generated summaries.
- **Semantic search**: Query agent memories by meaning (“What did Alice learn about regulation?”), not exact string match.
- **Auto-summarization**: Long histories are periodically condensed (LLM-driven) to preserve key facts while reducing token overhead.
- **Multi-session support**: Group memories (faction-level) separate from individual memories.

## Hybrid Memory Horizons

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*DIP_MV8yb5U82SSk-9JuDA.png)

**Example**: Alice’s memory after 100 simulation cycles might look like:

```
[Short-term, last 10 cycles]
- Round 95: Bob posted criticism of Regulation X
- Round 96: I responded with counter-evidence
- Round 97: Bob seemed unmoved
- Round 98: Carol supported my position
- Round 99: Faction consensus shifted toward opposition
```

```
[Long-term, summarized]
- Key belief: Regulation X is harmful (confidence: 0.85)
- Relationship with Bob: Respectful disagreement (influence: 0.3)
- Relationship with Carol: Strong alliance (influence: 0.8)
- Faction membership: Regulation-skeptics (since round 20)
- Learning trajectory: Grew more confident in opposition over time
```

## Update Protocol

After each agent action:

1. **Append observation**: “Posted argument against Regulation X; received 5 likes, 2 critical replies.”
2. **Append intent**: “Wanted to sway undecided voters; uncertain if successful.”
3. **Semantic indexing**: Zep indexes memory for future retrieval.
4. **Periodic summarization**: Every N cycles, LLM condenses long-term history (extract key beliefs, relationships, conviction shifts).

**Cost optimization**: Summarization reduces token overhead. Instead of replaying 1000 turns, agents retrieve a 500-token summary + last 20 turns.

## Impact on Dynamics

Memory creates [**hysteresis**](https://en.wikipedia.org/wiki/Hysteresis) , i.e. past events influence future behavior in non-trivial ways:

- **Polarisation waves**: Early disagreements harden into entrenched positions as agents accumulate supporting memories.
- **Conviction shifts**: Agents exposed to repeated counter-evidence gradually update beliefs (realistic learning, not instant flip-flopping).
- **Relationship evolution**: Alliances deepen or fracture based on accumulated interactions.
- **Faction coherence**: Shared memories within communities create emergent group identity.

Without memory, simulations are Markovian (memoryless); with memory, they exhibit realistic path-dependence.

## Part 5: Simulation Engine: OASIS and Agent Loops

## OASIS: Open Agent Social Interaction Simulations

[OASIS](https://github.com/camel-ai/oasis) is a peer-reviewed, open-source agent simulation framework by the CAMEL-AI research community, capable of scaling to **1 million agents**.

**Core design**: Agents execute asynchronous behavioural loops, with event-driven communication and distributed state management.

## Dual-Platform Architecture

MiroFish runs simulations on **two platforms simultaneously** (Platform A: Twitter-like, Platform B: Reddit-like) to model cross-environment dynamics:

## Get balaji bal’s stories in your inbox

Join Medium for free to get updates from this writer.

Subscribe

Subscribe

Remember me for faster sign in

**Platform A (Twitter-like)**:

- Short-form posts (280 chars analog).
- Viral mechanics: retweets, quote-tweets, trending.
- High velocity, low depth.
- Optimal for rapid sentiment cascades.

**Platform B (Reddit-like)**:

- Threaded discussions, persistent threads.
- Voting (upvote/downvote), community moderation.
- Lower velocity, higher depth.
- Optimal for reasoned debate, faction formation.

**Cross-pollination**: Agents can repost from Platform B to Platform A (and vice versa), creating bridges between communities. A Reddit thread gaining traction can seed a Twitter trend.

## Agent Action Space

Agents execute 23 distinct social actions:

- **Posting**: Create new content (short-form or threaded).
- **Replying**: Respond to existing content.
- **Reposting**: Share content (retweet, cross-post).
- **Voting**: Upvote/downvote (Platform B).
- **Following**: Add user to feed.
- **Muting/Blocking**: Filter out users.
- **Mentioning**: Tag other users.
- **Hashtag usage**: Categorize content.
- **Reaction emojis**: Express sentiment without writing.

Each action is **rate-limited** for realism (agents don’t post 1000 times/cycle).

## Agent Behavioural Loop

Each cycle, agents execute:

```
1. PERCEIVE
   - Fetch recent feed (last 20 posts from followed users)
   - Retrieve personal memory from Zep
   - Query knowledge graph for context on trending topics

2. DELIBERATE
   - LLM call: "Act as [persona] in [world]. You see these posts. What do you do?"
   - System prompt includes: personality, stance vector, goals, memory context
   - LLM outputs: action choice + reasoning + content (if posting)

3. ACT
   - Execute chosen action on platform (post, reply, repost, etc.)
   - Action logged to event stream
   - Content indexed for other agents' feeds

4. PERSIST
   - Update Zep with action + outcome (likes, replies received)
   - Update agent internal state (belief updates, relationship changes)
   - Emit events for downstream analytics
```

**Parallelism**: All agents execute loops concurrently. OASIS handles contention via async action queues and eventual consistency.

## Emergence in Action

Emergent patterns arise from dense interaction:

- **Viral cascades**: One agent posts, others repost, trend emerges as signal amplifies.
- **Echo chambers**: Agents preferentially follow like-minded peers, creating feedback loops.
- **Opinion flips**: Minority positions can shift majorities if charismatic agents advocate effectively.
- **Faction formation**: Agents with aligned beliefs cluster, creating polarisation.
- **Influence hierarchies**: High-follower agents disproportionately shape discourse.

These patterns are **not programmed**; they emerge from agent interactions grounded in knowledge graph structure and memory evolution.

## Part 6: Report Generation and Analysis

## ReportAgent: Synthesis Layer

After simulation concludes, a dedicated **ReportAgent** (another LLM instance) analyses the outcome:

**Inputs**:

- Final agent states (belief distributions, relationship graphs, faction assignments).
- Event logs (all 10,000+ actions taken across simulation).
- Prediction query (“How will markets react to Fed announcement?”).
- Metrics tracked during simulation (sentiment polarity, faction cohesion, information spread).

**Process**:

1. Aggregate agent beliefs into population-level distributions.
2. Identify key events that shifted sentiment (e.g., “Round 47: Influential agent posted criticism, swaying 200 followers”).
3. Trace causal chains: Which relationships/events led to final outcome?
4. Generate narrative summary: “Markets shifted bearish due to X, Y, Z factors.”
5. Quantify uncertainty: “Outcome confidence: 0.72” (based on variance in agent beliefs).

**Output**: Structured report with:

- Executive summary (1–2 paragraphs).
- Detailed trajectory (how outcome emerged over time).
- Key influencers (agents/events driving change).
- Alternative scenarios (sensitivity analysis).
- Confidence intervals.

## Deep Interaction: Post-Hoc Interrogation

Users can query the simulation post-hoc:

**Agent queries**:

- “Why did Alice flip her stance in round 50?” → Routes to Alice’s memory, retrieves decision context.
- “What would Bob have done if Carol hadn’t posted on round 30?” → Re-runs sub-simulation with intervention.

**Scenario injection**:

- “What if Regulation X was stricter?” → Modify graph, re-run simulation.
- “What if Alice was more influential?” → Adjust agent parameters, re-run.

This enables **sensitivity analysis**: understand which inputs most affect outcomes.

## Part 7: Scalability, Performance, and Limitations

## Scalability Characteristics

**Horizontal scaling**: Stateless agents + sharded Zep memory enable distributed execution across multiple machines.

**Vertical scaling**: OASIS can handle 1M agents on a single multi-GPU machine, but LLM throughput becomes bottleneck (inference latency, API rate limits).

**Typical performance**:

- 100 agents, 100 cycles: ~10–30 minutes (depends on LLM).
- 1,000 agents, 100 cycles: ~2–4 hours.
- 10,000 agents, 50 cycles: ~20–40 hours (or scale across multiple machines).

**Cost**: LLM API calls dominate. 1,000 agents × 100 cycles × 1 call/cycle = 100k LLM calls. At $0.01/call (Qwen-plus), ~$1,000 per simulation.

## Limitations

**Acknowledged by creators**:

1. **Not a crystal ball**: Simulations illustrate _plausible_ scenarios, not probability estimates. No published benchmarks comparing predictions to actual outcomes.
2. **LLM biases propagate**: Research shows LLM agents are _more_ susceptible to herd behavior than real humans. Simulated crowds polarize faster than real ones.
3. **Knowledge graph quality bounds realism**: Garbage in, garbage out. Poor seed material → poor graph → unrealistic simulations.
4. **Compute-intensive**: Running hundreds of agents through multiple rounds costs money and time. Prototype simulations recommended.
5. **Early-stage product**: v0.1.0 released December 2025. Still maturing; API/architecture may shift.

## Mitigation Strategies

- **Start small**: Prototype with <40 agents, <50 cycles before scaling.
- **Validate graphs**: Manually inspect knowledge graphs for errors before simulation.
- **Use cheaper LLMs**: Qwen-plus significantly cheaper than GPT-4; quality still strong.
- **Hybrid human-in-loop**: Inject human-generated scenarios/facts to ground simulations.

## Part 8: Architectural Insights for Engineers

## Key Design Patterns

**1\. Separation of Concerns**

- Knowledge layer (graph) independent of simulation layer (agents).
- Agents don’t modify graph; they operate within it.
- Enables swapping components (different KG sources, different sim engines).

**2\. Event Sourcing**

- All agent actions logged as immutable events.
- Enables replay, debugging, sensitivity analysis.
- Supports audit trails for predictions.

**3\. Hierarchical Retrieval**

- GraphRAG’s multi-level summaries (global, local, motif) reduce context window requirements.
- Agents retrieve relevant subgraph, not entire graph.
- Scales to 100k+ node graphs.

**4\. Memory as State**

- Zep Cloud is source of truth for agent state.
- Enables agent restart/recovery without losing history.
- Supports distributed agent execution (agents can move between machines, resume from Zep).

**5\. Async/Concurrent Execution**

- Agent loops run in parallel; no global synchronization.
- OASIS handles race conditions via eventual consistency.
- Scales to thousands of agents on single machine.

## Integration Points for Custom Extensions

MiroFish’s modular design enables extensions:

- **Custom LLMs**: Any OpenAI SDK-compatible model (Claude, Llama, custom fine-tuned models).
- **Custom actions**: Define domain-specific social actions (e.g., “propose\_legislation” for policy simulations).
- **Custom KG sources**: Plug in different entity/relation extractors (e.g., domain-specific NER models).
- **Custom memory backends**: Replace Zep with alternative vector DB (Pinecone, Weaviate).
- **Custom analysis**: Extend ReportAgent with domain-specific metrics.

## Conclusion

MiroFish demonstrates how to build **scalable, grounded agent simulations** that produce emergent predictions rooted in real data.

For software engineers, the key insights are:

1. **Knowledge graphs are essential anchors** for agent realism. Ungrounded agents hallucinate; graph-grounded agents operate within structured reality.
2. **Persistent memory is non-negotiable** for emergence. Stateless agents reset every turn; memory-equipped agents exhibit realistic learning, polarisation, conviction shifts.
3. **Parallel simulation scales to production**: OASIS demonstrates 1M-agent scalability. Distributed execution via event sourcing and eventual consistency enables horizontal scaling.
4. **Modular architecture enables extensibility**: Swappable KG sources, LLMs, memory backends, and custom actions allow domain-specific customisation.
5. **Emergence is not magic**: It’s the inevitable result of heterogeneous agents with memory interacting densely over a structured knowledge space.

MiroFish is still v0.1.0, but it provides a blueprint for next-generation prediction systems. As the codebase matures and benchmarks emerge, expect widespread adoption in forecasting, policy analysis, and financial modelling.

## References

YouTube. “The ‘Predict Anything’ Swarm Intelligence AI Engine.” [https://www.youtube.com/watch?v=p2EY0PqwxGg](https://www.youtube.com/watch?v=p2EY0PqwxGg)

Dev.to. “MiroFish: The Open-Source AI Engine That Builds Digital Worlds to Predict the Future.” [https://dev.to/arshtechpro/mirofish-the-open-source-ai-engine-that-builds-digital-worlds-to-predict-the-future-ki8](https://dev.to/arshtechpro/mirofish-the-open-source-ai-engine-that-builds-digital-worlds-to-predict-the-future-ki8)

GitHub. “666ghj/MiroFish: A Simple and Universal Swarm Intelligence Prediction Engine.” [https://github.com/666ghj/MiroFish](https://github.com/666ghj/MiroFish)

YouTube. “MiroFish: The First Open Source Swarm Intelligence Digital World.” [https://www.youtube.com/watch?v=5SSGximONlY](https://www.youtube.com/watch?v=5SSGximONlY)

YouTube. “MiroFish: Engineering the AI Harness.” [https://www.youtube.com/watch?v=UN5KqnfMO\_I](https://www.youtube.com/watch?v=UN5KqnfMO_I)

Moneycontrol. “‘Scarily accurate’: Open-source AI engine predicts markets and public opinion using thousands of digital agents.” [https://www.moneycontrol.com/news/trends/scarily-accurate-open-source-ai-engine-predicts-markets-and-public-opinion-using-thousands-of-digital-agents-13858961.html](https://www.moneycontrol.com/news/trends/scarily-accurate-open-source-ai-engine-predicts-markets-and-public-opinion-using-thousands-of-digital-agents-13858961.html)

[AI](https://medium.com/tag/ai?source=post_page-----09771e60b188---------------------------------------)

[AI Agent](https://medium.com/tag/ai-agent?source=post_page-----09771e60b188---------------------------------------)

[Simulation](https://medium.com/tag/simulation?source=post_page-----09771e60b188---------------------------------------)

[Prediction Markets](https://medium.com/tag/prediction-markets?source=post_page-----09771e60b188---------------------------------------)

[Headgym](https://medium.com/tag/headgym?source=post_page-----09771e60b188---------------------------------------)

66

66

1

[![balaji bal](https://miro.medium.com/v2/resize:fill:48:48/0*k-4QkwCAlzMLp_GZ.jpeg)](https://medium.com/@balajibal?source=post_page---post_author_info--09771e60b188---------------------------------------)

[![balaji bal](https://miro.medium.com/v2/resize:fill:64:64/0*k-4QkwCAlzMLp_GZ.jpeg)](https://medium.com/@balajibal?source=post_page---post_author_info--09771e60b188---------------------------------------)

Follow

[**Written by balaji bal**](https://medium.com/@balajibal?source=post_page---post_author_info--09771e60b188---------------------------------------)

[498 followers](https://medium.com/@balajibal/followers?source=post_page---post_author_info--09771e60b188---------------------------------------)

· [512 following](https://medium.com/@balajibal/following?source=post_page---post_author_info--09771e60b188---------------------------------------)

Founder @ [HeadGym.com](http://headgym.com/) where we are building The AI Workspace. I write mainly about Applied AI, Software Architecture and DevOps.

Follow

## Responses (1)

![](https://miro.medium.com/v2/resize:fill:32:32/1*dmbNkD5D-u45r44go_cf0g.png)

Write a response

[What are your thoughts?](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40balajibal%2Fmirofish-multi-agent-swarm-intelligence-for-predictive-simulation-09771e60b188&source=---post_responses--09771e60b188---------------------respond_sidebar------------------)

Cancel

Respond

[![Nicolò Boschi](https://miro.medium.com/v2/resize:fill:32:32/1*3-lZPmCP1mHJ5xBUqnbVnw.jpeg)](https://medium.com/@nicoloboschi?source=post_page---post_responses--09771e60b188----0-----------------------------------)

[Nicolò Boschi](https://medium.com/@nicoloboschi?source=post_page---post_responses--09771e60b188----0-----------------------------------)

[Mar 24](https://medium.com/@nicoloboschi/the-mirofish-architecture-looks-comprehensive-especially-the-zep-cloud-integration-for-memory-91724d627258?source=post_page---post_responses--09771e60b188----0-----------------------------------)

```
The MiroFish architecture looks comprehensive, especially the Zep Cloud integration for memory. How are you handling the challenge of knowledge decay over long simulation runs? For agent simulations requiring robust memory, consider Hindsight, the open-source memory system:

https://github.com/vectorize-io/hindsight
```

5

1 reply

Reply

## More from balaji bal

![Palantir’s Real Secret Sauce — Ontologies](https://miro.medium.com/v2/resize:fit:679/format:webp/1*MjQ58uKsgCrjrw9HiFgY8Q.png)

[![balaji bal](https://miro.medium.com/v2/resize:fill:20:20/0*k-4QkwCAlzMLp_GZ.jpeg)](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188----0---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[balaji bal](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188----0---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[**Palantir’s Real Secret Sauce — Ontologies**\\
\\
**For more than a decade, the big data industry has obsessed over the same set of problems: data quality, data governance, lineage, catalogs…**](https://medium.com/@balajibal/palantirs-real-secret-sauce-ontologies-15419c03ec3b?source=post_page---author_recirc--09771e60b188----0---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

Mar 25

[A clap icon58](https://medium.com/@balajibal/palantirs-real-secret-sauce-ontologies-15419c03ec3b?source=post_page---author_recirc--09771e60b188----0---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

![Temporal Knowledge Graphs in Banking: From Static Truth to Living Financial Memory](https://miro.medium.com/v2/resize:fit:679/format:webp/1*bjErAj0xG3KdpY9GhAwysw.png)

[![balaji bal](https://miro.medium.com/v2/resize:fill:20:20/0*k-4QkwCAlzMLp_GZ.jpeg)](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188----1---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[balaji bal](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188----1---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[**Temporal Knowledge Graphs in Banking: From Static Truth to Living Financial Memory**\\
\\
**Temporal truth is not optional in banking. It is the ground truth.**](https://medium.com/@balajibal/temporal-knowledge-graphs-in-banking-from-static-truth-to-living-financial-memory-4c6026514926?source=post_page---author_recirc--09771e60b188----1---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

Mar 20

[A clap icon57](https://medium.com/@balajibal/temporal-knowledge-graphs-in-banking-from-static-truth-to-living-financial-memory-4c6026514926?source=post_page---author_recirc--09771e60b188----1---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

![Understanding Palantir: Forward‑Deployed Engineers and the Making of an Unusual Platform Company](https://miro.medium.com/v2/resize:fit:679/format:webp/1*V3fTlAEMi3xsUR20-OiSUA.png)

[![balaji bal](https://miro.medium.com/v2/resize:fill:20:20/0*k-4QkwCAlzMLp_GZ.jpeg)](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188----2---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[balaji bal](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188----2---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[**Understanding Palantir: Forward‑Deployed Engineers and the Making of an Unusual Platform Company**\\
\\
**For nearly two decades, Palantir has been one of the most polarizing companies in enterprise software. To supporters, it is a…**](https://medium.com/@balajibal/understanding-palantir-forward-deployed-engineers-and-the-making-of-an-unusual-platform-company-494dc7812f24?source=post_page---author_recirc--09771e60b188----2---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

Mar 23

[A clap icon51\\
\\
A response icon1](https://medium.com/@balajibal/understanding-palantir-forward-deployed-engineers-and-the-making-of-an-unusual-platform-company-494dc7812f24?source=post_page---author_recirc--09771e60b188----2---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

![Agentic Harnesses: The New Infrastructure Layer for AI Systems?](https://miro.medium.com/v2/resize:fit:679/format:webp/1*B7Ew33zMqYY7B7TxTomb5Q.png)

[![balaji bal](https://miro.medium.com/v2/resize:fill:20:20/0*k-4QkwCAlzMLp_GZ.jpeg)](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188----3---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[balaji bal](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188----3---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[**Agentic Harnesses: The New Infrastructure Layer for AI Systems?**\\
\\
**As the agentic harness becomes buzzworthy , the more important question is what it means to treat it as infrastructure.**](https://medium.com/@balajibal/agentic-harnesses-the-new-infrastructure-layer-for-ai-systems-3939c6fac1a6?source=post_page---author_recirc--09771e60b188----3---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

Apr 5

[A clap icon51](https://medium.com/@balajibal/agentic-harnesses-the-new-infrastructure-layer-for-ai-systems-3939c6fac1a6?source=post_page---author_recirc--09771e60b188----3---------------------c0290bd7_e51c_415c_8dba_d6ad2bfc92f9--------------)

[See all from balaji bal](https://medium.com/@balajibal?source=post_page---author_recirc--09771e60b188---------------------------------------)

## Recommended from Medium

![I Tested All 4 Gemma 4 Models: The 26B One Is Cheating (In the Best Way)](https://miro.medium.com/v2/resize:fit:679/format:webp/1*MngCWNqll3gLR9roJViGpw.png)

[![Towards AI](https://miro.medium.com/v2/resize:fill:20:20/1*JyIThO-cLjlChQLb6kSlVQ.png)](https://medium.com/towards-artificial-intelligence?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

In

[Towards AI](https://medium.com/towards-artificial-intelligence?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

by

[Chew Loong Nian](https://medium.com/@chewloongnian?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[**I Tested All 4 Gemma 4 Models: The 26B One Is Cheating (In the Best Way)**\\
\\
**Google dropped Gemma 4 this week under Apache 2.0 — free to use, free to commercialize, no strings attached. Four model sizes landed at…**](https://medium.com/towards-artificial-intelligence/i-tested-all-4-gemma-4-models-the-26b-one-is-cheating-in-the-best-way-744e40d90d37?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

Apr 4

[A clap icon145\\
\\
A response icon1](https://medium.com/towards-artificial-intelligence/i-tested-all-4-gemma-4-models-the-26b-one-is-cheating-in-the-best-way-744e40d90d37?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

![I Turned Andrej Karpathy’s Autoresearch Into a Universal Skill](https://miro.medium.com/v2/resize:fit:679/format:webp/1*R6wdFIZKoSuR1l1dNgttMQ.png)

[![Balu Kosuri](https://miro.medium.com/v2/resize:fill:20:20/1*8PS5vEDRlh41uAjCPGvUQg.jpeg)](https://medium.com/@k.balu124?source=post_page---read_next_recirc--09771e60b188----1---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[Balu Kosuri](https://medium.com/@k.balu124?source=post_page---read_next_recirc--09771e60b188----1---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[**I Turned Andrej Karpathy’s Autoresearch Into a Universal Skill**\\
\\
**By Balasubramanyam Kosuri**](https://medium.com/@k.balu124/i-turned-andrej-karpathys-autoresearch-into-a-universal-skill-1cb3d44fc669?source=post_page---read_next_recirc--09771e60b188----1---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

Mar 21

[A clap icon370\\
\\
A response icon5](https://medium.com/@k.balu124/i-turned-andrej-karpathys-autoresearch-into-a-universal-skill-1cb3d44fc669?source=post_page---read_next_recirc--09771e60b188----1---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

![A quiet shift in power: Qwen’s open-source AI core emerges from the shadows, challenging the dominance of closed corporate models.](https://miro.medium.com/v2/resize:fit:679/format:webp/1*Xi5NxKh9VaV79bx6OyJ6dg.png)

[![Suleiman Tawil](https://miro.medium.com/v2/resize:fill:20:20/1*oej3hyYVseQigyP7zGqFAQ.png)](https://medium.com/@stawils?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[Suleiman Tawil](https://medium.com/@stawils?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[**Qwen Just Quietly Became the Most Dangerous Open-Source AI Model**\\
\\
**The most-downloaded AI model family on Earth was built by a small team with fewer resources than its competitors. Then Alibaba restructured…**](https://medium.com/@stawils/qwen-just-quietly-became-the-most-dangerous-open-source-ai-model-b5bcf7b2743c?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

Mar 31

[A clap icon1.7K\\
\\
A response icon49](https://medium.com/@stawils/qwen-just-quietly-became-the-most-dangerous-open-source-ai-model-b5bcf7b2743c?source=post_page---read_next_recirc--09771e60b188----0---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

![TurboQuant: Local Agent Swarms with 4M-Token Context on $5K Desktop](https://miro.medium.com/v2/resize:fit:679/format:webp/0*eLGv86U-KkLCcmQu)

[![Agent Native](https://miro.medium.com/v2/resize:fill:20:20/1*dt5tcaKMBhB6JboQ9lIEAA.jpeg)](https://medium.com/@agentnativedev?source=post_page---read_next_recirc--09771e60b188----1---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[Agent Native](https://medium.com/@agentnativedev?source=post_page---read_next_recirc--09771e60b188----1---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[**TurboQuant: Local Agent Swarms with 4M-Token Context on $5K Desktop**\\
\\
**Multi-agent system that previously required three separate API subscriptions running at $200/month each can now run on a single…**](https://medium.com/@agentnativedev/turboquant-local-agent-swarms-with-4m-token-context-on-5k-desktop-cc6627666e4a?source=post_page---read_next_recirc--09771e60b188----1---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

Mar 25

[A clap icon258\\
\\
A response icon4](https://medium.com/@agentnativedev/turboquant-local-agent-swarms-with-4m-token-context-on-5k-desktop-cc6627666e4a?source=post_page---read_next_recirc--09771e60b188----1---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

![Don’t Fall for the Viral Clawdbot Polymarket Arbitrage Setup](https://miro.medium.com/v2/resize:fit:679/format:webp/1*AC0OHMzOLUrDA1v-tcRKKg.png)

[![Coding Nexus](https://miro.medium.com/v2/resize:fill:20:20/1*KCZtO6-wFqmTaMmbTMicbw.png)](https://medium.com/coding-nexus?source=post_page---read_next_recirc--09771e60b188----2---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

In

[Coding Nexus](https://medium.com/coding-nexus?source=post_page---read_next_recirc--09771e60b188----2---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

by

[Jatin Prasad](https://medium.com/@dheerdharbaba?source=post_page---read_next_recirc--09771e60b188----2---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[**Don’t Fall for the Viral Clawdbot Polymarket Arbitrage Setup**\\
\\
**Before you run a dedicated machine and wire USDC into Polymarket, Read this**](https://medium.com/coding-nexus/dont-fall-for-the-viral-clawdbot-polymarket-arbitrage-setup-ba00c31d3d68?source=post_page---read_next_recirc--09771e60b188----2---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

Feb 18

[A clap icon15\\
\\
A response icon2](https://medium.com/coding-nexus/dont-fall-for-the-viral-clawdbot-polymarket-arbitrage-setup-ba00c31d3d68?source=post_page---read_next_recirc--09771e60b188----2---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

![Hunting for Mispriced Options: Building an Arbitrage Volatility Bot with Interactive Brokers](https://miro.medium.com/v2/resize:fit:679/format:webp/1*5zptnXDH7hkc08ppGDjTQQ.png)

[![DataDrivenInvestor](https://miro.medium.com/v2/resize:fill:20:20/1*2mBCfRUpdSYRuf9EKnhTDQ.png)](https://medium.com/datadriveninvestor?source=post_page---read_next_recirc--09771e60b188----3---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

In

[DataDrivenInvestor](https://medium.com/datadriveninvestor?source=post_page---read_next_recirc--09771e60b188----3---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

by

[Pavel Zapolskii](https://medium.com/@pavel.zapolskii?source=post_page---read_next_recirc--09771e60b188----3---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[**Hunting for Mispriced Options: Building an Arbitrage Volatility Bot with Interactive Brokers**\\
\\
**Or: How I Built a Robot to Collect Gold’s Crumbs from Wall Street’s Table**](https://medium.com/datadriveninvestor/hunting-for-mispriced-options-building-an-arbitrage-volatility-bot-with-interactive-brokers-7d178ed02def?source=post_page---read_next_recirc--09771e60b188----3---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

Feb 9

[A clap icon355\\
\\
A response icon6](https://medium.com/datadriveninvestor/hunting-for-mispriced-options-building-an-arbitrage-volatility-bot-with-interactive-brokers-7d178ed02def?source=post_page---read_next_recirc--09771e60b188----3---------------------cc7edbd8_9aa2_45ff_8957_e3acf0d9e591--------------)

[See more recommendations](https://medium.com/?source=post_page---read_next_recirc--09771e60b188---------------------------------------)

[Help](https://help.medium.com/hc/en-us?source=post_page-----09771e60b188---------------------------------------)

[Status](https://status.medium.com/?source=post_page-----09771e60b188---------------------------------------)

[About](https://medium.com/about?autoplay=1&source=post_page-----09771e60b188---------------------------------------)

[Careers](https://medium.com/jobs-at-medium/work-at-medium-959d1a85284e?source=post_page-----09771e60b188---------------------------------------)

[Press](mailto:pressinquiries@medium.com)

[Blog](https://blog.medium.com/?source=post_page-----09771e60b188---------------------------------------)

[Privacy](https://policy.medium.com/medium-privacy-policy-f03bf92035c9?source=post_page-----09771e60b188---------------------------------------)

[Rules](https://policy.medium.com/medium-rules-30e5502c4eb4?source=post_page-----09771e60b188---------------------------------------)

[Terms](https://policy.medium.com/medium-terms-of-service-9db0094a1e0f?source=post_page-----09771e60b188---------------------------------------)

[Text to speech](https://speechify.com/medium?source=post_page-----09771e60b188---------------------------------------)

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**

StripeM-Inner