import { useMediaQuery, PHONE_QUERY } from '../viz/grid/useMediaQuery';

interface FooterAbortReason {
  reason: string;
  completedTurns?: number;
}

interface FooterProviderError {
  message: string;
}

interface FooterProps {
  cost?: { totalTokens: number; totalCostUSD: number; llmCalls: number };
  /**
   * Optional per-source split of the cost total. When provided, the
   * Footer's cost span gains a hover tooltip that breaks down the
   * number into sim vs chat components so users can debug where
   * spend is coming from. Keys are USD; any key <= 0 is omitted
   * from the tooltip line.
   */
  costBreakdown?: {
    simUSD?: number;
    simCalls?: number;
    chatUSD?: number;
    chatCalls?: number;
  };
  /**
   * Mirrors the TopBar status pill so the user sees the run state at
   * the bottom of the page too. Driven by the same three booleans the
   * TopBar reads (isComplete, isAborted, connection status) so the
   * colour + text stay in lockstep between the two surfaces.
   *
   * `abortReason` and `providerError` mirror the TopBar tooltip
   * derivation so hovering the Footer chip explains WHY the run was
   * interrupted (quota, disconnect, user cancel) instead of only
   * showing the "Interrupted" label with no context.
   */
  simStatus?: {
    isRunning: boolean;
    isComplete: boolean;
    isAborted: boolean;
    connectionStatus: 'connecting' | 'connected' | 'error' | 'replay_not_found';
    abortReason?: FooterAbortReason | null;
    providerError?: FooterProviderError | null;
  };
}

function abortReasonLabel(raw: string): string {
  switch (raw) {
    case 'client_disconnected': return 'browser tab closed before the sim finished';
    case 'quota_exhausted': return 'provider credits exhausted';
    case 'user_aborted': return 'cancelled by the user';
    case 'provider_error': return 'provider returned an unrecoverable error';
    case 'unknown': return 'reason not recorded by the server';
    default: return raw;
  }
}

function StatusChip({ s }: { s: NonNullable<FooterProps['simStatus']> }) {
  const color = s.isAborted
    ? 'var(--amber)'
    : s.isComplete
    ? 'var(--green)'
    : s.isRunning
    ? 'var(--color-success, var(--green))'
    : s.connectionStatus === 'connected'
    ? 'var(--text-3)'
    : 'var(--text-3)';
  const text = s.isAborted
    ? 'Interrupted'
    : s.isComplete
    ? 'Complete'
    : s.isRunning
    ? 'Running'
    : s.connectionStatus === 'connected'
    ? 'Idle'
    : s.connectionStatus === 'error'
    ? 'Reconnecting'
    : 'Connecting';
  const glyph = s.isRunning && !s.isComplete && !s.isAborted ? '\u25CF' : '\u25CB';
  // Same derivation the TopBar uses so both pills explain an interrupted
  // run identically. Mentioning providerError first keeps the actionable
  // cause (top up credits / fix key) visible even when the orchestrator
  // did not emit a sim_aborted for the underlying quota/auth failure.
  const title = s.isAborted
    ? (() => {
        if (s.providerError) {
          return `Run interrupted: ${s.providerError.message}. Click Clear to reset.`;
        }
        const r = s.abortReason;
        if (!r) return 'Run was interrupted before finishing all turns. Click Clear to reset.';
        const where = typeof r.completedTurns === 'number'
          ? ` after ${r.completedTurns} turn${r.completedTurns === 1 ? '' : 's'}`
          : '';
        return `Run interrupted: ${abortReasonLabel(r.reason)}${where}. Click Clear to reset.`;
      })()
    : s.isComplete
    ? 'Run finished all turns. Verdict is broadcast in Reports.'
    : s.isRunning
    ? 'Simulation in progress.'
    : s.connectionStatus === 'connected'
    ? 'Connected to the simulation server. Press RUN to start.'
    : s.connectionStatus === 'error'
    ? 'Reconnecting to the simulation server.'
    : 'Connecting to the simulation server.';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        color, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
        cursor: 'help',
      }}
      role="status"
      aria-live="polite"
      aria-label={`Simulation status: ${text}. ${title}`}
      title={title}
    >
      {glyph} {text}
    </span>
  );
}

