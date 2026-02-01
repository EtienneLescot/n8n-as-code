---
sidebar_label: Troubleshooting
title: Troubleshooting Guide
description: Solutions to common issues with n8n-as-code, including installation, synchronization, and configuration problems.
---

# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with n8n-as-code. If you don't find your issue here, please check the [GitHub Issues](https://github.com/EtienneLescot/n8n-as-code/issues) or ask in [GitHub Discussions](https://github.com/EtienneLescot/n8n-as-code/discussions).

## 🚨 Quick Diagnosis

### 1. Check Connection
```bash
# Test n8n connectivity
curl -I https://your-n8n-instance.com

# Test API access (if you know your API key)
curl -H "X-N8N-API-KEY: your-api-key" https://your-n8n-instance.com/api/v1/workflows
```

### 2. Check Installation
```bash
# Verify CLI installation
n8nac --version

# Verify VS Code extension
code --list-extensions | grep n8n-as-code
```

### 3. Check Configuration
```bash
# View current configuration file
cat n8nac.json
```

## 📦 Installation Issues

### "Command not found: n8n-as-code"
**Problem**: The CLI is not installed or not in your PATH.

**Solutions:**
1. **Global Installation:**
   ```bash
   npm install -g @n8n-as-code/cli
   ```

2. **Local Installation:**
   ```bash
   npm install --save-dev @n8n-as-code/cli
   npx n8nac --version
   ```

3. **Check PATH:**
   ```bash
   # Find npm global directory
   npm config get prefix
   
   # Add to PATH if needed
   export PATH="$PATH:$(npm config get prefix)/bin"
   ```

### VS Code Extension Not Appearing
**Problem**: The extension doesn't show up in VS Code.

**Solutions:**
1. **Reload VS Code:**
   - Press `Ctrl+Shift+P`
   - Type "Developer: Reload Window"
   - Press Enter

2. **Manual Installation:**
   - Download the `.vsix` from releases
   - In VS Code, go to Extensions
   - Click "..." menu → "Install from VSIX"
   - Select the downloaded file

3. **Check Compatibility:**
   - Ensure VS Code version ≥ 1.60.0
   - Check extension requirements

## 🔌 Connection Issues

### "Cannot connect to n8n instance"
**Problem**: Unable to connect to your n8n server.

**Solutions:**
1. **Verify URL:**
   ```bash
   # Test connectivity
   curl -v https://your-n8n-instance.com
   ```

2. **Verify API Key:**
   - Go to n8n Settings → API
   - Ensure API key is active
   - Check permissions (workflow read/write)

3. **Network Issues:**
   ```bash
   # Check DNS resolution
   nslookup your-n8n-instance.com
   
   # Check firewall (if using HTTPS)
   curl -v https://your-n8n-instance.com
   ```

### "Invalid API key" or "Unauthorized"
**Problem**: Authentication fails.

**Solutions:**
1. **Regenerate API Key:**
   - Go to n8n Settings → API
   - Create a new API key
   - Update your configuration

2. **Check Permissions:**
   - Ensure API key has workflow permissions
   - Check if key is expired or revoked

3. **Re-run init:**
   ```bash
   n8nac init
   ```

## 🔄 Synchronization Issues

### "Connection lost during sync"
**Problem**: Connection fails during synchronization.

**Solutions:**
1. **Check Network Stability:**
   ```bash
   # Test network stability
   ping -c 10 your-n8n-instance.com
   ```

2. **Retry Operation:**
   ```bash
   # Pull workflows again
   n8nac pull
   
   # Or push workflows
   n8nac push
   ```

3. **Check File Permissions:**
   ```bash
   # Verify write permissions
   ls -la workflows/
   
   # Fix permissions if needed
   chmod -R 755 workflows/
   ```

### "Workflow validation failed"
**Problem**: Workflow JSON doesn't pass n8n validation.

**Solutions:**
1. **Check JSON Syntax:**
   ```bash
   # Validate JSON syntax
   jq . workflows/problematic-workflow.json
   ```

2. **Common Issues:**
   - Missing required fields
   - Invalid node types
   - Malformed expressions
   - Circular references

3. **Manual Fix:**
   - Open workflow in n8n editor
   - Save it to trigger n8n's validation
   - Pull the corrected version

## 🖥️ VS Code Extension Issues

### "Extension not loading workflows"
**Problem**: Tree view shows no workflows.

**Solutions:**
1. **Check Configuration:**
   - Verify `n8n.host` and `n8n.apiKey` are set in VS Code settings
   - Check the Output panel (View → Output, select "n8n-as-code") for errors

2. **Refresh Tree View:**
   - Click the refresh button in the n8n panel
   - Or run the command: `n8n.refresh`

3. **Check Connection:**
   - Verify your n8n instance is accessible
   - Check network connectivity

### "Canvas not loading in webview"
**Problem**: n8n canvas doesn't appear in split view.

**Solutions:**
1. **Check n8n URL:**
   - Ensure the URL in settings is correct
   - Test the URL in a browser to verify accessibility

2. **Check Permissions:**
   - Verify the API key has proper permissions
   - Check if CORS is configured on the n8n instance

### "Auto-sync not working"
**Problem**: Changes aren't synced automatically.

**Solutions:**
1. **Check Sync Mode:**
   - Settings → n8n → Sync Mode
   - Ensure it's set to "auto" (not "manual")

2. **Check File System:**
   - Verify the workflows directory exists and is writable
   - Check for file system permissions issues

## 🤖 AI Integration Issues

### "AI context not generated"
**Problem**: AI context command doesn't create files.

