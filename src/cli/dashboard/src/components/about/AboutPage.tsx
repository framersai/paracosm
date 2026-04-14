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
    q: 'How much does Paracosm cost?',
    a: 'The core engine, Mars Genesis and Lunar Outpost scenarios, CLI, dashboard, and batch runner are free and open source under the Apache-2.0 license. Pro ($49/mo) adds the Scenario Compiler, hosted dashboard, persistent run history, and API access. Enterprise ($499/mo) adds private deployment, custom scenario authoring studio, SSO, audit trails, and SLA. All paid tiers are coming soon.',
  },
  {
    q: 'What is the Scenario Compiler?',
    a: 'The Scenario Compiler takes a JSON file describing your world and generates all runtime hooks via LLM calls. No TypeScript required. Define departments, metrics, crisis categories, and effects in JSON. The compiler generates progression hooks, Crisis Director instructions, milestone crises, fingerprint classification, politics deltas, and reaction context. Costs approximately $0.10 per compile, cached after first generation.',
  },
  {
    q: 'How many simulations can I run?',
    a: 'There is no limit. The open-source engine runs locally on a single process. The batch runner executes multiple scenarios and seeds in sequence. Enterprise supports hundreds of concurrent simulations with orchestration, cost tracking, and structured experiment manifests. The engine scales horizontally because each simulation is an independent stateless process.',
  },
  {
    q: 'What scenarios are available?',
    a: 'Mars Genesis (100-colonist Mars colony over 50 years) is the flagship. Lunar Outpost (50-person crew at the lunar south pole) proves the engine works with different departments, progression, and milestones. The Scenario Compiler lets you create any closed-state, turn-based settlement simulation: Antarctic stations, orbital habitats, submarine habitats, generation ships, corporate acquisitions, defense wargames.',
  },
  {
    q: 'What verticals does Paracosm support?',
    a: 'Defense and intelligence (wargaming, scenario planning), corporate strategy (acquisition simulation, leadership modeling), game studios (procedural NPC civilizations, emergent narratives), academic research (controlled experiments in AI decision-making), government (policy impact simulation), and any domain where testing decisions before making them has value.',
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
    a: 'HEXACO is a six-factor personality model from psychology research: Honesty-Humility, Emotionality, Extraversion, Agreeableness, Conscientiousness, and Openness to Experience. Each trait is a continuous 0-1 value, not a categorical type. Traits drift over time through leader pull, role pull, and outcome reinforcement, producing measurably different behavior across turns.',
  },
  {
    q: 'Is the simulation deterministic?',
    a: 'The kernel is fully deterministic. Same seed produces the same colonist roster, births, deaths, and promotions via a seeded PRNG (Mulberry32). The divergence comes entirely from AI-driven decisions: different commanders make different choices, which the Crisis Director responds to with different crises.',
  },
  {
    q: 'Can I create my own scenario?',
    a: 'Two ways. Write a ScenarioPackage in TypeScript with full control over hooks and progression logic. Or use the Scenario Compiler: write a JSON file describing your world and let the compiler generate all hooks via LLM. Both produce a package that runs through the same engine without editing engine code.',
  },
  {
    q: 'What is AgentOS?',
    a: 'AgentOS is the open-source TypeScript runtime that powers Paracosm. It provides the agent() function, generateText(), EmergentCapabilityEngine for tool forging, EmergentJudge for safety review, and AgentMemory for semantic research retrieval. Paracosm is built entirely on the AgentOS API.',
  },
  {
    q: 'What LLM providers are supported?',
    a: 'OpenAI (GPT-5.4, GPT-5.4-mini) and Anthropic (Claude Sonnet 4.6, Claude Haiku 4.5) are supported. Different models can be assigned to different roles: commander, departments, judge, and crisis director. The simulation adapts its API calls to whichever provider you configure.',
  },
  {
    q: 'Is this open source or commercial?',
    a: 'Both. The core engine is open source under Apache-2.0. You can use it freely in any project, including commercial products, without restrictions. The enterprise platform (hosted dashboard, white-label UI, scenario authoring studio, multi-tenant orchestration) is a paid product built on the open core. This is the same model used by the most successful open-source AI platforms: free engine, paid infrastructure and services.',
  },
  {
    q: 'Can I white-label Paracosm for my organization?',
    a: 'Yes. The Platform tier provides full white-label capability: your brand, your domain, your dashboard theme. The entire simulation experience, including dashboards, reports, and scenario selection, carries your visual identity. The underlying engine runs the same deterministic simulation. Available with the Platform tier.',
  },
];

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
}

