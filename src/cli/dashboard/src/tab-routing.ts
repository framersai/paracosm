export const DASHBOARD_TABS = ['sim', 'viz', 'settings', 'reports', 'chat', 'log', 'about'] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

function isDashboardTab(value: string | null | undefined): value is DashboardTab {
  return !!value && DASHBOARD_TABS.includes(value as DashboardTab);
}

export function getDashboardTabFromHref(href: string): DashboardTab {
  const url = new URL(href);
  const tab = url.searchParams.get('tab');
  if (isDashboardTab(tab)) {
    return tab;
  }

  const hash = url.hash.replace(/^#/, '');
  if (isDashboardTab(hash)) {
    return hash;
  }

  return 'sim';
}

export function createDashboardTabHref(currentHref: string, tab: Exclude<DashboardTab, 'about'>): string {
  const url = new URL(currentHref);
  url.searchParams.set('tab', tab);
  url.hash = '';
  return url.toString();
}

export function resolveSetupRedirectHref(currentHref: string, redirect: string | null | undefined): string {
  if (!redirect) {
    return createDashboardTabHref(currentHref, 'sim');
  }

  const currentUrl = new URL(currentHref);
  const targetUrl = new URL(redirect, currentUrl.origin);

  if (targetUrl.pathname === '/sim' && !targetUrl.searchParams.has('tab')) {
    targetUrl.searchParams.set('tab', 'sim');
  }

  targetUrl.hash = '';
  return targetUrl.toString();
}
