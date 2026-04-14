export function Footer() {
  return (
    <footer
      className="shrink-0"
      style={{
        padding: '4px 16px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-primary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '10px',
        color: 'var(--text-muted)',
      }}
    >
      <div style={{ display: 'flex', gap: '12px' }}>
        <a href="https://agentos.sh" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>agentos.sh</a>
        <a href="https://frame.dev" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>frame.dev</a>
        <a href="https://github.com/framersai/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>github</a>
        <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener" style={{ color: 'var(--rust)', fontWeight: 600 }}>npm</a>
      </div>
      <span>Apache-2.0 &middot; Manic Agency / Frame.dev &middot; <a href="mailto:team@frame.dev" style={{ color: 'var(--amber)' }}>team@frame.dev</a></span>
    </footer>
  );
}
