import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

const heroChips = ['537 nodes', '100% schema coverage', '7,702 templates'];

const manifestRows = [
  {
    value: '537',
    label: 'n8n nodes indexed',
    detail: '433 core + 104 AI/LangChain. Nothing missing from the official catalog.',
  },
  {
    value: '100%',
    label: 'Schema coverage',
    detail: '10,209 properties and 17,155 option values your agent cannot hallucinate.',
  },
  {
    value: '1,243',
    label: 'Docs pages wired in',
    detail: '93% of nodes have linked official documentation.',
  },
  {
    value: '7,702',
    label: 'Community templates',
    detail: 'The full library, searchable locally in about 5 ms.',
  },
  {
    value: '104',
    label: 'AI nodes',
    detail: 'Agents, chains, LLMs, tools, memory, vector stores, retrievers.',
  },
  {
    value: '170',
    label: 'Example pages',
    detail: 'Concrete snippets extracted from official docs for faster repair.',
  },
  {
    value: 'always',
    label: 'Validation before push',
    detail: 'Schema checks run before you ship and before your agent drifts.',
  },
];

const audiences = [
  {
    kicker: '01 / agents',
    title: 'For coding agents',
    text: 'Node schemas, option values, docs, templates, and validation instead of guessing how n8n works.',
    link: '/docs/usage/vscode-extension',
    cta: 'See the agent workflow',
  },
  {
    kicker: '02 / gitops',
    title: 'For GitOps',
    text: 'Workflows become readable local files you can diff, review, and merge cleanly in pull requests.',
    link: '/docs/getting-started',
    cta: 'Read the GitOps flow',
  },
  {
    kicker: '03 / editor',
    title: 'For VS Code',
    text: 'Inspect status, preview the canvas, validate structure, and push only when you decide to.',
    link: '/docs/usage/vscode-extension',
    cta: 'Explore the extension',
  },
];

const loopSteps = [
  {
    n: '01',
    title: 'Search',
    text: 'Your agent searches nodes, docs, examples, and schemas before it writes anything.',
  },
  {
    n: '02',
    title: 'Pull',
    text: 'Bring the workflow into a local Git-tracked file so the change is reviewable and reproducible.',
  },
  {
    n: '03',
    title: 'Edit',
    text: 'Work in JSON or TypeScript with a structure humans read and agents manipulate reliably.',
  },
  {
    n: '04',
    title: 'Validate',
    text: 'Check against the real schema so bad parameters and fake options get caught early.',
  },
  {
    n: '05',
    title: 'Push',
    text: 'Ship the exact local file back to n8n with an explicit action, not magical sync.',
  },
];

