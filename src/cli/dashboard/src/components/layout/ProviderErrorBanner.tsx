import type { ProviderErrorState } from '../../hooks/useSSE';

/**
 * Persistent banner shown at the top of the dashboard when a simulation
 * hit a terminal provider error (quota exhausted, invalid API key).
 *
 * This is deliberately NOT a toast because:
 *   1. Toasts auto-dismiss; the underlying account problem does not.
 *   2. Toasts disappear when the user switches tabs; the banner survives
 *      tab navigation and any further runs until the user dismisses it or
 *      clears state.
 *   3. The message has actionable content (billing URL, provider docs)
 *      that the user needs to click, and click targets should not fade.
 *
 * Rendered inline at the top of the app shell above TopBar so it is
 * visible no matter which tab is active.
 *
 * Uses inline styles to stay consistent with the rest of the dashboard's
 * inline-styled layout components; the banner has no SCSS module.
 */
export function ProviderErrorBanner({
  providerError,
  onDismiss,
}: {
  providerError: ProviderErrorState;
  onDismiss?: () => void;
}) {
  // Color scheme differs by severity. Quota and auth are the terminal
  // kinds we actually abort on, so they both get the red treatment. Rate
  // limit / network / unknown are informational (we keep running) so they
  // would never reach the banner as-is — but we handle them defensively
  // in case future code paths surface non-terminal classifications here.
  const severity = providerError.kind === 'quota' || providerError.kind === 'auth' ? 'critical' : 'warning';

  const colors = severity === 'critical'
    ? {
        bg: 'rgba(196, 74, 30, 0.14)',
        border: 'var(--red, #c44a1e)',
        text: 'var(--red, #c44a1e)',
        actionBg: 'var(--red, #c44a1e)',
        actionText: 'var(--bg-primary, #14110e)',
      }
    : {
        bg: 'rgba(232, 180, 74, 0.14)',
        border: 'var(--amber, #e8b44a)',
        text: 'var(--amber, #e8b44a)',
        actionBg: 'var(--amber, #e8b44a)',
        actionText: 'var(--bg-primary, #14110e)',
      };

  // Per-kind heading. Kept short so the banner fits one line on mobile.
  const heading = providerError.kind === 'quota'
    ? `${providerLabel(providerError.provider)} credits exhausted`
    : providerError.kind === 'auth'
      ? `${providerLabel(providerError.provider)} API key invalid`
      : providerError.kind === 'rate_limit'
        ? `${providerLabel(providerError.provider)} rate-limited`
        : providerError.kind === 'network'
          ? `Network error contacting ${providerLabel(providerError.provider)}`
          : 'Provider error';

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: colors.bg,
        borderBottom: `2px solid ${colors.border}`,
        fontFamily: 'var(--mono)',
        fontSize: '13px',
        color: colors.text,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexWrap: 'wrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          border: `2px solid ${colors.border}`,
          fontWeight: 700,
          fontSize: '14px',
          flexShrink: 0,
        }}
      >
        !
      </span>
      <div style={{ flex: 1, minWidth: '260px' }}>
        <div style={{ fontWeight: 700, marginBottom: '2px' }}>{heading}</div>
        <div style={{ color: 'var(--text-2)', fontSize: '12px', fontFamily: 'var(--sans)' }}>
          {providerError.message}
          {providerError.leader ? (
            <span style={{ color: 'var(--text-3)' }}> (hit by {providerError.leader})</span>
          ) : null}
        </div>
      </div>
      {providerError.actionUrl ? (
        <a
          href={providerError.actionUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            background: colors.actionBg,
            color: colors.actionText,
            textDecoration: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontWeight: 700,
            fontSize: '12px',
            whiteSpace: 'nowrap',
          }}
        >
          {providerError.kind === 'quota' ? 'Add credits →' : 'Fix key →'}
        </a>
      ) : null}
      {onDismiss ? (
        <button
          onClick={onDismiss}
          aria-label="Dismiss banner"
          style={{
            background: 'transparent',
            color: colors.text,
            border: `1px solid ${colors.border}`,
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

function providerLabel(provider?: string): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'gemini') return 'Gemini';
  return 'Provider';
}
