interface FooterProps {
  cost?: { totalTokens: number; totalCostUSD: number; llmCalls: number };
  /**
   * Mirrors the TopBar status pill so the user sees the run state at
   * the bottom of the page too. Driven by the same three booleans the
   * TopBar reads (isComplete, isAborted, connection status) so the
   * colour + text stay in lockstep between the two surfaces.
   */
  simStatus?: {
    isRunning: boolean;
    isComplete: boolean;
    isAborted: boolean;
    connectionStatus: 'connecting' | 'connected' | 'error';
  };
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
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        color, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
      }}
      role="status"
      aria-live="polite"
      aria-label={`Simulation status: ${text}`}
    >
      {glyph} {text}
    </span>
  );
}

export function Footer({ cost, simStatus }: FooterProps) {
  return (
    <footer
      className="shrink-0"
      role="contentinfo"
      style={{
        padding: '4px 16px',
        background: 'var(--bg-panel)',
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
      <nav aria-label="Footer links" style={{ display: 'flex', gap: '12px' }}>
        <a href="https://agentos.sh" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>agentos.sh</a>
        <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>github</a>
        <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>npm</a>
        <a href="/docs" style={{ color: 'var(--rust)', fontWeight: 600 }}>docs</a>
        <a href="https://agentos.sh/blog" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>blog</a>
      </nav>

      {simStatus && <StatusChip s={simStatus} />}

      {cost && (cost.totalTokens > 0 || cost.llmCalls > 0) && (
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontFamily: 'var(--mono)', fontSize: '10px' }}>
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

      <span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '.08em', fontSize: '10px' }}>PARA<span style={{ color: 'var(--amber)' }}>COSM</span></span>
        {' '}&middot; Apache-2.0 &middot; <a href="https://manic.agency" target="_blank" rel="noopener" style={{ color: 'var(--text-3)' }}>Manic Agency</a> / <a href="https://frame.dev" target="_blank" rel="noopener" style={{ color: 'var(--text-3)' }}>Frame.dev</a>
      </span>
    </footer>
  );
}
