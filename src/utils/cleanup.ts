import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import logger from './logger.js';
import { AppError, asyncHandler } from './error-handler.js';

// Load environment variables
config();

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

const BUCKET = process.env.BUCKET || 'media';

/**
 * Deletes objects older than the specified retention period
 * @param retentionDays - Number of days to keep files
 * @returns Object with success count and failure count
 */
export const cleanupOldFiles = asyncHandler(async (retentionDays: number = 30): Promise<{
  success: number;
  errors: number;
}> => {
  if (retentionDays <= 0) {
    logger.info('Cleanup skipped - retention policy disabled (RETENTION_DAYS=0)');
    return { success: 0, errors: 0 };
  }

  logger.info(`Starting cleanup of files older than ${retentionDays} days in ${BUCKET}/clips`);

  // Calculate the cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  try {
    // List all objects in the clips folder
    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list('clips');
    
    if (error) {
      throw new AppError(`Failed to list files in ${BUCKET}/clips: ${error.message}`, 'LIST_FILES_ERROR');
    }
    
    if (!files || !files.length) {
      logger.info(`No files found in ${BUCKET}/clips`);
      return { success: 0, errors: 0 };
    }
    
    logger.info(`Found ${files.length} files in ${BUCKET}/clips`);
    
    // Filter files older than the retention period
    const oldFiles = files.filter(file => {
      const fileDate = new Date(file.created_at);
      return fileDate < cutoffDate;
    });
    
    if (!oldFiles.length) {
      logger.info(`No files older than ${retentionDays} days found`);
      return { success: 0, errors: 0 };
    }
    
    logger.info(`Found ${oldFiles.length} files older than ${retentionDays} days to delete`);
    
    // Delete old files
    let successCount = 0;
    let errorCount = 0;
    
    // Process deletions in batches of 100 files
    const batchSize = 100;
    for (let i = 0; i < oldFiles.length; i += batchSize) {
      const batch = oldFiles.slice(i, i + batchSize);
      const filePaths = batch.map(file => `clips/${file.name}`);
      
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .remove(filePaths);
      
      if (error) {
        logger.error(`Batch deletion error: ${error.message}`);
        errorCount += batch.length;
      } else {
        successCount += filePaths.length;
        logger.debug(`Deleted batch of ${filePaths.length} files`);
      }
    }
    
    logger.info(`Cleanup complete. Successfully deleted ${successCount} files. Failed to delete ${errorCount} files.`);
    return { success: successCount, errors: errorCount };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError(
      `Error during cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CLEANUP_ERROR'
    );
  }
});

/**
 * Schedule periodic cleanup based on environment variable settings
 */
export function scheduleCleanup(): void {
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '30', 10);
  
  if (retentionDays <= 0) {
    logger.info('Automatic cleanup disabled (RETENTION_DAYS=0)');
    return;
  }
  
  // Run cleanup once a day (86400000 ms)
  const CLEANUP_INTERVAL = 86400000;
  
  logger.info(`Scheduling automatic cleanup every 24 hours for files older than ${retentionDays} days`);
  
  // Run initial cleanup after 5 minutes
  setTimeout(() => {
    cleanupOldFiles(retentionDays)
      .catch(err => logger.error(`Scheduled cleanup failed: ${err.message}`));
    
    // Then schedule regular cleanups
    setInterval(() => {
      cleanupOldFiles(retentionDays)
        .catch(err => logger.error(`Scheduled cleanup failed: ${err.message}`));
    }, CLEANUP_INTERVAL);
  }, 300000); // 5 minutes delay for initial run
}