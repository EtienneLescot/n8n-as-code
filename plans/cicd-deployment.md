# CI/CD Deployment Plan for Documentation

## Overview
Automated deployment pipeline for n8n-as-code documentation using GitHub Actions with multiple hosting options.

## 1. Deployment Options

### 1.1 Hosting Platform Comparison

| Platform | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **GitHub Pages** | Free, integrated with GitHub, simple | Limited features, custom domain only | **Primary Choice** |
| **Vercel** | Excellent performance, preview deployments, analytics | Requires Vercel account | Excellent alternative |
| **Netlify** | Good features, forms, functions | Slower builds, more complex | Good alternative |
| **Cloudflare Pages** | Fast, good security, edge network | Less mature documentation features | Advanced option |

### 1.2 Recommended: GitHub Pages + Vercel
- **Production**: GitHub Pages (main branch)
- **Preview**: Vercel (PR deployments)
- **Development**: Local builds

## 2. GitHub Actions Workflow

### 2.1 Main Deployment Workflow (`.github/workflows/deploy-docs.yml`)
```yaml
name: Deploy Documentation

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'packages/**'
      - 'scripts/**'
      - 'typedoc.json'
      - 'tsconfig.typedoc.json'
      - '.github/workflows/deploy-docs.yml'
  pull_request:
    branches: [main]
    paths:
      - 'docs/**'
      - 'packages/**'
      - 'scripts/**'
      - 'typedoc.json'
  workflow_dispatch: # Manual trigger

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Generate API documentation
        run: npm run docs:api

      - name: Build documentation site
        run: |
          cd docs
          npm ci
          npm run build

      - name: Deploy to GitHub Pages
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/build
          publish_branch: gh-pages
          cname: docs.n8n-as-code.dev
          keep_files: false

      - name: Upload build artifact
        if: github.event_name == 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: documentation-preview
          path: ./docs/build
          retention-days: 7

      - name: Deploy preview to Vercel
        if: github.event_name == 'pull_request'
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./docs
```

### 2.2 Documentation Validation Workflow (`.github/workflows/validate-docs.yml`)
```yaml
name: Validate Documentation

on:
  pull_request:
    paths:
      - 'docs/**'
      - 'packages/**/src/**/*.ts'
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'packages/**/src/**/*.ts'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Validate TSDoc comments
        run: node scripts/validate-tsdoc.js

      - name: Check broken links
        run: |
          cd docs
          npm ci
          npx broken-link-checker --filter-level 3 --verbose

      - name: Validate Markdown
        uses: gaurav-nelson/github-action-markdown-link-check@v1
        with:
          use-quiet-mode: 'yes'
          use-verbose-mode: 'yes'
          config-file: '.github/markdown-link-check.json'

      - name: Build documentation (dry run)
        run: |
          npm run build
          npm run docs:api
          cd docs && npm run build
```

## 3. Vercel Configuration

### 3.1 `vercel.json` Configuration
```json
{
  "buildCommand": "npm run docs:build-vercel",
  "outputDirectory": "build",
  "devCommand": "npm run start",
  "installCommand": "npm install",
  "framework": "docusaurus",
  "github": {
    "enabled": true,
    "silent": true
  },
  "regions": ["fra1"],
  "public": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

### 3.2 Environment Variables
Set in Vercel dashboard:
- `NODE_VERSION`: 18
- `NPM_FLAGS`: --legacy-peer-deps
- `ALGOLIA_APP_ID`: (if using Algolia)
- `ALGOLIA_API_KEY`: (if using Algolia)

## 4. GitHub Pages Configuration

### 4.1 Repository Settings
1. Go to Settings → Pages
2. Source: Deploy from a branch
3. Branch: `gh-pages` (/root)
4. Custom domain: `docs.n8n-as-code.dev`

### 4.2 Custom Domain Setup
```bash
# Add CNAME file to docs/static
echo "docs.n8n-as-code.dev" > docs/static/CNAME

# Configure DNS
# A records pointing to GitHub Pages IPs:
# 185.199.108.153
# 185.199.109.153
# 185.199.110.153
# 185.199.111.153
```

## 5. Build Optimization

### 5.1 Caching Strategy
```yaml
# In GitHub Actions
- name: Cache node modules
  uses: actions/cache@v3
  with:
    path: |
      ~/.npm
      node_modules
      packages/*/node_modules
      docs/node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-

- name: Cache TypeDoc output
  uses: actions/cache@v3
  with:
    path: docs/api
    key: ${{ runner.os }}-typedoc-${{ hashFiles('packages/**/src/**/*.ts') }}
    restore-keys: |
      ${{ runner.os }}-typedoc-
