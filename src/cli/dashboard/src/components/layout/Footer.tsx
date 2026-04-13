export function Footer() {
  return (
    <footer
      className="shrink-0 px-4 py-3 border-t text-center text-[11px]"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
    >
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <a href="https://frame.dev" target="_blank" rel="noopener" className="font-semibold transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>Frame.dev</a>
        <span style={{ color: 'var(--border-primary)' }}>·</span>
        <a href="https://manic.agency" target="_blank" rel="noopener" className="transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>Manic Agency</a>
        <span style={{ color: 'var(--border-primary)' }}>·</span>
        <a href="https://agentos.sh" target="_blank" rel="noopener" className="transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>AgentOS</a>
        <span style={{ color: 'var(--border-primary)' }}>·</span>
        <a href="https://github.com/framersai" target="_blank" rel="noopener" className="transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>GitHub</a>
        <span style={{ color: 'var(--border-primary)' }}>·</span>
        <a href="https://www.npmjs.com/package/paracosm" target="_blank" rel="noopener" className="transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>npm</a>
        <span style={{ color: 'var(--border-primary)' }}>·</span>
        <a href="https://wilds.ai/discord" target="_blank" rel="noopener" className="transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>Discord</a>
        <span style={{ color: 'var(--border-primary)' }}>·</span>
        <a href="mailto:team@frame.dev" className="transition-colors hover:underline" style={{ color: 'var(--accent-primary)' }}>team@frame.dev</a>
      </div>
      <div className="mt-1.5" style={{ color: 'var(--text-placeholder)' }}>
        &copy; 2026 <a href="https://manic.agency" target="_blank" rel="noopener" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Manic Agency LLC</a> / <a href="https://frame.dev" target="_blank" rel="noopener" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Frame.dev</a>. Apache-2.0.
      </div>
    </footer>
  );
}
