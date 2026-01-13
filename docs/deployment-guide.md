# Deployment Guide for n8n-as-code Documentation

This guide explains how to deploy and monitor the n8n-as-code documentation.

## 🚀 Deployment Options

The documentation can be deployed using several methods:

1. **GitHub Pages** (Recommended): Automatic deployment via GitHub Actions
2. **Netlify**: Easy deployment with previews
3. **Vercel**: Fast deployment with edge network
4. **Self-hosted**: Deploy to your own server

## 📊 GitHub Pages Deployment

### Prerequisites

1. **GitHub Repository**: Your code must be in a GitHub repository
2. **GitHub Actions Enabled**: Actions must be enabled in repository settings
3. **GitHub Pages Enabled**: Go to Settings > Pages and enable GitHub Pages

### Step 1: Configure GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings > Pages**
3. Configure the source:
   - **Branch**: `gh-pages` (or your preferred branch)
   - **Folder**: `/ (root)`
4. Click **Save**

### Step 2: Configure GitHub Actions Secrets

The deployment workflow needs these secrets (optional for public repos):

1. Go to **Settings > Secrets and variables > Actions**
2. Add the following secrets if needed:
   - `ALGOLIA_APP_ID`: Algolia application ID
   - `ALGOLIA_API_KEY`: Algolia API key
   - `ALGOLIA_INDEX_NAME`: Algolia index name

### Step 3: Trigger Deployment

The documentation deploys automatically when:
- Changes are pushed to the `main` branch
- Pull requests are merged to `main`
- The workflow is manually triggered

### Step 4: Verify Deployment

1. Check the **Actions** tab in your repository
2. Look for the "Documentation" workflow
3. Wait for it to complete
4. Visit your GitHub Pages URL (usually `https://<username>.github.io/<repository>`)

## 🌐 Custom Domain Setup

### Step 1: Configure Custom Domain

1. Go to **Settings > Pages**
2. Under "Custom domain", enter your domain (e.g., `docs.n8n-as-code.dev`)
3. Click **Save**

### Step 2: Configure DNS

Add these DNS records to your domain provider:

**For apex domain (n8n-as-code.dev):**
```
Type: A
Name: @
Value: 185.199.108.153
TTL: Auto
```

**For www subdomain (www.n8n-as-code.dev):**
```
Type: CNAME
Name: www
Value: <username>.github.io
TTL: Auto
```

### Step 3: Update Docusaurus Configuration

Update `docs/docusaurus.config.ts`:

```typescript
const config: Config = {
  url: 'https://n8n-as-code.dev', // Your custom domain
  baseUrl: '/', // Root path
  // ... rest of configuration
};
```

### Step 4: Enable HTTPS

GitHub Pages automatically provisions SSL certificates for custom domains. It may take up to 24 hours.

## 🔧 Netlify Deployment

### Step 1: Connect Repository

