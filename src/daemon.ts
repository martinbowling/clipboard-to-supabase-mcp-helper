import clipboardy from 'clipboardy';
import { createClient } from '@supabase/supabase-js';
import { tmpdir } from 'os';
import fs from 'fs/promises';
import { statSync, existsSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { config } from 'dotenv';
import { createHash } from 'crypto';
import { getImageFromClipboard, isPlatformSupported, getPlatformName } from './platforms/index.js';
import logger from './utils/logger.js';
import { AppError, asyncHandler } from './utils/error-handler.js';
import { safeRemove } from './utils/fs.js';
import { scheduleCleanup } from './utils/cleanup.js';

// Load environment variables first
config();

// Check Node.js version
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
if (majorVersion < 18) {
  logger.error(`Node.js version ${nodeVersion} is not supported. Please use Node.js 18 or later.`);
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);

// Constants
const TMP = tmpdir();
const BUCKET = process.env.BUCKET || 'media';
const POLL_INTERVAL_MS = 300; // 300ms polling interval
const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB maximum image size

// Store the hash of the last processed image to avoid duplicates
let lastImageHash = '';
let clipboardWatcherInterval: NodeJS.Timeout | null = null;

/**
 * Computes SHA-1 hash of a buffer for change detection
 */
function getImageHash(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex');
}

/**
 * Uploads a file to Supabase and returns its public URL
 * Uses multiple approaches to handle the upload, with fallbacks
 */
async function uploadFileToSupabase(buffer: Buffer, filePath: string): Promise<string> {
  // Reject large images early
  if (buffer.byteLength > MAX_IMAGE_SIZE) {
    throw new AppError(`Image too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB > 8MB)`, 'IMAGE_TOO_LARGE');
  }

  logger.debug(`Starting Supabase upload for ${filePath} (${buffer.byteLength} bytes)`);
  
  // Try different methods of uploading
  try {
    // First try: Use buffer directly
    logger.debug('Attempting upload with Buffer directly');
    const { error: error1 } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (!error1) {
      logger.debug('Upload succeeded with direct Buffer');
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);
      return urlData.publicUrl;
    }
    
    logger.debug(`First upload attempt failed: ${error1.message || 'Unknown error'}`);
    
    // Second try: Use buffer.buffer (ArrayBuffer)
    logger.debug('Attempting upload with buffer.buffer (ArrayBuffer)');
    const { error: error2 } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer.buffer, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (!error2) {
      logger.debug('Upload succeeded with buffer.buffer');
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);
      return urlData.publicUrl;
    }
    
    logger.debug(`Second upload attempt failed: ${error2.message || 'Unknown error'}`);
    
    // Third try: Use Uint8Array
    logger.debug('Attempting upload with Uint8Array conversion');
    const uint8Array = new Uint8Array(buffer);
    const { error: error3 } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, uint8Array, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (!error3) {
      logger.debug('Upload succeeded with Uint8Array');
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);
      return urlData.publicUrl;
    }
    
    logger.debug(`Third upload attempt failed: ${error3.message || 'Unknown error'}`);
    
    // All attempts failed, throw detailed error
    throw new AppError(
      `Supabase upload failed after 3 attempts. Last error: ${error3.message || 'Unknown error'}`,
      'UPLOAD_ERROR'
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    
    // Catch and log any other errors with as much detail as possible
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Unexpected error during upload: ${errorMsg}`);
    logger.error(`Error details: ${JSON.stringify(err)}`);
    
    throw new AppError(`Supabase upload failed: ${errorMsg}`, 'UPLOAD_ERROR');
  }
}

/**
 * Handles clipboard image detection and upload to Supabase
 */
const handleImage = asyncHandler(async (): Promise<void> => {
  const filename = path.join(TMP, `${uuid()}.png`);
  
  try {
    // Check if platform is supported
    if (!isPlatformSupported()) {
      logger.error(`Unsupported platform: ${getPlatformName()}`);
      return;
    }
    
    // Make sure temp directory exists
    const tempDir = path.dirname(filename);
    if (!existsSync(tempDir)) {
      logger.error(`Temp directory does not exist: ${tempDir}`);
      return;
    }
    
    // Try to get image from clipboard using platform-specific implementation
    logger.debug('Checking clipboard for image');
    const hasImage = await getImageFromClipboard(filename);
    
    if (!hasImage) {
      logger.debug('No image found in clipboard');
      return; // Not an image, exit early
    }
    
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
    
    // Read image file
    const data = await fs.readFile(filename);
    
    // Calculate hash for change detection
    const imageHash = getImageHash(data);
    
    // Skip if this is the same image as before
    if (imageHash === lastImageHash) {
      logger.debug('Duplicate image detected, skipping upload');
      return;
    }
    
    // Update the last image hash
    lastImageHash = imageHash;
    
    logger.info('New image found in clipboard, preparing to upload');
    
    // Create unique path for Supabase
    const filePath = `clips/${path.basename(filename)}`;
    
    // Upload to Supabase and get URL
    const publicUrl = await uploadFileToSupabase(data, filePath);
    
    // Write URL back to clipboard
    await clipboardy.write(publicUrl);
    logger.info(`Successfully uploaded ${filePath} → ${publicUrl}`);
  } catch (error) {
    if (error instanceof AppError) {
      throw error; // Re-throw AppErrors to be caught by asyncHandler
    }
    throw new AppError(
      `Error handling clipboard image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CLIPBOARD_PROCESSING_ERROR'
    );
  } finally {
    // Safely clean up temp file (ignores ENOENT errors)
    await safeRemove(filename);
  }
});

