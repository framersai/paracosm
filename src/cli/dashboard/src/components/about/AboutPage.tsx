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
    a: 'The core engine, Mars Genesis and Lunar Outpost scenarios, CLI, dashboard, and batch runner are free and open source under the Apache-2.0 license today. Pro ($49/mo), Enterprise ($499/mo), and Platform are planned hosted tiers. They are roadmap packages, not generally available products yet.',
  },
  {
    q: 'What is the Scenario Compiler?',
    a: 'The Scenario Compiler is the zero-code direction for Paracosm: a JSON world definition that generates runtime hooks via LLM calls instead of hand-written TypeScript. Core compiler work exists in the codebase, but the polished hosted self-serve experience is still a planned product surface rather than a general-availability workflow.',
  },
  {
    q: 'How many simulations can I run?',
    a: 'In the open-source product, you run simulations locally and can batch scenarios and seeds in sequence. The engine is horizontally scalable because each simulation is an independent process, but hosted orchestration, cost tracking, and large concurrent fleets are still planned platform capabilities rather than a public service today.',
  },
  {
    q: 'What scenarios are available?',
    a: 'Mars Genesis (100-colonist Mars colony over 50 years) is the flagship. Lunar Outpost (50-person crew at the lunar south pole) proves the engine works with different departments, progression, and milestones. The engine is designed to support broader closed-state, turn-based simulations such as Antarctic stations, orbital habitats, submarines, generation ships, corporate scenarios, and defense wargames, with scenario authoring expanding over time.',
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
    a: 'Two ways. Write a ScenarioPackage in TypeScript with full control over hooks and progression logic today. Or use the Scenario Compiler flow, which exists in the product direction and early implementation work but is not yet a broadly available hosted self-serve workflow.',
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
    a: 'Both, but at different maturity levels. The core engine is open source under Apache-2.0 and usable today. The hosted and enterprise layers are the commercial roadmap: auth, persistence, exports, orchestration, private deployment, and white-label packaging built on top of the open core.',
  },
  {
    q: 'Can I white-label Paracosm for my organization?',
    a: 'That is the intended direction for the future Platform tier. White-label branding, custom domains, and customer-owned dashboard theming are not publicly available today.',
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
    badge: 'Available Now',
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'Planned hosted convenience tier for auth, persistence, API access, and zero-code workflows.',
    features: [
      'Target tier, not generally available yet',
      'Hosted auth + dashboard',
      'Persistent run history + replay',
      'Basic remote execution API',
      'JSON export baseline',
      'Scenario Compiler workflow',
      'Expanded reporting over time',
    ],
    cta: { label: 'Join Early Access', href: 'mailto:team@frame.dev?subject=Paracosm Pro Early Access' },
    badge: 'Planned',
  },
  {
    name: 'Enterprise',
    price: '$499',
    period: '/month + usage',
    description: 'Planned private-deployment and governance tier for teams that need control and compliance.',
    features: [
      'Target tier, not generally available yet',
      'Private deployment package',
      'Workspace / org model',
      'SSO / SAML + RBAC',
      'Audit trails with provenance persistence',
      'Scenario authoring studio',
      'Support / SLA packaging',
    ],
    cta: { label: 'Contact Sales', href: 'mailto:team@frame.dev?subject=Paracosm Enterprise Inquiry' },
    highlight: true,
    badge: 'Design Partners',
  },
  {
    name: 'Platform',
    price: 'Custom',
    period: 'pricing',
    description: 'Longer-term platform package for orchestration, white-label, and marketplace distribution.',
    features: [
      'Future roadmap tier',
      'White-label domains and branding',
      'Parallel run orchestration',
      'Webhook ecosystem',
      'Bring-your-own-model integrations',
      'Scenario marketplace + billing flows',
      'Dedicated infrastructure',
    ],
    cta: { label: 'Contact Sales', href: 'mailto:team@frame.dev?subject=Paracosm Platform Inquiry' },
    badge: 'Future',
  },
];

