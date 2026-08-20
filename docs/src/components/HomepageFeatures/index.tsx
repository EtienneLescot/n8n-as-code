import type {ReactNode} from 'react';
import Heading from '@theme/Heading';

import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: string;
  /** Functional illustration drawn in markup, not a rendered image. */
  visual: ReactNode;
};

function StatusShot(): ReactNode {
  return (
    <div className={styles.shotDark}>
      <div className={styles.barDark}>
        <span className={`${styles.barDot} ${styles.markRose}`} aria-hidden="true" />
        n8nac status
      </div>
      <div className={styles.codeDark}>
        <div className={styles.dim}>instance prod · project billing</div>
        <div className={styles.statusRow}>
          <span className={styles.rose}>↑</span>
          <span>order-alert.workflow.ts</span>
          <span className={styles.dim}>local ahead</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.blue}>↓</span>
          <span>weekly-digest.workflow.ts</span>
          <span className={styles.dim}>remote ahead</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.green}>=</span>
          <span>invoice-sync.workflow.ts</span>
          <span className={styles.dim}>in sync</span>
        </div>
      </div>
    </div>
  );
}

function SchemaShot(): ReactNode {
  const options = ['predefinedCredentialType', 'genericCredentialType', 'none'];
  return (
    <div className={styles.shotLight}>
      <div className={styles.barLight}>
        <span className={styles.barLabel}>skill ▸</span>
        httpRequest.authentication
      </div>
      <div className={styles.schemaBody}>
        {options.map((option) => (
          <div key={option} className={styles.schemaRow}>
            <span>{option}</span>
            <span className={styles.schemaType}>enum</span>
          </div>
        ))}
        <div className={styles.schemaNote}>3 of 17,155 option values · no guessing</div>
      </div>
    </div>
  );
}

function WorkflowCodeShot(): ReactNode {
  return (
    <div className={styles.shotDark}>
      <div className={styles.barDark}>
        <span className={`${styles.barDot} ${styles.markBlue}`} aria-hidden="true" />
        order-alert.workflow.ts
      </div>
      <div className={styles.codeDark}>
        <div>
          <span className={styles.pink}>@Workflow</span>
          <span className={styles.dim}>(</span>name: <span className={styles.string}>&apos;order-alert&apos;</span>
          <span className={styles.dim}>)</span>
        </div>
        <div>
          <span className={styles.blue}>export class</span> OrderAlert <span className={styles.dim}>&#123;</span>
        </div>
        <div className={styles.indent1}>
          <span className={styles.pink}>@Webhook</span>
          <span className={styles.dim}>(</span>path: <span className={styles.string}>&apos;orders&apos;</span>
          <span className={styles.dim}>)</span> trigger;
        </div>
        <div className={styles.indent1}>
          <span className={styles.pink}>@If</span>
          <span className={styles.dim}>(</span>total <span className={styles.blue}>&gt;</span>{' '}
          <span className={styles.green}>500</span>
          <span className={styles.dim}>)</span> gate;
        </div>
        <div className={styles.indent1}>
          <span className={styles.pink}>@Slack</span>
          <span className={styles.dim}>(</span>channel: <span className={styles.string}>&apos;#alerts&apos;</span>
          <span className={styles.dim}>)</span> notify;
        </div>
        <div>
          <span className={styles.dim}>&#125;</span>
        </div>
      </div>
    </div>
  );
}

function CanvasShot(): ReactNode {
  return (
    <div className={styles.shotLight}>
      <div className={styles.barMeta}>canvas preview</div>
      <div className={styles.canvas}>
        <div className={styles.canvasFlow}>
          <span className={styles.nodeRoot}>
            <span className={`${styles.nodeDot} ${styles.markRose}`} aria-hidden="true" />
            Webhook
          </span>
          <span className={styles.wire} aria-hidden="true" />
          <div className={styles.branchColumn}>
            <span className={styles.nodeGate}>
              <span className={`${styles.nodeDot} ${styles.markBlue}`} aria-hidden="true" />
              If
            </span>
            <div className={styles.branches}>
              <div className={styles.branch}>
                <span className={styles.node}>
                  <span className={`${styles.nodeDot} ${styles.markGreen}`} aria-hidden="true" />
                  Slack
                </span>
                <span className={styles.branchLabel}>true</span>
              </div>
              <div className={styles.branch}>
                <span className={styles.node}>
                  <span className={`${styles.nodeDot} ${styles.markAmber}`} aria-hidden="true" />
                  NoOp
                </span>
                <span className={styles.branchLabel}>false</span>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.canvasBadge}>
          <span className={styles.canvasTick}>✓</span>structure valid · 4 nodes
        </div>
      </div>
    </div>
  );
}