function formatUsdShort(u: number): string {
  if (u < 0.01) return `$${u.toFixed(4)}`;
  return `$${u.toFixed(2)}`;
}

function buildCostTooltip(
  cost: NonNullable<FooterProps['cost']>,
  breakdown: FooterProps['costBreakdown'],
): string {
  const lines: string[] = [
    `Total: ${formatUsdShort(cost.totalCostUSD)} · ${cost.totalTokens.toLocaleString()} tokens · ${cost.llmCalls} calls`,
  ];
  if (breakdown) {
    const sim = breakdown.simUSD ?? 0;
    const chat = breakdown.chatUSD ?? 0;
    if (sim > 0) lines.push(`• Simulation: ${formatUsdShort(sim)}${breakdown.simCalls != null ? ` (${breakdown.simCalls} calls)` : ''}`);
    if (chat > 0) lines.push(`• Chat: ${formatUsdShort(chat)}${breakdown.chatCalls != null ? ` (${breakdown.chatCalls} calls)` : ''}`);
  }
  return lines.join('\n');
}

export function Footer({ cost, costBreakdown, simStatus }: FooterProps) {
  // Below 480px the footer's four flex items (nav, status, cost, brand)
  // wrap to 3-4 lines and steal ~80px from the visible content area —
  // Timeline cards in SimView render under the footer's space. Hide
  // the link nav and the brand line on phone; the same nav lives in
  // the TopBar (GitHub icon, ⋯ menu) so we don't lose any path.
  const isPhone = useMediaQuery(PHONE_QUERY);
  return (
    <footer
      className="shrink-0"
      role="contentinfo"
      style={{
        padding: isPhone ? '3px 12px' : '4px 16px',
        background: 'var(--bg-deep)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '10px',
        color: 'var(--text-3)',
      }}
    >
      {!isPhone && (
        <nav aria-label="Footer links" style={{ display: 'flex', gap: '12px' }}>
          <a href="https://agentos.sh" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>agentos.sh</a>
          <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>github</a>
          <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>npm</a>
          <a href="/docs" style={{ color: 'var(--rust)', fontWeight: 600 }}>docs</a>
          <a href="https://agentos.sh/blog" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>blog</a>
        </nav>
      )}

      {simStatus && <StatusChip s={simStatus} />}

      {cost && (cost.totalTokens > 0 || cost.llmCalls > 0) && (
        <span
          style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'help' }}
          title={buildCostTooltip(cost, costBreakdown)}
        >
          <span style={{ color: 'var(--green)', fontWeight: 800, fontSize: '11px' }}>
            ${cost.totalCostUSD < 0.01 ? cost.totalCostUSD.toFixed(4) : cost.totalCostUSD.toFixed(2)}
          </span>
          <span style={{ color: 'var(--text-3)' }}>
            {(cost.totalTokens / 1000).toFixed(0)}k tokens
          </span>
          {cost.llmCalls > 0 && (
            <span style={{ color: 'var(--text-3)' }}>
              {cost.llmCalls} calls
            </span>
          )}
        </span>
      )}

      {!isPhone && (
        <span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '.08em', fontSize: '10px' }}>PARA<span style={{ color: 'var(--amber)' }}>COSM</span></span>
          {' '}&middot; Apache-2.0 &middot; <a href="https://manic.agency" target="_blank" rel="noopener" style={{ color: 'var(--text-3)' }}>Manic Agency</a> / <a href="https://frame.dev" target="_blank" rel="noopener" style={{ color: 'var(--text-3)' }}>Frame.dev</a>
        </span>
      )}
    </footer>
  );
}
