import { useScenarioContext } from '../../App';

interface FaqItem {
  q: string;
  a: string;
}

const FAQ: FaqItem[] = [
  {
    q: 'What is Paracosm?',
    a: 'Paracosm is a scenario-driven multi-agent simulation engine. You define a ScenarioPackage describing your world (departments, metrics, crises, progression hooks, research citations), and the engine runs it with emergent AI crisis generation, multi-agent analysis, runtime tool forging, HEXACO personality drift, and deterministic state transitions.',
  },
  {
    q: 'How does the simulation work?',
    a: 'Two AI commanders with distinct HEXACO personality profiles lead the same settlement through a series of turns. Each turn: a Crisis Director generates a crisis based on colony state and decision history, department agents analyze and forge computational tools, the commander decides, and the deterministic kernel applies the outcome. Same seed, same starting conditions, different personalities, different civilizations.',
  },
  {
    q: 'What is the Crisis Director?',
    a: 'The Crisis Director is an LLM agent that observes colony state, resource levels, population, morale, decision history, and tool intelligence from previous turns. It generates unique crises per timeline that test weaknesses, exploit consequences of prior decisions, and escalate over time. No two runs play the same way.',
  },
  {
    q: 'What is runtime tool forging?',
    a: 'Department agents create computational tools on the fly: radiation dose calculators, food security projectors, structural analyzers, morale prediction models. Each tool is sandboxed in an isolated V8 environment, reviewed by an LLM-as-judge for safety and correctness, and produces real computed output that influences decisions. Nobody pre-programmed these tools.',
  },
  {
    q: 'What is HEXACO personality?',
    a: 'HEXACO is a six-factor personality model: Honesty-Humility, Emotionality, Extraversion, Agreeableness, Conscientiousness, and Openness to Experience. Each commander and promoted department head has a HEXACO profile that influences their decisions. Traits drift over time through leader pull (convergence toward the commander), role pull (department activates specific traits), and outcome pull (success/failure reinforces behaviors).',
  },
  {
    q: 'What scenarios are available?',
    a: 'Mars Genesis (100-colonist Mars colony over 50 years) is the flagship. Lunar Outpost (50-person crew at the lunar south pole) proves the engine works with different departments, progression, and milestones. The engine supports any closed-state, turn-based settlement simulation: Antarctic stations, orbital habitats, submarine habitats, generation ships.',
  },
  {
    q: 'Is the simulation deterministic?',
    a: 'The kernel is fully deterministic. Same seed produces the same colonist roster, births, deaths, and promotions via a seeded PRNG (Mulberry32). The divergence comes entirely from AI-driven decisions: different commanders make different choices, which the Crisis Director responds to with different crises.',
  },
  {
    q: 'Can I create my own scenario?',
    a: 'Yes. Define a ScenarioPackage with your world (departments, metrics, crises, progression hooks, research citations) and pass it to runSimulation(). See src/engine/_template/ for starter files. The engine runs any scenario that satisfies the ScenarioPackage interface without editing engine code.',
  },
  {
    q: 'What is AgentOS?',
    a: 'AgentOS is the open-source TypeScript runtime that powers Paracosm. It provides the agent() function, generateText(), EmergentCapabilityEngine for tool forging, EmergentJudge for safety review, and AgentMemory for semantic research retrieval. Paracosm is built entirely on the AgentOS API.',
  },
  {
    q: 'What LLM providers are supported?',
    a: 'OpenAI (GPT-5.4, GPT-5.4-mini) and Anthropic (Claude Sonnet 4.6, Claude Haiku 4.5) are supported. Different models can be assigned to different roles: commander, departments, judge, and crisis director. The simulation adapts its API calls to whichever provider you configure.',
  },
];