function ConflictShot(): ReactNode {
  return (
    <div className={styles.shotLight}>
      <div className={styles.barMeta}>
        <span>three-way compare</span>
        <span className={styles.conflictCount}>1 conflict</span>
      </div>
      <div className={styles.diff}>
        <div className={styles.diffRow}>
          <div className={styles.diffHead}>base</div>
          <div className={styles.diffHead}>local</div>
          <div className={styles.diffHead}>remote</div>
        </div>
        <div className={styles.diffRow}>
          <div className={styles.diffCell}>retry: 1</div>
          <div className={styles.diffCell}>retry: 1</div>
          <div className={styles.diffCell}>retry: 1</div>
        </div>
        <div className={styles.diffRow}>
          <div className={styles.diffBase}>total &gt; 100</div>
          <div className={styles.diffLocal}>total &gt; 500</div>
          <div className={styles.diffRemote}>total &gt; 250</div>
        </div>
        <div className={styles.diffActions}>
          <span className={styles.chipSolid}>keep local</span>
          <span className={styles.chipOutline}>keep remote</span>
        </div>
      </div>
    </div>
  );
}

function TreeShot(): ReactNode {
  return (
    <div className={styles.shotDark}>
      <div className={styles.barDark}>
        <span className={`${styles.barDot} ${styles.markAmber}`} aria-hidden="true" />
        instance / project / workflow
      </div>
      <div className={styles.codeDark}>
        <div className={styles.blue}>workflows/</div>
        <div className={`${styles.indent1} ${styles.pink}`}>prod/</div>
        <div className={`${styles.indent2} ${styles.amber}`}>billing/</div>
        <div className={styles.indent3}>order-alert.workflow.ts</div>
        <div className={styles.indent3}>invoice-sync.workflow.ts</div>
        <div className={`${styles.indent1} ${styles.pink}`}>staging/</div>
        <div className={`${styles.indent2} ${styles.amber}`}>billing/</div>
        <div className={styles.indent3}>order-alert.workflow.ts</div>
      </div>
    </div>
  );
}

const FeatureList: FeatureItem[] = [
  {
    title: 'Explicit Git-like workflow',
    description:
      'List current status, pull the workflow you want, edit locally, then push a specific filename back to n8n. Clear operations beat hidden background behavior.',
    visual: <StatusShot />,
  },
  {
    title: 'AI Skill with real context',
    description:
      'Schema-accurate node data, documentation, validation, and thousands of workflow examples, packaged for fast local search instead of model guesswork.',
    visual: <SchemaShot />,
  },
  {
    title: 'TypeScript workflows',
    description:
      'Readable decorators and stable diffs, so humans and coding agents reason about automation as code instead of opaque JSON blobs.',
    visual: <WorkflowCodeShot />,
  },
  {
    title: 'Canvas preview in VS Code',
    description:
      'Edit in code while keeping the n8n canvas close. The IDE becomes the place where review, validation, preview, and sync decisions happen together.',
    visual: <CanvasShot />,
  },
  {
    title: 'Deterministic conflict resolution',
    description:
      'Three-way comparison detects real conflicts, avoids false positives, and keeps resolution visible through diffs and explicit keep-local or keep-remote actions.',
    visual: <ConflictShot />,
  },
  {
    title: 'Project-aware local structure',
    description:
      'Instances and projects stay separated on disk, so teams version the right workflows without cross-environment confusion.',
    visual: <TreeShot />,
  },
];

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className={styles.shell}>
        <div className={styles.kicker}>What the stack gives you</div>
        <Heading as="h2" className={styles.title}>
          A workflow system designed for AI execution and human review.
        </Heading>
        <p className={styles.lead}>
          Every screen below is the real artifact — the terminal output, the file, the diff.
        </p>
        <div className={styles.grid}>
          {FeatureList.map((feature) => (
            <article key={feature.title} className={styles.card}>
              <div className={styles.media}>{feature.visual}</div>
              <div className={styles.body}>
                <Heading as="h3">{feature.title}</Heading>
                <p>{feature.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
