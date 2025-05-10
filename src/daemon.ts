import clipboardy from 'clipboardy';
import { createClient } from '@supabase/supabase-js';
import { tmpdir } from 'os';
import fs from 'fs/promises';
import { statSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { config } from 'dotenv';
import { createHash } from 'crypto';
import { getImageFromClipboard, isPlatformSupported, getPlatformName } from './platforms/index.js';
import logger from './utils/logger.js';
import { AppError, asyncHandler } from './utils/error-handler.js';
import { safeRemove } from './utils/fs.js';

// Node versions older than 18 need fetch polyfill
// Uncomment this line if you're using Node 16/17
// import "undici/polyfill";

// Load environment variables
config();

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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
 */
async function uploadFileToSupabase(buffer: Buffer, filePath: string): Promise<string> {
  // Reject absurdly large clips early (saves token+bandwidth)
  if (buffer.byteLength > MAX_IMAGE_SIZE) {
    throw new AppError(`Image too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB > 8MB)`, 'IMAGE_TOO_LARGE');
  }

  // Convert Buffer to ArrayBuffer to avoid Undici EPIPE issues
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, new Uint8Array(buffer).buffer, {
      contentType: 'image/png',
      upsert: true
    });

  if (error) {
    throw new AppError(`Supabase upload failed: ${error.message}`, 'UPLOAD_ERROR');
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
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
    // Safely clean up temp file
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
  
  // Start polling clipboard with interval
  if (clipboardWatcherInterval) {
    clearInterval(clipboardWatcherInterval);
  }
  
  clipboardWatcherInterval = setInterval(handleImage, POLL_INTERVAL_MS);
  
  logger.info(`Clipboard polling started on ${getPlatformName()} (${POLL_INTERVAL_MS}ms interval) - watching for images`);
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
    // Safely clean up temp file
    await safeRemove(filename);
  }
});