export function AboutPage() {
  const scenario = useScenarioContext();

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold mb-2" style={{ color: 'var(--text-primary)' }}>
            Paracosm
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Closed-state, turn-based settlement simulation engine with emergent crises, runtime tool forging,
            HEXACO personality evolution, and a deterministic kernel. Currently running: <strong style={{ color: 'var(--accent-primary)' }}>{scenario.labels.name}</strong>.
          </p>
        </div>

        {/* How it works */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: '🎯', title: 'Crisis Director', desc: 'AI generates unique crises per timeline based on colony state, decision history, and tool intelligence.' },
              { icon: '🔧', title: 'Tool Forging', desc: 'Department agents create computational tools at runtime. An LLM judge reviews each for safety and correctness.' },
              { icon: '🧬', title: 'Personality Drift', desc: 'HEXACO traits evolve through leader pull, role activation, and outcome reinforcement over the simulation.' },
              { icon: '⚙️', title: 'Deterministic Kernel', desc: 'Seeded PRNG ensures reproducibility. Same seed, same roster. Only AI decisions create divergence.' },
            ].map(item => (
              <div key={item.title} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-xl mb-2">{item.icon}</div>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Enterprise banner */}
        <section className="mb-8">
          <div
            className="rounded-xl p-6"
            style={{
              background: 'linear-gradient(135deg, var(--bg-card), var(--bg-elevated))',
              border: '1px solid var(--border-interactive)',
              boxShadow: '0 0 30px rgba(99, 102, 241, 0.1)',
            }}
          >
            <div className="text-[10px] font-extrabold tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--accent-primary)' }}>
              Coming Soon
            </div>
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Paracosm Enterprise
            </h3>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
              An enterprise-grade backend and advanced administrative UI designed to support hundreds of concurrent simulations
              with analytics dashboards, cost tracking, and reproducible experiment manifests. Advanced scenario presets for
              geopolitical conflict, government policy, technology markets, economic forecasting, business acquisition modeling,
              consumer behavior prediction, and more.
            </p>
            <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>
              Run batch experiments across scenario variants. Compare outcomes with statistical rigor.
              Export structured data for downstream analysis. Full API access for programmatic integration.
            </p>
            <a
              href="mailto:team@frame.dev?subject=Paracosm Enterprise Inquiry"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={{ background: 'var(--accent-primary)', color: 'var(--text-contrast)' }}
            >
              Contact team@frame.dev for collaborations and early access
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Frequently Asked Questions</h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => (
              <details key={i} className="rounded-lg group" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                <summary className="px-4 py-3 text-sm font-semibold cursor-pointer select-none" style={{ color: 'var(--text-primary)' }}>
                  {item.q}
                </summary>
                <div className="px-4 pb-4 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Tech stack */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Technology</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {[
              { label: 'Runtime', value: 'AgentOS (TypeScript)' },
              { label: 'Package', value: 'npm: paracosm' },
              { label: 'License', value: 'Apache-2.0' },
              { label: 'Kernel', value: 'Deterministic (Mulberry32)' },
              { label: 'Personality', value: 'HEXACO six-factor' },
              { label: 'Tool Forging', value: 'Sandboxed V8 + LLM Judge' },
              { label: 'Research', value: 'DOI-linked semantic recall' },
              { label: 'Providers', value: 'OpenAI, Anthropic' },
              { label: 'Dashboard', value: 'React + Vite + Tailwind' },
            ].map(item => (
              <div key={item.label} className="px-3 py-2 rounded" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="font-bold" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
                <div style={{ color: 'var(--text-primary)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Links */}
        <section className="mb-4">
          <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Links</h2>
          <div className="flex gap-4 text-sm flex-wrap">
            <a href="https://agentos.sh" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>agentos.sh</a>
            <a href="https://docs.agentos.sh" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>Documentation</a>
            <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>GitHub</a>
            <a href="https://github.com/framersai/agentos" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>AgentOS GitHub</a>
            <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>npm</a>
            <a href="https://frame.dev" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>Frame.dev</a>
            <a href="https://manic.agency" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>Manic Agency</a>
            <a href="https://wilds.ai/discord" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>Discord</a>
            <a href="mailto:team@frame.dev" style={{ color: 'var(--accent-primary)' }}>team@frame.dev</a>
          </div>
        </section>
      </div>
    </div>
  );
}
