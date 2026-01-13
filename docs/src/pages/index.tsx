import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs">
            🚀 Start Automating with n8n-as-code
          </Link>
          <Link
            className="button button--outline button--lg margin-left--md"
            href="https://github.com/EtienneLescot/n8n-as-code">
            ⭐ Star on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="Manage your n8n workflows as code with version control, AI assistance, and seamless VS Code integration. Transform automations into synchronized local JSON files.">
      <HomepageHeader />
      <main>
        <section className={styles.heroSection}>
          <div className="container">
            <div className="row">
              <div className="col col--8 col--offset-2">
                <div className="text--center padding-vert--lg">
                  <h2>Why n8n-as-code?</h2>
                  <p className="text--large">
                    n8n-as-code bridges the gap between visual workflow automation and software engineering best practices. 
                    It provides version control, AI-powered assistance, real-time synchronization, and professional development tools for your n8n workflows.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <HomepageFeatures />
        <section className={styles.ctaSection}>
          <div className="container">
            <div className="row">
              <div className="col col--8 col--offset-2">
                <div className="text--center padding-vert--xl">
                  <h2>Ready to transform your workflow automation?</h2>
                  <p className="text--large margin-bottom--lg">
                    Start managing your n8n workflows as code today with version control, AI assistance, and professional development tools.
                  </p>
                  <div className={styles.buttons}>
                    <Link
                      className="button button--primary button--lg"
                      to="/docs/getting-started">
                      🚀 Launch Your First Workflow
                    </Link>
                    <Link
                      className="button button--outline button--lg margin-left--md"
                      href="https://github.com/EtienneLescot/n8n-as-code">
                      🔍 Explore the Codebase
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