const PRICING: PricingTier[] = [
  {
    name: 'Open Source',
    price: 'Free',
    period: 'forever',
    description: 'The full engine, two scenarios, CLI, dashboard, and batch runner.',
    features: [
      'Paracosm engine (Apache-2.0)',
      'Mars Genesis + Lunar Outpost scenarios',
      'React dashboard with live SSE streaming',
      'Batch runner for multi-scenario experiments',
      'TypeScript SDK with full type definitions',
      'Community support via Discord',
    ],
    cta: { label: 'View on GitHub', href: 'https://github.com/framersai/paracosm' },
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'Zero-code scenario creation, hosted dashboard, API access.',
    features: [
      'Everything in Open Source',
      'Scenario Compiler (JSON to hooks via LLM)',
      'Hosted dashboard at paracosm.agentos.sh',
      'Persistent run history (Postgres)',
      'REST API for programmatic simulation',
      'PDF report export',
      'Priority model access (Claude, GPT-5.4)',
    ],
    cta: { label: 'Join Waitlist', href: 'mailto:team@frame.dev?subject=Paracosm Pro Waitlist' },
    badge: 'Coming Soon',
  },
  {
    name: 'Enterprise',
    price: '$499',
    period: '/month + usage',
    description: 'Private deployment, custom scenarios, audit trails, SLA.',
    features: [
      'Everything in Pro',
      'Private deployment (Docker/K8s)',
      'Custom Scenario Authoring Studio',
      'SSO / SAML integration',
      'Full audit trails with provenance',
      'Multi-tenant with RBAC',
      '99.9% uptime SLA',
    ],
    cta: { label: 'Contact Sales', href: 'mailto:team@frame.dev?subject=Paracosm Enterprise Inquiry' },
    highlight: true,
    badge: 'Coming Soon',
  },
  {
    name: 'Platform',
    price: 'Custom',
    period: 'pricing',
    description: 'White-label, multi-simulation orchestration, marketplace.',
    features: [
      'Everything in Enterprise',
      'White-label (your brand, your domain)',
      '100+ concurrent simulation orchestration',
      'Custom LLM integration (bring your own models)',
      'Webhook ecosystem (Slack, Teams, Jira)',
      'Scenario Marketplace (publish and sell)',
      'Dedicated infrastructure',
    ],
    cta: { label: 'Contact Sales', href: 'mailto:team@frame.dev?subject=Paracosm Platform Inquiry' },
    badge: 'Coming Soon',
  },
];

