# Practical Testing Guide for n8n-as-code Documentation

## Quick Start Testing Commands

### 1. Local Build Testing
```bash
# Test the complete documentation build process
npm run test:docs

# Or run individual tests:
npm run docs:validate      # Validate Markdown and API docs
npm run docs:test-build    # Test TypeDoc generation
npm run docs:test-links    # Check for broken links
```

### 2. Automated Testing Scripts
I've created these ready-to-use scripts:

#### Build Test Script (`scripts/test-docs-build.sh`)
```bash
#!/bin/bash
# Run this to test the complete build process
chmod +x scripts/test-docs-build.sh
./scripts/test-docs-build.sh
```

#### TypeDoc Validation (`scripts/test-typedoc.js`)
```bash
# Test API documentation generation
node scripts/test-typedoc.js
```

#### Markdown Validation (`scripts/validate-markdown.js`)
```bash
# Validate all Markdown files
node scripts/validate-markdown.js
```

## Testing Workflow

### Step 1: Local Development Testing
```bash
# 1. Start local development server
cd docs
npm run start

# 2. Open browser to http://localhost:3000
# 3. Manually test:
#    - Navigation between pages
#    - Search functionality
#    - Mobile responsiveness
#    - Dark/light mode toggle
```

### Step 2: Build Validation
```bash
# 1. Build the documentation site
npm run docs:build

# 2. Check build output
ls -la docs/build/

# 3. Serve built site locally
npx serve docs/build/

# 4. Test production build at http://localhost:3000
```

### Step 3: Automated CI/CD Testing
The GitHub Actions workflows will automatically test:

1. **On every PR**: Build validation, link checking, TypeDoc generation
2. **On merge to main**: Full deployment test with Lighthouse audit
3. **Scheduled**: Daily health checks and broken link detection

## Testing Categories

### 1. Content Testing
```bash
# Check for broken links
npx broken-link-checker http://localhost:3000 --filter-level 3

# Validate Markdown syntax
npx markdownlint-cli docs/docs/

# Check for missing images
find docs/docs -name "*.md" -exec grep -l "!\[.*\]\(.*\)" {} \; | xargs -I {} sh -c 'echo "Checking {}:" && grep -o "!\[.*\]\(.*\)" {} | while read img; do if [[ $img =~ \!\[.*\]\((.*)\) ]]; then file=${BASH_REMATCH[1]}; if [[ ! $file =~ ^http ]] && [[ ! -f "docs/docs/$file" ]]; then echo "  Missing: $file"; fi; fi; done'
```

### 2. API Documentation Testing
```bash
# Generate and verify API docs
npm run docs:api

# Check generated files
ls -la docs/api/
ls -la docs/api/core/
ls -la docs/api/cli/

# Verify API docs are accessible
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/core/
# Should return 200
```

### 3. Performance Testing
```bash
# Run Lighthouse audit
npx lighthouse http://localhost:3000 --output json --output-path lighthouse-report.json

# Check performance metrics
cat lighthouse-report.json | jq '.categories.performance.score'
# Should be > 0.9

# Load testing (optional)
npx autocannon -c 10 -d 30 http://localhost:3000
```

### 4. Accessibility Testing
```bash
# Install accessibility testing tool
npm install -g pa11y

# Run accessibility tests
pa11y http://localhost:3000

# Check specific pages
pa11y http://localhost:3000/docs/getting-started
pa11y http://localhost:3000/api
```

## GitHub Actions Testing

### Preview Deployments
Every Pull Request automatically gets:
1. **Build validation** - Tests if documentation builds successfully
2. **Preview deployment** - Deploys to temporary URL for review
3. **Lighthouse audit** - Performance and accessibility scores
4. **Link checking** - Validates all internal links

### Production Deployment Testing
When merging to main:
1. **Full build** - Complete documentation generation
2. **Deployment to GitHub Pages** - Production deployment
3. **Health check** - Verifies site is accessible
4. **Monitoring setup** - Sets up ongoing monitoring

## Testing Checklist

### Before Committing
- [ ] Run `npm run test:docs`
- [ ] Check for broken links locally
- [ ] Verify API documentation generates correctly
- [ ] Test navigation on mobile viewport

### Before Merging to Main
- [ ] All GitHub Actions tests pass
- [ ] Lighthouse scores > 90
- [ ] No broken links detected
- [ ] Preview deployment works correctly
- [ ] Search functionality tested

### Monthly Maintenance
- [ ] Run full accessibility audit
- [ ] Update broken link report
- [ ] Review performance metrics
- [ ] Test search relevance
- [ ] Verify mobile responsiveness

## Common Testing Issues and Solutions

### Issue: Build fails with TypeDoc errors
```bash
# Solution: Clean and rebuild
rm -rf docs/api docs/build
npm run docs:api
cd docs && npm run build
```

### Issue: Broken links after content changes
```bash
# Solution: Run link checker
npx broken-link-checker http://localhost:3000 --filter-level 3
# Fix links reported in output
```

### Issue: Search not working
```bash
# Solution: Check Algolia configuration
# 1. Verify Algolia credentials in docusaurus.config.js
# 2. Check if search index was built
# 3. Test with local search fallback
```

### Issue: API documentation missing
```bash
# Solution: Regenerate TypeDoc
npm run docs:api
# Check packages have proper TSDoc comments
```

## Monitoring and Alerts

### Automated Monitoring
The CI/CD pipeline includes:
1. **Daily health checks** - Site accessibility
2. **Weekly broken link scans** - Link validation
3. **Monthly performance audits** - Lighthouse scores
4. **Quarterly accessibility reviews** - WCAG compliance

### Alert Channels
- GitHub Issues for test failures
- Email notifications for critical issues
- Slack/Teams integration for team alerts

## Quick Reference Commands

| Test | Command | Expected Result |
|------|---------|-----------------|
| **Full test** | `npm run test:docs` | All tests pass |
| **Build test** | `./scripts/test-docs-build.sh` | Build completes successfully |
| **Link check** | `npx broken-link-checker --filter-level 3` | No broken links |
| **Performance** | `npx lighthouse --score=90` | Score > 90 |
| **API docs** | `node scripts/test-typedoc.js` | All packages documented |
| **Local server** | `cd docs && npm run start` | Site accessible at localhost:3000 |

## Getting Help

### Debugging Tips
1. **Check logs**: `npm run docs:build 2>&1 | tail -50`
2. **Isolate issues**: Test individual packages separately
3. **Compare with working version**: Use git diff to identify changes

### Support Resources
- GitHub Issues: Report test failures
- Documentation: Check `/plans/testing-deployment.md`
- Community: Ask in n8n-as-code discussions

## Next Steps After Testing

1. **If tests pass**: Proceed with deployment
2. **If tests fail**: Fix issues identified in test output
3. **For flaky tests**: Investigate intermittent failures
4. **For performance issues**: Optimize based on Lighthouse recommendations

Remember: The testing infrastructure is designed to catch issues early and provide clear feedback for fixes.