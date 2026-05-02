import siteConfig from '@generated/docusaurus.config';

const customFields = siteConfig.customFields as { posthogKey?: string; posthogHost?: string };
const POSTHOG_KEY = customFields.posthogKey;
const POSTHOG_HOST = (customFields.posthogHost || 'https://eu.i.posthog.com').replace(/\/$/, '');
const STORAGE_KEY = 'n8n-as-code:docs-telemetry-id';

function isTelemetryDisabled(): boolean {
  if (!POSTHOG_KEY) return true;
  if (navigator.doNotTrack === '1') return true;
  if (localStorage.getItem('n8n-as-code:telemetry-disabled') === '1') return true;
  return false;
}

function getAnonymousId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, generated);
  return generated;
}

function getPathGroup(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'docs') return 'site';
  return segments.slice(0, 3).join('/') || 'docs';
}

function trackDocsPageView(): void {
  if (isTelemetryDisabled()) return;

  const pathname = window.location.pathname;
  void fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event: 'docs_page_viewed',
      distinct_id: getAnonymousId(),
      properties: {
        app: 'n8n-as-code',
        facade: 'docs',
        telemetry_schema_version: 1,
        path_group: getPathGroup(pathname),
      },
    }),
  }).catch(() => undefined);
}

function installRouteTracking(): void {
  let lastPath = window.location.pathname;
  const notifyIfChanged = () => {
    if (window.location.pathname === lastPath) return;
    lastPath = window.location.pathname;
    trackDocsPageView();
  };

  for (const methodName of ['pushState', 'replaceState'] as const) {
    const original = window.history[methodName];
    window.history[methodName] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      queueMicrotask(notifyIfChanged);
      return result;
    };
  }

  window.addEventListener('popstate', notifyIfChanged);
}

if (typeof window !== 'undefined') {
  trackDocsPageView();
  installRouteTracking();
}
