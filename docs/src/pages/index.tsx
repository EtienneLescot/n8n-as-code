import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const productPillars = [
  'GitOps',
  'AI Skills',
  'TypeScript Workflows',
];

const proofPoints = [
  {
    icon: '🧩',
    value: '537 n8n nodes',
    label: 'Every official node indexed',
    detail: '433 core + 104 AI/LangChain nodes. Nothing missing from the official catalog.',
  },
  {
    icon: '📋',
    value: '100% schema coverage',
    label: 'Parameters your agent cannot hallucinate',
    detail: '10,209 properties and 17,155 option values packed into the skill.',
  },
  {
    icon: '📚',
    value: '1,243 docs pages',
    label: 'Official documentation wired in',
    detail: '93% of nodes have linked docs across integrations, triggers, AI, hosting, and code.',
  },
  {
    icon: '🔄',
    value: '7,702 templates',
    label: 'Community workflows on tap',
    detail: 'The full community library is searchable locally in about 5 ms with FlexSearch.',
  },
  {
    icon: '🤖',
    value: '104 AI nodes',
    label: 'LangChain coverage included',
    detail: 'Agents, chains, LLMs, tools, memory, vector stores, retrievers, and the rest.',
  },
  {
    icon: '💡',
    value: '170 example pages',
    label: 'Ready-to-use snippets extracted',
    detail: 'Concrete code examples pulled from official n8n docs for faster generation and repair.',
  },
  {
    icon: '✅',
    value: 'Built-in validation',
    label: 'Catch issues before production',
    detail: 'Schema validation checks the workflow before you push and before your agent drifts.',
  },
];

const entryPoints = [
  {
    title: 'For Coding Agents',
    text: 'Your agent gets node schemas, option values, docs, templates, and validation instead of trying to guess how n8n works.',
    link: '/docs/usage/vscode-extension',
    cta: 'See the agent workflow',
  },
  {
    title: 'For GitOps',
    text: 'Workflows become readable local files you can diff, review, and merge cleanly in pull requests.',
    link: '/docs/getting-started',
    cta: 'Read the GitOps flow',
  },
  {
    title: 'For VS Code',
    text: 'Use the extension to inspect status, preview the canvas, validate structure, and push only when you decide to.',
    link: '/docs/usage/vscode-extension',
    cta: 'Explore the VS Code experience',
  },
];

const workflowSteps = [
  {label: '1', title: 'Search', text: 'The skill lets your agent search nodes, docs, examples, and schemas before it writes anything.'},
  {label: '2', title: 'Pull', text: 'Bring the workflow into a local Git-tracked file so the change becomes reviewable and reproducible.'},
  {label: '3', title: 'Edit', text: 'Work in JSON or TypeScript with a structure that humans can read and agents can manipulate reliably.'},
  {label: '4', title: 'Validate', text: 'Check the generated workflow against the real schema so bad parameters and fake options get caught early.'},
  {label: '5', title: 'Push', text: 'Ship the exact local file back to n8n with an explicit action instead of pretending sync is magical.'},
];

