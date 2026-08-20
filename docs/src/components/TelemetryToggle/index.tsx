import {useCallback, useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

import {
  DISABLED_KEY,
  NOTICE_KEY,
  isDoNotTrack,
  isStorageAvailable,
  readFlag,
  writeFlag,
} from '@site/src/telemetry/preferences';

import styles from './styles.module.css';

/**
 * `loading` covers the server render and the first paint, before the
 * browser-only preference can be read.
 */
type State = 'loading' | 'not-configured' | 'do-not-track' | 'no-storage' | 'enabled' | 'disabled';

export default function TelemetryToggle(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  const posthogKey = (siteConfig.customFields as {posthogKey?: string}).posthogKey;
  const [state, setState] = useState<State>('loading');

  const resolve = useCallback((): State => {
    if (!posthogKey) return 'not-configured';
    if (isDoNotTrack()) return 'do-not-track';
    if (!isStorageAvailable()) return 'no-storage';
    return readFlag(DISABLED_KEY) ? 'disabled' : 'enabled';
  }, [posthogKey]);

  useEffect(() => {
    setState(resolve());
  }, [resolve]);

  const toggle = () => {
    const nextDisabled = state === 'enabled';
    writeFlag(DISABLED_KEY, nextDisabled);
    // Answering here counts as answering, so the notice never appears later.
    writeFlag(NOTICE_KEY, true);
    setState(resolve());
  };

  if (state === 'loading') {
    return <div className={styles.panel} aria-busy="true" />;
  }

  if (state === 'not-configured') {
    return (
      <div className={styles.panel}>
        <p className={styles.status}>
          <span className={styles.dotOff} aria-hidden="true" />
          This build of the site has no analytics project configured, so it collects nothing.
        </p>
      </div>
    );
  }

  if (state === 'do-not-track') {
    return (
      <div className={styles.panel}>
        <p className={styles.status}>
          <span className={styles.dotOff} aria-hidden="true" />
          Your browser sends Do Not Track, so this site collects nothing. That setting wins over
          anything chosen here.
        </p>
      </div>
    );
  }

  if (state === 'no-storage') {
    return (
      <div className={styles.panel}>
        <p className={styles.status}>
          <span className={styles.dotOff} aria-hidden="true" />
          This browser is blocking site storage. The site cannot remember a preference, so it
          collects nothing.
        </p>
      </div>
    );
  }

  const enabled = state === 'enabled';
  return (
    <div className={styles.panel}>
      <p className={styles.status}>
        <span className={enabled ? styles.dotOn : styles.dotOff} aria-hidden="true" />
        Anonymous page views from this browser are {enabled ? 'on' : 'off'}.
      </p>
      <button type="button" className={styles.button} onClick={toggle}>
        {enabled ? 'Turn off for this browser' : 'Turn on for this browser'}
      </button>
      <p className={styles.note}>
        The choice is stored in this browser only, under{' '}
        <code>n8n-as-code:telemetry-disabled</code>.
      </p>
    </div>
  );
}
