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
n8n-as-code --version

# Verify VS Code extension
code --list-extensions | grep n8n-as-code
```

### 3. Check Configuration
```bash
# View current configuration file
cat n8n-as-code.json
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
   npx n8n-as-code --version
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

3. **Environment Variables:**
   ```bash
   # Set environment variable
   export N8N_API_KEY="your-new-api-key"
   
   # Test with new key by running init again
   n8n-as-code init
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
   n8n-as-code pull
   
   # Or push workflows
   n8n-as-code push
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
1. **Check Connection:**
   - Click the n8n icon in Activity Bar
   - Click gear icon → "Test Connection"

2. **Refresh Tree View:**
   - Click refresh button in n8n panel
   - Or press `F5`

3. **Check Output Panel:**
   - View → Output
   - Select "n8n-as-code" from dropdown
   - Look for error messages

### "Canvas not loading in webview"
**Problem**: n8n canvas doesn't appear in split view.

**Solutions:**
1. **Check n8n URL:**
   - Ensure URL is correct in settings
   - Test URL in browser

2. **Webview Developer Tools:**
   - Right-click in webview
   - Select "Inspect"
   - Check Console for errors

3. **Clear Webview Cache:**
   ```bash
   # VS Code webview cache location
   rm -rf ~/.config/Code/User/workspaceStorage/*/state.vscdb
   ```

### "Auto-sync not working"
**Problem**: Changes aren't synced automatically.

**Solutions:**
1. **Check Sync Mode:**
   - Settings → n8n-as-code → Sync Mode
   - Ensure it's set to "auto"

2. **Check File Watching:**
   ```bash
   # Start watch mode to test synchronization
   n8n-as-code watch
   ```

3. **VS Code Auto-save:**
   - Ensure auto-save is enabled
   - Or manually save with `Ctrl+S`

## 🤖 AI Integration Issues

### "AI context not generated"
**Problem**: `init-ai` command doesn't create files.

**Solutions:**
1. **Force Generation:**
   ```bash
   n8n-as-code init-ai --force
   ```

2. **Check Permissions:**
   ```bash
   # Check write permissions
   ls -la AGENTS.md
   
   # Fix if needed
   chmod 644 AGENTS.md n8n-schema.json
   ```

3. **Check Generated Files:**
   ```bash
   # Verify files were created
   ls -la AGENTS.md n8n-schema.json .vscode/n8n.code-snippets 2>/dev/null || echo "Some files missing"
   ```

### "AI assistant doesn't understand n8n"
**Problem**: AI doesn't provide accurate n8n suggestions.

**Solutions:**
1. **Verify Context Files:**
   - Ensure `AGENTS.md` exists
   - Check `n8n-schema.json` is valid JSON
   - Verify snippets are in `.vscode/` folder

2. **Update Context:**
   ```bash
   # Regenerate with latest n8n schema
   n8n-as-code init-ai --force
   ```

3. **AI Model Limitations:**
   - Some AI models have token limits
   - Try breaking workflows into smaller parts
   - Use more specific prompts

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
   n8n-as-code pull
   ```

## 🔧 Configuration Issues

### "Configuration not found"
**Problem**: `n8n-as-code.json` missing or invalid.

**Solutions:**
1. **Create Configuration:**
   ```bash
   n8n-as-code init
   ```

2. **Check File Location:**
   ```bash
   # Default location
   ls -la n8n-as-code.json
   ```

3. **Validate Configuration:**
   ```bash
   # Check JSON syntax
   jq . n8n-as-code.json
   ```

### "Environment variables not working"
**Problem**: Environment variables aren't being read.

**Solutions:**
1. **Check Variable Names:**
   ```bash
   # Correct variable names
   echo $N8N_HOST
   echo $N8N_API_KEY
   ```

2. **Export Variables:**
   ```bash
   # Export for current session
   export N8N_HOST="https://n8n.example.com"
   export N8N_API_KEY="your-key"
   
   # Test with init (will use env vars)
   n8n-as-code init
   ```

3. **Permanent Setup:**
   ```bash
   # Add to ~/.bashrc or ~/.zshrc
   echo 'export N8N_HOST="https://n8n.example.com"' >> ~/.bashrc
   echo 'export N8N_API_KEY="your-key"' >> ~/.bashrc
   source ~/.bashrc
   ```

## 🐛 Debugging Tips

### Enable Debug Logging
```bash
# CLI debug (for watch mode)
DEBUG=n8n-as-code:* n8n-as-code watch

# For pull/push operations, check console output
n8n-as-code pull
```

### Check Logs
```bash
# VS Code extension logs
code --log debug

# System logs
journalctl -f | grep n8n
```

### Create Test Case
```bash
# Minimal reproduction
mkdir test-case
cd test-case
# Set environment variables first
export N8N_HOST="https://test.n8n.io"
export N8N_API_KEY="test"
n8n-as-code init
n8n-as-code pull
```

## 📞 Getting Help

### Before Asking for Help
1. **Collect Information:**
   ```bash
   # System info
   n8n-as-code --version
   node --version
   npm --version
   code --version
   
   # Configuration (redact sensitive info)
   cat n8n-as-code.json | jq 'del(.apiKey)'
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
   - [API Reference](/api)

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

3. **Use `watch` Mode:**
   ```bash
   # Real-time sync is more efficient than repeated pull/push
   n8n-as-code watch
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
rm n8n-as-code.json

# Reinitialize
n8n-as-code init
n8n-as-code pull
```

### Workflow Recovery
```bash
# Get fresh copy of all workflows
n8n-as-code pull

# If specific workflow is missing:
# 1. Check if it exists in n8n UI
# 2. If deleted from n8n, restore from backup
# 3. If local copy exists, push it back
n8n-as-code push
```

---

*If you continue to experience issues, please provide detailed information when asking for help. The more information you provide, the faster we can help you resolve the issue.*