function HomepageHeader() {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>GitOps · AI Skills · TypeScript Workflows</div>
            <Heading as="h1" className={styles.heroTitle}>
              The AI Skill that gives your coding agent{' '}
              <span className={styles.heroAccent}>n8n superpowers.</span>
            </Heading>
            <p className={styles.heroSubtitle}>
              Give your coding agent the full n8n ontology: nodes, schemas, docs, templates, validation,
              and the real shape of what can connect to what. Then keep the workflow itself in clean local code
              so pull requests stay readable and GitOps stays real.
            </p>
            <div className={styles.heroPills}>
              {productPillars.map((pillar) => (
                <span key={pillar} className={styles.heroPill}>
                  {pillar}
                </span>
              ))}
            </div>
            <div className={styles.buttons}>
              <Link
                className={clsx('button button--lg', styles.primaryButton)}
                to="/docs/getting-started">
                Start with the quick guide
              </Link>
              <Link
                className={clsx('button button--lg', styles.secondaryButton)}
                to="/docs/usage/vscode-extension">
                Explore the VS Code experience
              </Link>
            </div>
          </div>

          <div className={styles.heroPanel}>
            <div className={styles.panelWindow}>
              <div className={styles.panelDots}>
                <span />
                <span />
                <span />
              </div>
              <div className={styles.panelLabel}>Workflow lifecycle</div>
              <pre className={styles.commandBlock}>
                <code>{`$ n8nac list
$ n8nac pull abc123
$ n8nac push workflows/instance/project/order-alert.workflow.ts --verify`}</code>
              </pre>
              <div className={styles.panelCardGrid}>
                <div className={styles.panelCard}>
                  <span className={styles.cardKicker}>Agent</span>
                  <strong>Grounded generation</strong>
                  <p>Nodes, options, and examples come from the skill dataset, not from model guesswork.</p>
                </div>
                <div className={styles.panelCard}>
                  <span className={styles.cardKicker}>GitOps</span>
                  <strong>Readable workflow code</strong>
                  <p>Local files stay diffable, reviewable, and much easier to maintain in pull requests.</p>
                </div>
                <div className={styles.panelCard}>
                  <span className={styles.cardKicker}>VS Code</span>
                  <strong>Preview and validation</strong>
                  <p>Inspect status, open the canvas, and validate structure before you decide to push.</p>
                </div>
                <div className={styles.panelCard}>
                  <span className={styles.cardKicker}>Sync</span>
                  <strong>Explicit, not magical</strong>
                  <p>List, pull, validate, and push stay intentional so local and remote state never get blurred.</p>
                </div>
              </div>
            </div>
          </div>
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
      description="The AI Skill that gives your coding agent an installable n8n ontology, with GitOps for workflows, TypeScript output, and schema-grounded automation.">
      <HomepageHeader />
      <main>
        <section className={styles.proofSection}>
          <div className="container">
            <div className={styles.proofHeader}>
              <p className={styles.sectionEyebrow}>The case for agentic workflow development</p>
              <Heading as="h2" className={styles.sectionTitle}>
                The argument is in the dataset.
              </Heading>
              <p className={styles.sectionLead}>
                n8n-as-code is useful because it does two things at once: it gives your agent a real
                n8n ontology instead of loose prompts and guesswork, and it gives your team clean
                Git-friendly workflow files to review.
              </p>
            </div>
            <div className={styles.statsGrid}>
              {proofPoints.map((item) => (
                <div key={item.label} className={styles.statCard}>
                  <div className={styles.statTop}>
                    <span className={styles.statIcon}>{item.icon}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <div className={styles.statLabel}>{item.label}</div>
                  <p className={styles.statDetail}>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.entrySection}>
          <div className="container">
            <div className={styles.entryHeader}>
              <p className={styles.sectionEyebrow}>What teams actually buy into</p>
              <Heading as="h2" className={styles.sectionTitle}>
                Better outputs for agents, better diffs for humans.
              </Heading>
            </div>
            <div className={styles.entryGrid}>
              {entryPoints.map((entry) => (
                <div key={entry.title} className={styles.entryCard}>
                  <h3>{entry.title}</h3>
                  <p>{entry.text}</p>
                  <Link className={styles.inlineLink} to={entry.link}>
                    {entry.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <HomepageFeatures />

        <section className={styles.workflowSection}>
          <div className="container">
            <div className={styles.workflowLayout}>
              <div>
                <p className={styles.sectionEyebrow}>How the loop works</p>
                <Heading as="h2" className={styles.sectionTitle}>
                  Agentic automation, grounded in GitOps.
                </Heading>
                <p className={styles.sectionLead}>
                  The goal is not to hand-author every workflow like traditional application code.
                  The goal is to let agents build and update workflows from a trustworthy n8n ontology,
                  while your team reviews clean local artifacts instead of opaque UI diffs.
                </p>
              </div>
              <div className={styles.workflowStack}>
                {workflowSteps.map((step) => (
                  <div key={step.label} className={styles.workflowCard}>
                    <span>{step.label}</span>
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

        <section className={styles.ctaSection}>
          <div className="container">
            <div className={styles.ctaCard}>
              <p className={styles.sectionEyebrow}>Start here</p>
              <Heading as="h2" className={styles.ctaTitle}>
                Give your coding agent the full n8n map.
              </Heading>
              <p className={styles.ctaLead}>
                Start with the skill, wire an installable n8n ontology into your preferred agent, and keep every
                workflow change readable, validated, and reviewable from the first pull request.
              </p>
              <div className={styles.buttons}>
                <Link
                  className={clsx('button button--lg', styles.primaryButton)}
                  to="/docs/getting-started">
                  Read the getting started guide
                </Link>
                <Link
                  className={clsx('button button--lg', styles.ghostButton)}
                  href="https://github.com/EtienneLescot/n8n-as-code">
                  View the GitHub repository
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