export function AboutPage() {
  const scenario = useScenarioContext();

  return (
    <div className="about-content" style={{ flex: 1, overflowY: 'auto', padding: '32px 48px', background: 'var(--bg-deep)', width: '100%' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <header style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', color: 'var(--text-1)', fontFamily: 'var(--mono)', marginBottom: '8px', letterSpacing: '.12em', fontWeight: 700 }}>
            PARA<span style={{ color: 'var(--amber)' }}>COSM</span>
          </h1>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '14px' }}>
            Scenario-driven multi-agent simulation engine with emergent AI crisis generation, runtime tool forging,
            HEXACO personality evolution, and a deterministic kernel. Define any closed-state settlement simulation
            and run it without editing engine code. Currently running: <strong style={{ color: 'var(--amber)' }}>{scenario.labels.name}</strong>.
          </p>
          <p style={{ color: 'var(--text-3)', lineHeight: 1.8, fontSize: '12px', marginTop: '10px' }}>
            Availability note: the open-source engine is available now. Hosted Pro, Enterprise, and Platform offerings shown below are roadmap tiers and early-access packaging, not generally available SaaS products yet.
          </p>
        </header>

        {/* How it works */}
        <section style={{ marginBottom: '24px' }} aria-labelledby="how-heading">
          <h2 id="how-heading" style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>
            How It Works
          </h2>
          <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              { title: 'Crisis Director', desc: 'AI generates unique crises per timeline based on settlement state, decision history, and tool intelligence.' },
              { title: 'Tool Forging', desc: 'Department agents create computational tools at runtime. An LLM judge reviews each for safety and correctness.' },
              { title: 'Personality Drift', desc: 'HEXACO traits evolve through leader pull, role activation, and outcome reinforcement over the simulation.' },
              { title: 'Deterministic Kernel', desc: 'Seeded PRNG ensures reproducibility. Same seed, same roster. Only AI decisions create divergence.' },
              { title: 'Scenario Compiler', desc: 'Compiler foundations exist now, with the polished zero-code hosted workflow planned as a future product layer.' },
              { title: 'Scenario-Driven Engine', desc: 'Mars and lunar are live today. The engine is designed to expand into broader closed-state simulation domains over time.' },
            ].map(item => (
              <div key={item.title} className="hover-glow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', boxShadow: 'var(--card-shadow)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--mono)', marginBottom: '4px' }}>{item.title}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Enterprise / scalability banner */}
        <section style={{ marginBottom: '24px' }} aria-labelledby="hosted-heading">
          <div style={{
            background: 'linear-gradient(135deg, var(--bg-card), var(--bg-elevated))',
            border: '1px solid var(--border-hl)',
            borderRadius: '8px', padding: '20px 24px',
            boxShadow: 'var(--raised-shadow), 0 0 30px var(--amber-glow)',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
              Open Core + Hosted Roadmap
            </div>
            <h3 id="hosted-heading" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-1)', fontFamily: 'var(--mono)' }}>
              Planned Hosted Packaging
            </h3>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '14px', marginBottom: '12px' }}>
              The simulation engine is open source and available today under Apache-2.0. The hosted layers are the commercial roadmap:
              auth, persistence, APIs, governance controls, and white-label packaging built on top of the same engine.
            </p>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '14px', marginBottom: '12px' }}>
              The first sellable hosted tier is planned around practical product plumbing: hosted auth, persistent run history,
              replay, basic remote execution API, and export flows. Beyond that, enterprise packaging adds private deployment,
              provenance, workspace boundaries, and identity controls.
            </p>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '14px', marginBottom: '16px' }}>
              Longer-term roadmap items include white-label deployment, multi-simulation orchestration, marketplace distribution,
              and broader scenario authoring workflows. Those are directionally important, but they should be treated as planned
              platform capabilities rather than features available today.
            </p>
            <div className="responsive-stack" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <a
                href="mailto:team@frame.dev?subject=Paracosm Enterprise Inquiry"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: 'var(--amber)',
                  color: 'var(--bg-deep)',
                }}
              >
                Contact team@frame.dev for roadmap access
              </a>
              <a
                href="mailto:team@frame.dev?subject=Paracosm Partnership / Investment"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: 'var(--bg-elevated)',
                  color: 'var(--amber)',
                  border: '1px solid var(--border-hl)',
                }}
              >
                Partnership and investment inquiries
              </a>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section style={{ marginBottom: '24px' }} aria-labelledby="pricing-heading">
          <h2 id="pricing-heading" style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '10px' }}>Pricing</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '14px' }}>
            Open-core model: the simulation engine is free and open source (Apache-2.0) forever. The paid tiers below are planned hosted
            packaging for infrastructure, persistence, governance, and zero-code workflows. No vendor lock-in.
          </p>
          <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {PRICING.map(tier => (
              <article
                key={tier.name}
                className="hover-lift"
                style={{
                  borderRadius: '6px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--bg-card)',
                  border: tier.highlight ? '2px solid var(--amber)' : '1px solid var(--border)',
                  boxShadow: tier.highlight ? '0 0 20px var(--amber-glow)' : 'var(--card-shadow)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>{tier.name}</h3>
                  {tier.badge && (
                    <span style={{
                      fontSize: '9px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: '12px',
                      background: 'var(--bg-elevated)', color: 'var(--amber)', border: '1px solid var(--border-hl)',
                    }}>
                      {tier.badge}
                    </span>
                  )}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-1)' }}>{tier.price}</span>
                  <span style={{ fontSize: '12px', marginLeft: '4px', color: 'var(--text-3)' }}>{tier.period}</span>
                </div>
                <p style={{ fontSize: '12px', marginBottom: '12px', color: 'var(--text-2)' }}>{tier.description}</p>
                <ul style={{ fontSize: '12px', listStyle: 'none', padding: 0, marginBottom: '16px', flex: 1, color: 'var(--text-3)' }}>
                  {tier.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--green)', flexShrink: 0 }}>&#10003;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={tier.cta.href}
                  target={tier.cta.href.startsWith('mailto:') ? undefined : '_blank'}
                  rel="noopener"
                  style={{
                    textAlign: 'center',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'block',
                    textDecoration: 'none',
                    background: tier.highlight ? 'var(--amber)' : 'var(--bg-elevated)',
                    color: tier.highlight ? 'var(--bg-deep)' : 'var(--amber)',
                    border: tier.highlight ? 'none' : '1px solid var(--border-hl)',
                  }}
                >
                  {tier.cta.label}
                </a>
              </article>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section style={{ marginBottom: '24px' }} aria-labelledby="faq-heading">
          <h2 id="faq-heading" style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>Frequently Asked Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {FAQ.map((item, i) => (
              <details key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <summary style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
                  {item.q}
                </summary>
                <div style={{ padding: '0 16px 12px', fontSize: '12px', lineHeight: 1.7, color: 'var(--text-2)' }}>
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Tech stack */}
        <section style={{ marginBottom: '24px' }} aria-labelledby="tech-heading">
          <h2 id="tech-heading" style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>Technology</h2>
          <div className="responsive-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
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
              <div key={item.label} style={{ padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                <div style={{ color: 'var(--text-1)', marginTop: '2px' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Links */}
        <section style={{ marginBottom: '16px' }} aria-labelledby="links-heading">
          <h2 id="links-heading" style={{ fontSize: '20px', color: 'var(--amber)', fontFamily: 'var(--mono)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>Links</h2>
          <nav aria-label="External links" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <a href="https://agentos.sh" target="_blank" rel="noopener" style={{ color: 'var(--amber)' }}>agentos.sh</a>
            <a href="https://docs.agentos.sh" target="_blank" rel="noopener" style={{ color: 'var(--amber)' }}>Documentation</a>
            <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--amber)' }}>GitHub</a>
            <a href="https://github.com/framersai/agentos" target="_blank" rel="noopener" style={{ color: 'var(--amber)' }}>AgentOS GitHub</a>
            <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--amber)' }}>npm</a>
            <a href="https://frame.dev" target="_blank" rel="noopener" style={{ color: 'var(--amber)' }}>Frame.dev</a>
            <a href="https://manic.agency" target="_blank" rel="noopener" style={{ color: 'var(--amber)' }}>Manic Agency</a>
            <a href="https://wilds.ai/discord" target="_blank" rel="noopener" style={{ color: 'var(--amber)' }}>Discord</a>
            <a href="mailto:team@frame.dev" style={{ color: 'var(--amber)' }}>team@frame.dev</a>
          </nav>
        </section>
      </div>
    </div>
  );
}