```

### 5.2 Build Script Optimization
Update `package.json` scripts:
```json
{
  "scripts": {
    "docs:build-vercel": "npm run docs:api && cd docs && npm run build",
    "docs:build-gh-pages": "npm run docs:api && cd docs && npm run build && echo 'docs.n8n-as-code.dev' > build/CNAME",
    "docs:preview": "npm run docs:api && cd docs && npm run start"
  }
}
```

## 6. Monitoring and Analytics

### 6.1 GitHub Pages Monitoring
```yaml
# .github/workflows/monitor-docs.yml
name: Monitor Documentation

on:
  schedule:
    - cron: '0 0 * * *' # Daily
  workflow_dispatch:

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Check documentation site
        run: |
          curl -s -o /dev/null -w "%{http_code}" https://docs.n8n-as-code.dev
          # Should return 200
          
      - name: Check broken links
        run: |
          npx broken-link-checker https://docs.n8n-as-code.dev \
            --filter-level 3 \
            --rate-limit 10 \
            --user-agent "GitHub-Actions-Monitor"
            
      - name: Send notification on failure
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'Documentation site monitoring failed',
              body: 'The documentation site check failed. Please investigate.',
              labels: ['documentation', 'monitoring']
            })
```

### 6.2 Analytics Integration
```javascript
// docs/docusaurus.config.js
plugins: [
  [
    '@docusaurus/plugin-google-analytics',
    {
      trackingID: 'UA-XXXXXXXXX-X',
      anonymizeIP: true,
    },
  ],
  [
    '@docusaurus/plugin-google-gtag',
    {
      trackingID: 'G-XXXXXXXXXX',
      anonymizeIP: true,
    },
  ],
],
```

## 7. Rollback Strategy

### 7.1 Manual Rollback
```bash
# Revert to previous deployment
git checkout gh-pages
git revert HEAD --no-edit
git push origin gh-pages
```

### 7.2 Automated Rollback Workflow
```yaml
# .github/workflows/rollback-docs.yml
name: Rollback Documentation

on:
  workflow_dispatch:
    inputs:
      commit:
        description: 'Commit hash to rollback to'
        required: true

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout gh-pages branch
        uses: actions/checkout@v4
        with:
          ref: gh-pages
          fetch-depth: 0

      - name: Rollback to specified commit
        run: |
          git reset --hard ${{ github.event.inputs.commit }}
          git push origin gh-pages --force

      - name: Create rollback issue
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Documentation rolled back to ${{ github.event.inputs.commit }}`,
              body: `Documentation site has been rolled back to commit ${{ github.event.inputs.commit }}`,
              labels: ['documentation', 'rollback']
            })
```

## 8. Security Considerations

### 8.1 Secrets Management
- Store API keys in GitHub Secrets
- Use environment-specific configurations
- Rotate keys regularly
- Limit token permissions

### 8.2 Access Control
- Restrict who can deploy to production
- Require reviews for documentation changes
- Audit deployment logs
- Monitor for unauthorized changes

### 8.3 Content Security
- Scan for malicious content
- Validate external links
- Sanitize user-generated content (if any)
- Regular security audits

## 9. Performance Optimization

### 9.1 Build Time Optimization
```yaml
# Parallel build steps
strategy:
  matrix:
    package: [core, cli, agent-cli]
  fail-fast: false
```

### 9.2 Asset Optimization
- Compress images
- Minify CSS and JavaScript
- Use CDN for static assets
- Implement caching headers

### 9.3 Monitoring Performance
```yaml
- name: Performance audit
  run: |
    npx lighthouse https://docs.n8n-as-code.dev \
      --output json \
      --output-path ./lighthouse-report.json \
      --chrome-flags="--headless"
```

## 10. Documentation Versioning

### 10.1 Version Strategy
- Main branch: Latest version
- Tagged releases: Versioned documentation
- Archive old versions if needed

### 10.2 Docusaurus Versioning
```javascript
// docs/docusaurus.config.js
themeConfig: {
  navbar: {
    items: [
      {
        type: 'docsVersionDropdown',
        position: 'left',
        dropdownItemsAfter: [{to: '/versions', label: 'All versions'}],
        dropdownActiveClassDisabled: true,
      },
    ],
  },
},
```

## 11. Implementation Timeline

### Week 1: Setup
- Configure GitHub Actions workflows
- Set up GitHub Pages
- Configure Vercel for previews
- Implement basic monitoring

### Week 2: Optimization
- Implement caching
- Optimize build times
- Set up analytics
- Configure security headers

### Week 3: Monitoring
- Implement comprehensive monitoring
- Set up alerts
- Create rollback procedures
- Document deployment process

### Week 4: Polish
- Performance tuning
- Security audit
- Documentation of CI/CD process
- Team training

## 12. Success Metrics

### Deployment Metrics
- Build time under 5 minutes
- Deployment time under 2 minutes
- 99.9% uptime
- Zero failed deployments per month

### Performance Metrics
- Page load time under 3 seconds
- Lighthouse score > 90
- Time to first byte < 500ms

### Quality Metrics
- Zero broken links
- 100% valid TSDoc comments
- All PRs get preview deployments
- Monthly security scans clean