1. Sign in to [Netlify](https://netlify.com)
2. Click **Add new site > Import an existing project**
3. Connect your GitHub repository

### Step 2: Configure Build Settings

```
Build command: npm run docs:build
Publish directory: docs/build
```

### Step 3: Environment Variables

Add environment variables in Netlify dashboard:
- `ALGOLIA_APP_ID`
- `ALGOLIA_API_KEY`
- `ALGOLIA_INDEX_NAME`

### Step 4: Deploy

Netlify will automatically deploy when you push to your repository.

## 🚢 Vercel Deployment

### Step 1: Connect Repository

1. Sign in to [Vercel](https://vercel.com)
2. Click **Add New Project**
3. Import your GitHub repository

### Step 2: Configure Project

```
Framework Preset: Docusaurus
Root Directory: docs
Build Command: npm run build
Output Directory: build
```

### Step 3: Environment Variables

Add environment variables in Vercel dashboard.

### Step 4: Deploy

Vercel will automatically deploy on push.

## 📈 Monitoring and Analytics

### Google Analytics

Add Google Analytics to track usage:

1. **Update Docusaurus Configuration**:

```typescript
// In docusaurus.config.ts
themeConfig: {
  // ... other configuration
  googleAnalytics: {
    trackingID: 'UA-XXXXX-Y', // Your tracking ID
    anonymizeIP: true,
  },
},
```

2. **Add Plugin**:

```typescript
plugins: [
  // ... other plugins
  [
    '@docusaurus/plugin-google-analytics',
    {
      trackingID: 'UA-XXXXX-Y',
      anonymizeIP: true,
    },
  ],
],
```

### Algolia Analytics

If using Algolia DocSearch, analytics are available in the Algolia dashboard.

### GitHub Pages Analytics

GitHub Pages provides basic traffic analytics:
1. Go to **Settings > Pages**
2. Scroll to "GitHub Pages site health"
3. View traffic analytics

## 🚨 Error Monitoring

### Sentry Integration

Add Sentry for error monitoring:

1. **Install Sentry Plugin**:

```bash
cd docs
npm install @sentry/docusaurus
```

2. **Configure Sentry**:

```typescript
// In docusaurus.config.ts
plugins: [
  // ... other plugins
  [
    '@sentry/docusaurus',
    {
      dsn: 'YOUR_SENTRY_DSN',
      tracesSampleRate: 0.1,
    },
  ],
],
```

### Custom Error Pages

Create custom error pages in `docs/src/pages`:

- `404.tsx` - Page not found
- `500.tsx` - Server error

## 🔄 Continuous Deployment

### Branch Protection

Enable branch protection for `main` branch:
1. Go to **Settings > Branches**
2. Add branch protection rule for `main`
3. Enable:
   - Require status checks to pass
   - Require branches to be up to date
   - Include administrators

### Preview Deployments

GitHub Actions automatically creates preview deployments for pull requests.

### Rollback Strategy

To rollback a deployment:

1. **GitHub Pages**: Revert to previous commit
2. **Netlify**: Use rollback feature in dashboard
3. **Vercel**: Use rollback feature in dashboard

## 📊 Performance Monitoring

### Lighthouse CI

Add Lighthouse CI to monitor performance:

1. **Add to GitHub Actions**:

```yaml
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v9
  with:
    configPath: './lighthouserc.json'
    uploadArtifacts: true
    temporaryPublicStorage: true
```

2. **Create Lighthouse Configuration**:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000"],
      "startServerCommand": "npm run serve",
      "startServerReadyPattern": "Docusaurus site is running",
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.9}],
        "categories:accessibility": ["error", {"minScore": 0.9}],
        "categories:best-practices": ["error", {"minScore": 0.9}],
        "categories:seo": ["error", {"minScore": 0.9}]
      }
    }
  }
}
```

## 🔒 Security

### Content Security Policy

Add CSP headers for security:

```typescript
// In docusaurus.config.ts
themeConfig: {
  // ... other configuration
  headTags: [
    {
      tagName: 'meta',
      attributes: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.google-analytics.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://www.google-analytics.com;",
      },
    },
  ],
},
```

### Rate Limiting

For self-hosted deployments, configure rate limiting in your web server.

## 📝 Maintenance

### Regular Updates

1. **Update Docusaurus**: `npm update @docusaurus/core @docusaurus/preset-classic`
2. **Update Dependencies**: `npm audit fix`
3. **Rebuild Documentation**: `npm run docs:build`

### Backup Strategy

1. **Git**: All documentation is version controlled
2. **Build Artifacts**: GitHub Actions stores build artifacts
3. **External Backup**: Regular backups of deployment configuration

### Monitoring Checklist

- [ ] Website is accessible
- [ ] Search is working
- [ ] Links are not broken
- [ ] Performance meets standards
- [ ] Analytics are collecting data
- [ ] Error monitoring is active

## 🆘 Troubleshooting

### Common Issues

**Issue**: Deployment fails
**Solution**: Check GitHub Actions logs for errors

**Issue**: Custom domain not working
**Solution**: Verify DNS configuration and wait for propagation

**Issue**: Search not working
**Solution**: Check Algolia credentials and indexing

**Issue**: Performance issues
**Solution**: Run Lighthouse audit and optimize images/content

### Getting Help

- [GitHub Issues](https://github.com/EtienneLescot/n8n-as-code/issues)
- [Docusaurus Discord](https://discord.gg/docusaurus)
- [GitHub Community](https://github.com/community)

## 📚 Additional Resources

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Docusaurus Deployment Guide](https://docusaurus.io/docs/deployment)
- [Netlify Documentation](https://docs.netlify.com/)
- [Vercel Documentation](https://vercel.com/docs)

---

*Last updated: January 2026*