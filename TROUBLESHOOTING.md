# Troubleshooting Guide

This guide helps resolve common issues you might encounter when running the Clipboard to Supabase MCP Helper.

## Quick Setup Checklist

1. Node.js 18+ is installed (`node -v`)
2. Required platform dependencies:
   - macOS: pngpaste (`brew install pngpaste`)
   - Linux: xclip or wl-clipboard
   - Windows: PowerShell with appropriate execution policy
3. Supabase project is active (not paused) and storage bucket exists
4. Environment variables are correctly set in `.env` file
5. System service is properly installed for auto-start

## Node.js Version Requirement

This application requires Node.js 18 or later, as it uses native features like:
- The Fetch API
- Modern ECMAScript modules
- Enhanced performance and stability

If you see an error on startup about Node.js version, please update:

```bash
# Using nvm (recommended)
nvm install 18    # or higher version
nvm use 18

# Or download directly from nodejs.org
```

## Common Issues

### "fetch failed" or "CLIPBOARD_PROCESSING_ERROR"

This error typically occurs when the Supabase upload fails. Here are potential causes and solutions:

#### 1. Supabase Project Issues

**Issue**: Supabase service problems.

**Solutions**:
- **Free Tier Sleep**: Your Supabase project may be in sleep mode. Wake it by visiting the dashboard.
- **Project Paused**: Check if your project is paused in the Supabase dashboard.
- **Credentials**: Verify your `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct.
- **Connection Check**: The helper now checks the Supabase connection at startup and logs the result.
- **"fetch failed" Error**: This common error typically means:
  - Your Supabase project is paused or in sleep mode
  - There's a network connectivity issue preventing connections
  - Your credentials (URL or API key) are incorrect
  - A firewall is blocking access to Supabase
  - Supabase may be experiencing an outage

**Debugging**:
```bash
# To see the full error details:
LOG_LEVEL=DEBUG npm start

# If you see "Failed to connect to Supabase bucket" in the logs, your project may be:
# - Paused (visit Supabase dashboard to unpause)
# - Have incorrect credentials in .env
# - Be experiencing connectivity issues
```

#### 2. Large Images

**Issue**: Very large images (>8MB) are rejected.

**Solution**: The tool automatically rejects images larger than 8MB. Try with smaller images, or edit the `MAX_IMAGE_SIZE` constant in the code if needed.

#### 3. Network Issues

**Issue**: Network problems preventing uploads.

**Solutions**:
- Check your internet connection
- If behind a proxy, set up the appropriate environment variables

### Temporary File Cleanup Warnings

**Issue**: Warnings about temporary file cleanup can be safely ignored. The application now uses `safeRemove()` to handle this gracefully.

### "No image in clipboard" Despite Having an Image

**Issue**: This can happen due to various clipboard format issues.

**Solutions**:
- **macOS**: Ensure pngpaste is updated: `brew upgrade pngpaste`
- **Windows**: Try taking a new screenshot
- **Linux**: Make sure xclip or wl-paste is installed depending on your display server

### Empty Image Files

**Issue**: Sometimes clipboard tools capture empty files when the clipboard doesn't contain a valid image format.

**Solution**: The helper now checks file existence and size before attempting uploads, so this should no longer cause issues.

### ENOENT (File Not Found) Errors

**Issue**: Temporary files not being properly created or read.

**Solutions**:
- The application now includes multiple checks for file existence
- Directory verification is performed before file operations
- A small delay is added after file creation to ensure filesystem completion
- Multiple fallbacks are implemented for different upload methods

## Additional Debugging

For more detailed debugging information, you can set environment variables:

```bash
# Enable DEBUG logging
LOG_LEVEL=DEBUG npm run start

# Check Supabase bucket connection
node -e "require('dotenv').config(); const { createClient } = require('@supabase/supabase-js'); const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); supabase.storage.getBucket(process.env.BUCKET || 'media').then(r => console.log('Supabase connected!', r)).catch(e => console.error('Supabase error:', e))"
```

## Testing Your Setup

### Quick Supabase Connection Test

We've included a comprehensive test script to verify your Supabase setup:

```bash
# Run the Supabase connection test
npm run test:supabase
```

The test script will:
1. Verify environment variables are correctly set
2. Check if the bucket exists
3. Test uploading a small file
4. Test downloading the file
5. Test generating a public URL
6. Test listing files
7. Clean up the test file

### Manual Tests

You can also perform these simple manual tests:

```bash
# 1. Take a screenshot or copy an image to clipboard

# 2. Run this command to test image capture
node -e "const { execSync } = require('child_process'); const p = '/tmp/test.png'; try { execSync('pngpaste ' + p); console.log('Image captured successfully!'); } catch(e) { console.error('Failed to capture image:', e.message); }"

# 3. Test Supabase connection
node -e "const { createClient } = require('@supabase/supabase-js'); const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); supabase.storage.getBucket('media').then(r => console.log('Supabase connected!', r)).catch(e => console.error('Supabase error:', e))"
```

If these tests pass but the helper still isn't working, please open an issue with the complete error logs.

## Platform-Specific Troubleshooting

### macOS

- **Issue**: pngpaste not working
- **Solution**: Run `brew reinstall pngpaste` and ensure it's in your PATH
- **Version**: Use pngpaste >= 2.0 for proper error handling (`brew upgrade pngpaste`)

### Windows

- **Issue**: PowerShell restrictions
- **Solution**: You may need to adjust PowerShell execution policy: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### Linux

- **Issue**: X11/Wayland detection
- **Solution**: The helper tries multiple methods, but you may need to install the appropriate package:
  - For X11: `sudo apt install xclip`
  - For Wayland: `sudo apt install wl-clipboard`

## Automatic Cleanup Issues

### "Storage Bucket Size Keeps Growing"

**Issue**: Automatic cleanup isn't working properly

**Solutions**:
- Check if `RETENTION_DAYS` is set in your `.env` file (default is 30 days)
- Set `LOG_LEVEL=DEBUG` to see detailed logs about cleanup operations
- Verify the Supabase service role key has sufficient permissions
- Trigger a manual cleanup using the MCP endpoint to test functionality:

```bash
# HTTP mode - from command line
curl -X POST http://localhost:3333/mcp -H "Content-Type: application/json" -d '{"id":"1","jsonrpc":"2.0","method":"tool","params":{"name":"cleanup_old_files","input":{"days":30}}}'
```

### Cleanup Not Deleting Expected Files

**Issue**: Files you expect to be deleted are not being removed.

**Solutions**:
- Check the file creation timestamps in Supabase dashboard
- The cleanup uses the file's `created_at` timestamp to determine age
- Ensure the Supabase bucket exists and is accessible
- Verify the service role key has delete permissions for storage