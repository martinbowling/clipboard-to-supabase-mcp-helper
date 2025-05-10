# Bug Analysis: ENOENT Error & Fetch Failed

## Error Message

```
Error: ENOENT: no such file or directory, lstat '/var/folders/14/nw95qbqs00q7djf47fdkgdn00000gn/T/4980c800-6e79-4001-8efd-b27f504dad72.png'
[2025-05-10T20:01:52.924Z] [INFO] New image found in clipboard, preparing to upload
[2025-05-10T20:01:52.980Z] [ERROR] [asyncHandler] Error in anonymous function: Error handling clipboard image: fetch failed (CLIPBOARD_PROCESSING_ERROR)
[2025-05-10T20:01:52.981Z] [ERROR] [UNHANDLED_REJECTION] Unhandled promise rejection at: Promise { <rejected> [AppError] }
Reason: Error handling clipboard image: fetch failed
AppError: Error handling clipboard image: fetch failed
    at file:///Users/martinbowling/Projects/clipboard-to-supabase-mcp-helper/dist/daemon.js:81:15
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async Timeout._onTimeout (file:///Users/martinbowling/Projects/clipboard-to-supabase-mcp-helper/dist/utils/error-handler.js:21:20)
```

## Affected Code

### 1. File Existence Verification (daemon.ts)

```typescript
// Verify the file exists and has content
try {
  const stats = statSync(filename);
  if (stats.size === 0) {
    logger.debug('Empty image file detected, skipping');
    return;
  }
  
  // Log image size for debugging
  logger.debug(`Image size: ${Math.round(stats.size / 1024)}KB`);
} catch (err) {
  logger.debug('Image file not found or inaccessible');
  return;
}
```

This code is expected to detect missing files but seems to be bypassed or the file is deleted between checks.

### 2. Platform-Specific Image Capture (platforms/macos.ts)

```typescript
export async function getImageFromClipboard(filePath: string): Promise<boolean> {
  try {
    // Use pngpaste to extract the clipboard image
    execFileSync('pngpaste', [filePath]);
    
    // Verify the file exists and has content
    const stats = await fs.stat(filePath);
    return stats.size > 0;
  } catch (error) {
    // Either pngpaste failed or there's no image in clipboard
    return false;
  }
}
```

The image capture code may be running but not properly checking file creation.

### 3. Subsequent File Usage (daemon.ts)

```typescript
// Read image file
const data = await fs.readFile(filename);
```

This line is likely failing with ENOENT because the file doesn't exist.

### 4. Upload to Supabase (daemon.ts)

```typescript
// Upload to Supabase and get URL
const publicUrl = await uploadFileToSupabase(data, filePath);
```

If file reading succeeds but file is empty or invalid, this then results in the "fetch failed" error.

## Root Causes

1. **Race Condition**: The file might be checked for existence but deleted or moved before it's read.

2. **Clipboard Format Issues**: The clipboard might contain an image format that pngpaste can't handle.

3. **File Permission Issues**: Temp directory might have permission issues.

4. **pngpaste Bugs**: The pngpaste tool might be exiting with success but not actually writing a file.

5. **Supabase Connection**: The "fetch failed" error suggests an issue with the Supabase connection even if the file reading succeeded.

## Critical Code Flow

1. `handleImage()` is called by the interval timer
2. `getImageFromClipboard()` is called, which uses pngpaste to create a file
3. File existence is checked with `statSync()`
4. File is read with `fs.readFile()`
5. File is uploaded to Supabase with `uploadFileToSupabase()`
6. File is deleted in the finally block with `safeRemove()`

The logs indicate that the file is detected ("New image found in clipboard") but then either:
1. The file disappears before reading
2. The file is read but Supabase upload fails with "fetch failed"

## Additional Context

It's suspicious that the ENOENT error happens just before the "New image found" message. This suggests a race condition or file monitoring issue. The "fetch failed" error also indicates that the Supabase client might not have valid credentials or the network connection failed.

## Recommendations

1. Add file checking between each stage with detailed logs
2. Add a small delay between file creation and read
3. Check if pngpaste is installed and working properly
4. Verify Supabase credentials and network connection
5. Use a more robust error handler in the upload function