export function AboutPage() {
  const scenario = useScenarioContext();

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px', background: 'var(--bg-deep)', maxWidth: '100%' }}>
      <div style={{ maxWidth: '900px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', color: 'var(--amber)', fontFamily: 'var(--mono)', marginBottom: '8px' }}>
            Paracosm
          </h1>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '14px' }}>
            Scenario-driven multi-agent simulation engine with emergent AI crisis generation, runtime tool forging,
            HEXACO personality evolution, and a deterministic kernel. Define any closed-state settlement simulation
            and run it without editing engine code. Currently running: <strong style={{ color: 'var(--amber)' }}>{scenario.labels.name}</strong>.
          </p>
        </div>

        {/* How it works */}
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>
            How It Works
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              { title: 'Crisis Director', desc: 'AI generates unique crises per timeline based on settlement state, decision history, and tool intelligence.' },
              { title: 'Tool Forging', desc: 'Department agents create computational tools at runtime. An LLM judge reviews each for safety and correctness.' },
              { title: 'Personality Drift', desc: 'HEXACO traits evolve through leader pull, role activation, and outcome reinforcement over the simulation.' },
              { title: 'Deterministic Kernel', desc: 'Seeded PRNG ensures reproducibility. Same seed, same roster. Only AI decisions create divergence.' },
              { title: 'Scenario Compiler', desc: 'Describe your world in JSON. The compiler generates all runtime hooks via LLM. No TypeScript required.' },
              { title: 'Unlimited Scenarios', desc: 'Mars, lunar, submarine, Antarctic, orbital, corporate, defense. Any closed-state settlement runs through the same engine.' },
            ].map(item => (
              <div key={item.title} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', boxShadow: 'var(--card-shadow)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--mono)', marginBottom: '4px' }}>{item.title}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Enterprise / scalability banner */}
        <section style={{ marginBottom: '24px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--bg-card), var(--bg-elevated))',
            border: '1px solid var(--border-hl)',
            borderRadius: '8px', padding: '20px 24px',
            boxShadow: 'var(--raised-shadow), 0 0 30px var(--amber-glow)',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
              Open Core + Enterprise
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-1)', fontFamily: 'var(--mono)' }}>
              Paracosm Enterprise
            </h3>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '14px', marginBottom: '12px' }}>
              The simulation engine is open source (Apache-2.0). The enterprise platform adds the infrastructure, tooling,
              and white-label capabilities that organizations need to run simulation at scale. Same model
              that powers the most successful open-source AI platforms: free core, paid infrastructure and services.
            </p>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '14px', marginBottom: '12px' }}>
              Run hundreds of concurrent simulations with full orchestration, cost tracking, and reproducible experiment manifests.
              The Scenario Compiler generates complete runtime hooks from a JSON description of your world for approximately $0.10
              per compile. Define any settlement, organization, or strategic scenario without writing code.
            </p>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '14px', marginBottom: '16px' }}>
              White-label the entire experience: your brand, your domain, your dashboard theme. Custom scenario authoring studio
              for domain experts. Private deployment on your infrastructure with SSO, audit trails, and multi-tenant access control.
              Batch experiments across scenario variants with statistical comparison of outcomes. Full REST API.
              Scenario Marketplace for publishing and distributing custom simulation packages.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <a
                href="mailto:team@frame.dev?subject=Paracosm Enterprise Inquiry"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 700 }}
                style={{ background: 'var(--accent-primary)', color: 'var(--text-contrast)' }}
              >
                Contact team@frame.dev for early access
              </a>
              <a
                href="mailto:team@frame.dev?subject=Paracosm Partnership / Investment"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 700 }}
                style={{ background: 'var(--bg-elevated)', color: 'var(--accent-primary)', border: '1px solid var(--border-interactive)' }}
              >
                Partnership and investment inquiries
              </a>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '10px' }}>Pricing</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '14px' }}>
            Open-core model: the simulation engine is free and open source (Apache-2.0) forever. Paid tiers add hosted infrastructure,
            zero-code scenario creation, white-label dashboards, and enterprise features. No vendor lock-in.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {PRICING.map(tier => (
              <div
                key={tier.name}
                style={{ borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column' }}
                style={{
                  background: 'var(--bg-card)',
                  border: tier.highlight ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  boxShadow: tier.highlight ? '0 0 20px rgba(99, 102, 241, 0.15)' : undefined,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{tier.name}</h3>
                  {tier.badge && (
                    <span
                      className="text-[9px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--accent-primary)', border: '1px solid var(--border-interactive)' }}
                    >
                      {tier.badge}
                    </span>
                  )}
                </div>
                <div className="mb-2">
                  <span className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{tier.price}</span>
                  <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>{tier.period}</span>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{tier.description}</p>
                <ul className="text-xs space-y-1.5 mb-4 flex-1" style={{ color: 'var(--text-muted)' }}>
                  {tier.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5">
                      <span style={{ color: 'var(--color-success, #22c55e)' }}>&#10003;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={tier.cta.href}
                  target={tier.cta.href.startsWith('mailto:') ? undefined : '_blank'}
                  rel="noopener"
                  className="text-center px-4 py-2 rounded text-xs font-bold transition-all"
                  style={{
                    background: tier.highlight ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                    color: tier.highlight ? 'var(--text-contrast)' : 'var(--accent-primary)',
                    border: tier.highlight ? 'none' : '1px solid var(--border-interactive)',
                  }}
                >
                  {tier.cta.label}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>Frequently Asked Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>Technology</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
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
              { label: 'Scenarios', value: 'Unlimited (JSON + Compiler)' },
              { label: 'Scalability', value: 'Stateless, horizontally scalable' },
              { label: 'Batch Runner', value: 'Multi-scenario experiments' },
            ].map(item => (
              <div key={item.label} className="px-3 py-2 rounded" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="font-bold" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
                <div style={{ color: 'var(--text-primary)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Links */}
        <section style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>Links</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
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
