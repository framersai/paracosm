export function Footer() {
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
      <span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '.08em', fontSize: '10px' }}>PARA<span style={{ color: 'var(--amber)' }}>COSM</span></span>
        {' '}&middot; Apache-2.0 &middot; <a href="https://manic.agency" target="_blank" rel="noopener" style={{ color: 'var(--text-3)' }}>Manic Agency</a> / <a href="https://frame.dev" target="_blank" rel="noopener" style={{ color: 'var(--text-3)' }}>Frame.dev</a>
      </span>
    </footer>
  );
}
