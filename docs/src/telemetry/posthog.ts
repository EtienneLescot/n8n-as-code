import siteConfig from '@generated/docusaurus.config';

import {
  ANONYMOUS_ID_KEY,
  DISABLED_KEY,
  NOTICE_KEY,
  isDoNotTrack,
  isStorageAvailable,
  readFlag,
  readValue,
  writeFlag,
  writeValue,
} from './preferences';

const customFields = siteConfig.customFields as { posthogKey?: string; posthogHost?: string; telemetryEnvironment?: string };
const POSTHOG_KEY = customFields.posthogKey;
const POSTHOG_HOST = (customFields.posthogHost || 'https://eu.i.posthog.com').replace(/\/$/, '');
const TELEMETRY_ENVIRONMENT = customFields.telemetryEnvironment || 'dev';
const NOTICE_ID = 'n8n-as-code-telemetry-notice';
const TELEMETRY_DOC_PATH = '/docs/usage/telemetry/';

function isTelemetryDisabled(): boolean {
  if (!POSTHOG_KEY) return true;
  if (isDoNotTrack()) return true;
  // Without storage we cannot remember an opt-out, so do not start one.
  if (!isStorageAvailable()) return true;
  return readFlag(DISABLED_KEY);
}

function getAnonymousId(): string {
  const existing = readValue(ANONYMOUS_ID_KEY);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  writeValue(ANONYMOUS_ID_KEY, generated);
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
        telemetry_environment: TELEMETRY_ENVIRONMENT,
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

/**
 * A one-time notice, not a permanent fixture.
 *
 * It appears only when there is genuinely something to consent to, and once
 * the reader answers in either direction it never comes back. The durable
 * control lives next to the explanation, on the telemetry page.
 */
function installTelemetryNotice(): void {
  // Nothing to disclose: no project token is configured for this build, the
  // browser already refused tracking, or we cannot record an answer anyway.
  if (!POSTHOG_KEY || isDoNotTrack() || !isStorageAvailable()) return;
  // The reader has already answered, in either direction.
  if (readFlag(NOTICE_KEY) || readFlag(DISABLED_KEY)) return;
  if (document.getElementById(NOTICE_ID)) return;

  const root = document.createElement('div');
  root.id = NOTICE_ID;
  root.className = 'n8nacTelemetryNotice';
  root.setAttribute('role', 'status');

  const text = document.createElement('p');
  text.className = 'n8nacTelemetryNotice__text';
  text.textContent =
    'This site counts anonymous page views to see which guides get used. No account, no cross-site tracking.';

  const link = document.createElement('a');
  link.className = 'n8nacTelemetryNotice__link';
  link.href = TELEMETRY_DOC_PATH;
  link.textContent = 'What gets collected';

  const actions = document.createElement('div');
  actions.className = 'n8nacTelemetryNotice__actions';

  const dismiss = () => {
    writeFlag(NOTICE_KEY, true);
    root.remove();
  };

  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'n8nacTelemetryNotice__button n8nacTelemetryNotice__button--primary';
  accept.textContent = 'Got it';
  accept.addEventListener('click', dismiss);

  const optOut = document.createElement('button');
  optOut.type = 'button';
  optOut.className = 'n8nacTelemetryNotice__button';
  optOut.textContent = 'Turn it off';
  optOut.addEventListener('click', () => {
    writeFlag(DISABLED_KEY, true);
    dismiss();
  });

  actions.append(accept, optOut);
  root.append(text, link, actions);
  document.body.append(root);
}

function initializeTelemetry(): void {
  trackDocsPageView();
  installRouteTracking();
  installTelemetryNotice();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeTelemetry, { once: true });
  } else {
    initializeTelemetry();
  }
}
