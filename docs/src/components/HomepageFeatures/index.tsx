import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  image: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Version Control for Workflows',
    image: require('@site/static/img/sections/section-0.png').default,
    description: (
      <>
        Manage your n8n workflows as code with Git. Track changes, collaborate with teams,
        and maintain a complete history of your automation evolution.
      </>
    ),
  },
  {
    title: 'AI-Powered Assistance',
    image: require('@site/static/img/sections/section-1.png').default,
    description: (
      <>
        Empower AI agents with n8nac-skills CLI tools to search 640+ nodes, retrieve technical schemas,
        validate workflows, and access 7000+ community workflow examples.
      </>
    ),
  },
  {
    title: 'Real-time Synchronization',
    image: require('@site/static/img/sections/section-2.png').default,
    description: (
      <>
        Keep workflows synchronized between local files and n8n instances.
        Changes in VS Code instantly reflect in n8n, and vice versa.
      </>
    ),
  },
  {
    title: 'VS Code Integration',
    image: require('@site/static/img/sections/section-3.png').default,
    description: (
      <>
        Edit workflows directly in VS Code with syntax highlighting, validation,
        and a split view showing JSON alongside the n8n canvas.
      </>
    ),
  },
  {
    title: 'Conflict Management',
    image: require('@site/static/img/sections/section-4.png').default,
    description: (
      <>
        Smart conflict detection prevents data loss. Visual diff tools help you
        choose which version to keep when conflicts occur.
      </>
    ),
  },
  {
    title: 'Multi-Instance Support',
    image: require('@site/static/img/sections/section-5.png').default,
    description: (
      <>
        Work with multiple n8n instances simultaneously. Workflows are automatically
        organized by instance to avoid mixing files.
      </>
    ),
  },
];

function Feature({title, image, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <img
          src={image}
          className={styles.featureImage}
          alt={title}
        />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