**Solutions:**
1. **Run update-ai (init-ai is an alias):**
   ```bash
   n8nac update-ai
   ```

2. **Check Permissions:**
   ```bash
   # Check write permissions in current directory
   ls -la AGENTS.md 2>/dev/null || echo "File not created"
   ```

3. **Check Generated Files:**
   ```bash
   # Verify files were created
   ls -la AGENTS.md .vscode/n8n.code-snippets 2>/dev/null || echo "Some files missing"
   ```

### "AI assistant doesn't understand n8n"
**Problem**: AI doesn't provide accurate n8n suggestions.

**Solutions:**
1. **Verify Context Files:**
   - Ensure `AGENTS.md` exists in your project root
   - Verify `@n8n-as-code/skills` is installed and accessible
   - Verify snippets are in `.vscode/` folder

2. **Update Context:**
   ```bash
   # Regenerate AI context
   n8nac update-ai
   ```

## 📁 File System Issues

### "Cannot read/write workflow files"
**Problem**: Permission errors when accessing files.

**Solutions:**
1. **Check Permissions:**
   ```bash
   ls -la workflows/
   stat workflows/
   ```

2. **Fix Permissions:**
   ```bash
   # Make directory writable
   chmod -R 755 workflows/
   
   # Change ownership if needed
   sudo chown -R $USER:$USER workflows/
   ```

3. **Check Disk Space:**
   ```bash
   df -h .
   du -sh workflows/
   ```

### "Workflow files corrupted"
**Problem**: JSON files are malformed or incomplete.

**Solutions:**
1. **Validate JSON:**
   ```bash
   # Check specific file
   jq . workflows/my-workflow.json
   
   # Check all files for JSON syntax
   find workflows/ -name "*.json" -exec jq . {} >/dev/null 2>&1 \; || echo "Some files have JSON errors"
   ```

2. **Restore from Backup:**
   ```bash
   # Check git history
   git log --oneline workflows/
   
   # Restore from git
   git checkout HEAD -- workflows/my-workflow.json
   ```

3. **Restore from n8n:**
   ```bash
   # Pull fresh copy
   n8nac pull
   ```

## 🔧 Configuration Issues

### "Configuration not found"
**Problem**: `n8nac.json` missing or invalid.

**Solutions:**
1. **Create Configuration:**
   ```bash
   n8nac init
   ```

2. **Check File Location:**
   ```bash
   # Default location
   ls -la n8nac.json
   ```

3. **Validate Configuration:**
   ```bash
   # Check JSON syntax
   jq . n8nac.json
   ```

## 🐛 Debugging Tips

### Check Console Output
```bash
# For CLI operations, check console output
n8nac pull

# For real-time sync mode, check the terminal output
n8nac start
```

### Check VS Code Output Panel
- Open View → Output
- Select "n8n-as-code" from the dropdown
- Look for error messages and logs

### Create Test Case
```bash
# Minimal reproduction
mkdir test-case
cd test-case
n8nac init
n8nac pull
```

## 📞 Getting Help

### Before Asking for Help
1. **Collect Information:**
   ```bash
   # System info
   n8nac --version
   node --version
   npm --version
   code --version
   
   # Configuration (redact sensitive info)
   cat n8nac.json
   ```

2. **Reproduction Steps:**
   - Exact commands run
   - Expected vs actual behavior
   - Error messages (copy-paste)

3. **Check Existing Issues:**
   - [GitHub Issues](https://github.com/EtienneLescot/n8n-as-code/issues)
   - Search for similar problems

### Where to Get Help
1. **GitHub Discussions:**
   - [Ask questions](https://github.com/EtienneLescot/n8n-as-code/discussions)
   - Share solutions

2. **GitHub Issues:**
   - [Report bugs](https://github.com/EtienneLescot/n8n-as-code/issues)
   - Feature requests

3. **Documentation:**
   - [Getting Started](/docs/getting-started)
   - [Usage Guides](/docs/usage)

## 🚀 Performance Optimization

### Slow Sync Operations
**Solutions:**
1. **Check Network Speed:**
   ```bash
   # Test connection speed
   curl -o /dev/null -s -w 'Total: %{time_total}s\n' https://your-n8n-instance.com
   ```

2. **Reduce Number of Workflows:**
   - Consider archiving unused workflows in n8n
   - Use tags to filter workflows if supported in future versions

3. **Use `start` Mode:**
   ```bash
   # Real-time sync is more efficient than repeated pull/push
   n8nac start
   ```

### High Memory Usage
**Solutions:**
1. **Monitor Memory:**
   ```bash
   # Watch memory usage
   top -p $(pgrep -f n8n-as-code)
   ```

2. **Restart CLI:**
   ```bash
   # If memory usage grows over time
   # Stop and restart the watch command
   ```

3. **Check Workflow Size:**
   - Large workflows with many nodes use more memory
   - Consider splitting very large workflows

## 🔄 Recovery Procedures

### Complete Reset
```bash
# Backup first
cp -r workflows/ workflows-backup-$(date +%Y%m%d)

# Remove configuration
rm n8nac.json

# Reinitialize
n8nac init
n8nac pull
```

### Workflow Recovery
```bash
# Get fresh copy of all workflows
n8nac pull

# If specific workflow is missing:
# 1. Check if it exists in n8n UI
# 2. If deleted from n8n, restore from backup
# 3. If local copy exists, push it back
n8nac push
```

---

*If you continue to experience issues, please provide detailed information when asking for help. The more information you provide, the faster we can help you resolve the issue.*