function Hero(): ReactNode {
  return (
    <section className={styles.hero}>
      <div className={styles.shell}>
        <div className={styles.heroGrid}>
          <div>
            <div className={styles.heroBadge}>
              <span className={styles.badgeDot} aria-hidden="true" />
              GitOps · AI Skills · TypeScript
            </div>
            <Heading as="h1" className={styles.heroTitle}>
              The AI Skill that gives your coding agent{' '}
              <span className={styles.heroAccent}>n8n superpowers.</span>
            </Heading>
            <p className={styles.heroLead}>
              Give your agent the full n8n ontology — nodes, schemas, docs, templates,
              validation, and the real shape of what can connect to what. Then keep the workflow
              itself in clean local code, so pull requests stay readable and GitOps stays real.
            </p>
            <div className={styles.chips}>
              {heroChips.map((chip) => (
                <span key={chip} className={styles.chip}>
                  {chip}
                </span>
              ))}
            </div>
            <div className={styles.actions}>
              <Link className={styles.btnPrimary} to="/docs/getting-started">
                Start with the quick guide
              </Link>
              <Link className={styles.btnSecondary} to="/docs/usage/vscode-extension">
                Explore the VS Code experience
              </Link>
            </div>
          </div>

          <div className={styles.heroStage}>
            <div className={styles.terminal}>
              <div className={styles.terminalBar}>
                <span className={styles.trafficLights} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className={styles.terminalLabel}>workflow lifecycle</span>
              </div>
              <div className={styles.terminalBody}>
                <div>
                  <span className={styles.prompt}>$</span> n8nac list
                </div>
                <div className={styles.dim}>3 workflows · prod/billing</div>
                <div>
                  <span className={styles.prompt}>$</span> n8nac pull abc123
                </div>
                <div className={styles.dim}>
                  → workflows/prod/billing/order-alert.workflow.ts
                </div>
                <div>
                  <span className={styles.prompt}>$</span> n8nac push order-alert.workflow.ts
                  --verify
                </div>
                <div className={styles.resultLine}>
                  <span className={styles.ok}>schema ok</span>
                  <span>18 nodes · 21 connections</span>
                </div>
                <div className={styles.resultLine}>
                  <span className={styles.info}>pushed</span>
                  <span>rev 4f1a9c → prod</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DatasetManifest(): ReactNode {
  return (
    <section className={styles.night}>
      <div className={styles.shell}>
        <div className={styles.manifestGrid}>
          <div className={styles.manifestCopy}>
            <div className={styles.kickerNight}>The case for agentic workflow development</div>
            <Heading as="h2" className={styles.titleNight}>
              The argument is in the dataset.
            </Heading>
            <p className={styles.leadNight}>
              Two things at once: a real n8n ontology instead of loose prompts and guesswork, and
              clean Git-friendly workflow files your team can actually review.
            </p>
            <div className={styles.tag}>
              <span className={styles.tagDot} aria-hidden="true" />
              searchable locally in ~5 ms · FlexSearch
            </div>
          </div>
          <div className={styles.manifestList}>
            {manifestRows.map((row) => (
              <div key={row.label} className={styles.manifestRow}>
                <div>
                  <div className={styles.rowLabel}>{row.label}</div>
                  <div className={styles.rowDetail}>{row.detail}</div>
                </div>
                <div className={styles.rowValue}>{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Audiences(): ReactNode {
  return (
    <section className={styles.audienceSection}>
      <div className={styles.shell}>
        <div className={styles.audienceInner}>
          <div className={styles.kicker}>What teams actually buy into</div>
          <Heading as="h2" className={styles.sectionTitle}>
            Better outputs for agents, better diffs for humans.
          </Heading>
          <div className={styles.audienceGrid}>
            {audiences.map((audience) => (
              <div key={audience.title} className={styles.audienceCard}>
                <div className={styles.audienceKicker}>{audience.kicker}</div>
                <h3>{audience.title}</h3>
                <p>{audience.text}</p>
                <Link className={styles.audienceLink} to={audience.link}>
                  {audience.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Loop(): ReactNode {
  return (
    <section className={styles.loopSection}>
      <div className={styles.shell}>
        <div className={styles.loopGrid}>
          <div>
            <div className={styles.kicker}>How the loop works</div>
            <Heading as="h2" className={styles.sectionTitle}>
              Agentic automation, grounded in GitOps.
            </Heading>
            <p className={styles.sectionLead}>
              The goal is not to hand-author every workflow like application code. It is to let
              agents build and update workflows from a trustworthy n8n ontology, while your team
              reviews clean local artifacts instead of opaque UI diffs.
            </p>
          </div>
          <div className={styles.loopSteps}>
            {loopSteps.map((step) => (
              <div key={step.n} className={styles.loopStep}>
                <div className={styles.loopIndex}>{step.n}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CallToAction(): ReactNode {
  return (
    <section className={styles.night}>
      <div className={styles.shell}>
        <div className={styles.ctaGrid}>
          <div>
            <div className={styles.kickerNight}>Start here</div>
            <Heading as="h2" className={styles.titleNight}>
              Give your coding agent the full n8n map.
            </Heading>
            <p className={styles.leadNight}>
              Wire an installable n8n ontology into your preferred agent, and keep every workflow
              change readable, validated, and reviewable from the first pull request.
            </p>
            <div className={styles.actions}>
              <Link className={styles.btnAccent} to="/docs/getting-started">
                Read the getting started guide
              </Link>
              <Link
                className={styles.btnGhost}
                href="https://github.com/EtienneLescot/n8n-as-code">
                View the GitHub repository
              </Link>
            </div>
          </div>
          <div className={styles.installPanel}>
            <div className={styles.installLabel}>install</div>
            <div className={styles.installBody}>
              <div>
                <span className={styles.prompt}>$</span> npm i -g @n8n-as-code/cli
              </div>
              <div>
                <span className={styles.prompt}>$</span> n8nac init
              </div>
              <div className={styles.dim}>skill installed · ontology ready</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="The AI Skill that gives your coding agent an installable n8n ontology, with GitOps for workflows, TypeScript output, and schema-grounded automation.">
      <div className={styles.page}>
        <Hero />
        <main>
          <DatasetManifest />
          <HomepageFeatures />
          <Audiences />
          <Loop />
          <CallToAction />
        </main>
      </div>
    </Layout>
  );
}
