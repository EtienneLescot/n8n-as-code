import siteConfig from '@generated/docusaurus.config';

const customFields = siteConfig.customFields as { posthogKey?: string; posthogHost?: string };
const POSTHOG_KEY = customFields.posthogKey;
const POSTHOG_HOST = (customFields.posthogHost || 'https://eu.i.posthog.com').replace(/\/$/, '');
const STORAGE_KEY = 'n8n-as-code:docs-telemetry-id';
const DISABLED_KEY = 'n8n-as-code:telemetry-disabled';

function isTelemetryDisabled(): boolean {
  if (!POSTHOG_KEY) return true;
  if (navigator.doNotTrack === '1') return true;
  if (localStorage.getItem(DISABLED_KEY) === '1') return true;
  return false;
}

function setTelemetryDisabled(disabled: boolean): void {
  if (disabled) {
    localStorage.setItem(DISABLED_KEY, '1');
  } else {
    localStorage.removeItem(DISABLED_KEY);
  }
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

function installTelemetryControl(): void {
  if (document.getElementById('n8n-as-code-telemetry-control')) return;

  const root = document.createElement('div');
  root.id = 'n8n-as-code-telemetry-control';
  root.style.position = 'fixed';
  root.style.right = '1rem';
  root.style.bottom = '1rem';
  root.style.zIndex = '9999';
  root.style.maxWidth = '18rem';
  root.style.padding = '0.75rem';
  root.style.border = '1px solid var(--ifm-color-emphasis-300)';
  root.style.borderRadius = '0.5rem';
  root.style.background = 'var(--ifm-background-surface-color)';
  root.style.boxShadow = 'var(--ifm-global-shadow-md)';
  root.style.fontSize = '0.8rem';

  const text = document.createElement('div');
  text.style.marginBottom = '0.5rem';

  const button = document.createElement('button');
  button.type = 'button';
  button.style.cursor = 'pointer';
  button.style.border = '1px solid var(--ifm-color-primary)';
  button.style.borderRadius = '0.35rem';
  button.style.background = 'var(--ifm-color-primary)';
  button.style.color = 'var(--ifm-color-primary-contrast-foreground)';
  button.style.padding = '0.35rem 0.5rem';

  const render = () => {
    const disabled = localStorage.getItem(DISABLED_KEY) === '1' || navigator.doNotTrack === '1' || !POSTHOG_KEY;
    text.textContent = disabled
      ? 'Anonymous docs telemetry is disabled.'
      : 'Anonymous docs telemetry is enabled.';
    button.textContent = disabled ? 'Enable telemetry' : 'Disable telemetry';
    button.disabled = navigator.doNotTrack === '1' || !POSTHOG_KEY;
  };

  button.addEventListener('click', () => {
    setTelemetryDisabled(localStorage.getItem(DISABLED_KEY) !== '1');
    render();
  });

  root.append(text, button);
  document.body.append(root);
  render();
}

function initializeTelemetry(): void {
    trackDocsPageView();
    installRouteTracking();
    installTelemetryControl();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeTelemetry, { once: true });
  } else {
    initializeTelemetry();
  }
}