/**
 * Initialize clipboard polling
 */
export function startClipboardListener(): void {
  // Check if platform is supported
  if (!isPlatformSupported()) {
    logger.error(`Unsupported platform: ${getPlatformName()}`);
    process.exit(1);
  }
  
  // Check if Supabase URL and key are provided
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  
  // Verify Supabase connection
  logger.info('Verifying Supabase connection...');
  supabase.storage.getBucket(BUCKET)
    .then(() => {
      logger.info(`Connected to Supabase bucket: ${BUCKET}`);
    })
    .catch(error => {
      logger.error(`Failed to connect to Supabase bucket: ${error.message}. This may indicate a paused project, invalid credentials, or network issues.`);
      if (process.env.DEBUG) {
        logger.error(`Full error details: ${JSON.stringify(error)}`);
      }
    });
  
  // Start polling clipboard with interval
  if (clipboardWatcherInterval) {
    clearInterval(clipboardWatcherInterval);
  }
  
  clipboardWatcherInterval = setInterval(handleImage, POLL_INTERVAL_MS);

  logger.info(`Clipboard polling started on ${getPlatformName()} (${POLL_INTERVAL_MS}ms interval) - watching for images`);

  // Schedule automatic cleanup of old files based on retention policy
  scheduleCleanup();
}

/**
 * Function to manually trigger image upload (for MCP)
 */
export const uploadCurrentClipboardImage = asyncHandler(async (): Promise<string> => {
  const filename = path.join(TMP, `${uuid()}.png`);
  
  try {
    // Check if platform is supported
    if (!isPlatformSupported()) {
      return `Unsupported platform: ${getPlatformName()}`;
    }
    
    // Try to get image from clipboard using platform-specific implementation
    logger.debug('MCP request: Checking clipboard for image');
    const hasImage = await getImageFromClipboard(filename);
    
    if (!hasImage) {
      return 'No image in clipboard';
    }
    
    // Verify the file exists and has content
    try {
      const stats = statSync(filename);
      if (stats.size === 0) {
        logger.debug('Empty image file detected');
        return 'No valid image in clipboard';
      }
      
      // Log image size for debugging
      logger.debug(`Image size: ${Math.round(stats.size / 1024)}KB`);
    } catch (err) {
      logger.debug('Image file not found or inaccessible');
      return 'Failed to capture clipboard image';
    }
    
    logger.info('MCP request: Image found in clipboard, preparing to upload');
    
    // Read image file
    const data = await fs.readFile(filename);
    
    // Create unique path for Supabase
    const filePath = `clips/${path.basename(filename)}`;
    
    // Upload to Supabase and get URL
    const publicUrl = await uploadFileToSupabase(data, filePath);
    
    logger.info(`MCP request: Successfully uploaded ${filePath} → ${publicUrl}`);
    
    // Return URL (don't write to clipboard in this case)
    return publicUrl;
  } catch (error) {
    const errorMessage = `Error uploading clipboard image: ${error instanceof Error ? error.message : 'Unknown error'}`;
    logger.error(errorMessage);
    
    return `Error: ${error instanceof AppError ? error.message : 'Upload failed'}`;
  } finally {
    // Safely clean up temp file (ignores ENOENT errors)
    await safeRemove(filename);
  }
});