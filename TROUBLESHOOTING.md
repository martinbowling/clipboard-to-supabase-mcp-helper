# Troubleshooting Guide

This guide helps resolve common issues you might encounter when running the Clipboard to Supabase MCP Helper.

## Common Issues

### "fetch failed" or "CLIPBOARD_PROCESSING_ERROR"

This error typically occurs when the Supabase upload fails. Here are potential causes and solutions:

#### 1. Node.js Version

**Issue**: You're using Node.js 16 or 17 without the fetch polyfill enabled.

**Solution**: Either:
- Upgrade to Node.js 18+ (recommended)
- Uncomment the `import "undici/polyfill";` line in `src/daemon.ts`

#### 2. Supabase Project Issues

**Issue**: Supabase service problems.

**Solutions**:
- **Free Tier Sleep**: Your Supabase project may be in sleep mode. Wake it by visiting the dashboard.
- **Project Paused**: Check if your project is paused in the Supabase dashboard.
- **Credentials**: Verify your `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct.

#### 3. Large Images

**Issue**: Very large images (>8MB) are rejected.

**Solution**: The tool automatically rejects images larger than 8MB. Try with smaller images, or edit the `MAX_IMAGE_SIZE` constant in the code if needed.

#### 4. Network Issues

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

### Additional Debugging

For more detailed debugging information, you can set environment variables:

```bash
# Enable Undici debug logs
DEBUG=* npm run start

# Enable application debugging
LOG_LEVEL=DEBUG npm run start
```

## Testing Your Setup

To quickly test if your setup is working correctly:

```bash
# 1. Take a screenshot or copy an image to clipboard

# 2. Run this command to test image capture
node -e "const { execSync } = require('child_process'); const p = '/tmp/test.png'; try { execSync('pngpaste ' + p); console.log('Image captured successfully!'); } catch(e) { console.error('Failed to capture image:', e.message); }"

# 3. Test Supabase connection (replace with your credentials)
node -e "const { createClient } = require('@supabase/supabase-js'); const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); supabase.storage.getBucket('media').then(r => console.log('Supabase connected!', r)).catch(e => console.error('Supabase error:', e))"
```

If these tests pass but the helper still isn't working, please open an issue with the complete error logs.

## Platform-Specific Troubleshooting

### macOS

- **Issue**: pngpaste not working
- **Solution**: Run `brew reinstall pngpaste` and ensure it's in your PATH

### Windows

- **Issue**: PowerShell restrictions
- **Solution**: You may need to adjust PowerShell execution policy: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### Linux

- **Issue**: X11/Wayland detection
- **Solution**: The helper tries multiple methods, but you may need to install the appropriate package:
  - For X11: `sudo apt install xclip`
  - For Wayland: `sudo apt install wl-clipboard`