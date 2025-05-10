# Bug Fix: ENOENT Error & Fetch Failed

## Issue Summary

The error logs show two main issues:
1. ENOENT (file not found) error when accessing a temporary PNG file
2. "fetch failed" error when trying to upload to Supabase

## Root Causes & Solutions

### 1. ENOENT Error (File Not Found)

#### Root Cause:
The file either:
- Is never created properly by pngpaste
- Is created but deleted/moved before it can be read
- Is not accessible due to permissions or race conditions

#### Fix:
```typescript
// In handleImage function in daemon.ts
try {
  // Try to get image from clipboard using platform-specific implementation
  logger.debug('Checking clipboard for image');
  const hasImage = await getImageFromClipboard(filename);
  
  if (!hasImage) {
    logger.debug('No image found in clipboard');
    return;
  }
  
  // Add delay to ensure file system has completed writing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Double-check file existence after delay
  try {
    const stats = statSync(filename);
    if (stats.size === 0) {
      logger.debug('Empty image file detected, skipping');
      return;
    }
    logger.debug(`Image size: ${Math.round(stats.size / 1024)}KB`);
  } catch (err) {
    logger.error(`File verification failed after clipboard capture: ${err.message}`);
    return;
  }
  
  // Read image file with explicit error handling
  let data;
  try {
    data = await fs.readFile(filename);
    logger.debug(`Successfully read file: ${filename} (${data.length} bytes)`);
  } catch (readErr) {
    logger.error(`Failed to read clipboard image file: ${readErr.message}`);
    return;
  }
  
  // Continue with the rest of the function...
} catch (error) {
  // Error handling...
}
```

### 2. Fetch Failed Error

#### Root Cause:
The error occurs during Supabase upload, which could be due to:
- Network connectivity issues
- Supabase credentials or permissions
- Image format incompatibility
- Undici/fetch implementation issues

#### Fix:
```typescript
/**
 * Uploads a file to Supabase with robust error handling and retries
 */
async function uploadFileToSupabase(buffer: Buffer, filePath: string): Promise<string> {
  // Reject large images early
  if (buffer.byteLength > MAX_IMAGE_SIZE) {
    throw new AppError(`Image too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB > 8MB)`, 'IMAGE_TOO_LARGE');
  }

  logger.debug(`Starting Supabase upload for ${filePath} (${buffer.byteLength} bytes)`);
  
  // Retry configuration
  const MAX_RETRIES = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug(`Upload attempt ${attempt}/${MAX_RETRIES}`);
      
      // Different upload strategies based on attempt number
      let uploadResult;
      
      if (attempt === 1) {
        // First try: direct Buffer
        logger.debug('Using direct Buffer upload');
        uploadResult = await supabase.storage
          .from(BUCKET)
          .upload(filePath, buffer, { contentType: 'image/png', upsert: true });
      } else if (attempt === 2) {
        // Second try: ArrayBuffer conversion
        logger.debug('Using ArrayBuffer upload');
        uploadResult = await supabase.storage
          .from(BUCKET)
          .upload(filePath, buffer.buffer, { contentType: 'image/png', upsert: true });
      } else {
        // Third try: Uint8Array conversion
        logger.debug('Using Uint8Array upload');
        const uint8Array = new Uint8Array(buffer);
        uploadResult = await supabase.storage
          .from(BUCKET)
          .upload(filePath, uint8Array, { contentType: 'image/png', upsert: true });
      }
      
      if (uploadResult.error) {
        throw uploadResult.error;
      }
      
      // Success! Get the URL
      logger.debug(`Upload succeeded on attempt ${attempt}`);
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);
      
      return urlData.publicUrl;
    } catch (err) {
      lastError = err;
      logger.warn(`Upload attempt ${attempt} failed: ${err.message || 'Unknown error'}`);
      
      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 100;
        logger.debug(`Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  // All attempts failed
  const errorDetails = lastError?.message || 'Unknown error';
  throw new AppError(`Supabase upload failed after ${MAX_RETRIES} attempts: ${errorDetails}`, 'UPLOAD_ERROR');
}
```

### 3. Fix the `getImageFromClipboard` Function (macOS)

```typescript
export async function getImageFromClipboard(filePath: string): Promise<boolean> {
  try {
    // Check if pngpaste is installed
    try {
      execFileSync('which', ['pngpaste']);
    } catch (err) {
      logger.error('pngpaste not found. Please install with: brew install pngpaste');
      return false;
    }
    
    // Use pngpaste to extract the clipboard image
    execFileSync('pngpaste', [filePath]);
    
    // Check if file was created
    try {
      // Verify the file exists and has content
      const stats = await fs.stat(filePath);
      const fileExists = stats.size > 0;
      
      if (!fileExists) {
        logger.debug('pngpaste created empty file - clipboard likely does not contain a PNG image');
      }
      
      return fileExists;
    } catch (statErr) {
      logger.debug(`Failed to stat file after pngpaste: ${statErr.message}`);
      return false;
    }
  } catch (error) {
    // Either pngpaste failed or there's no image in clipboard
    logger.debug(`pngpaste execution failed: ${error.message}`);
    return false;
  }
}
```

## Additional Improvements

### 1. Enhance Logging for Debug Mode

```typescript
// In daemon.ts
if (process.env.DEBUG) {
  // More detailed debug logs
  process.env.LOG_LEVEL = 'DEBUG';
  
  // Monitor for unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}
```

### 2. Verify Supabase Connection at Startup

```typescript
// In startClipboardListener
logger.info('Verifying Supabase connection...');
try {
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (error) {
    logger.error(`Failed to connect to Supabase bucket: ${error.message}`);
    logger.error('Please check your Supabase credentials and network connection');
  } else {
    logger.info(`Successfully connected to Supabase bucket: ${BUCKET}`);
  }
} catch (err) {
  logger.error(`Supabase connection error: ${err.message}`);
}
```

### 3. Add More Detailed Fetch Error Handling

```typescript
// At the top of the file
function setupFetchPolyfill() {
  if (!globalThis.fetch) {
    try {
      const undici = require('undici');
      globalThis.fetch = undici.fetch;
      globalThis.Request = undici.Request;
      globalThis.Response = undici.Response;
      globalThis.Headers = undici.Headers;
      
      logger.info('Fetch polyfill successfully applied');
    } catch (err) {
      logger.error(`Failed to load undici polyfill: ${err.message}`);
      throw new Error('Fetch polyfill required for Node.js < 18. Please install undici or upgrade Node.js.');
    }
  }
}

// Call this early
setupFetchPolyfill();
```

## Implementation Priority

1. First fix the file handling (add verification, delays, and proper error checking)
2. Then fix the Supabase upload with retries and various buffer formats
3. Add connection verification and better error logging
4. Implement more robust fetch polyfilling

This multi-layered approach should resolve both the ENOENT and fetch failed errors by making each step more resilient.