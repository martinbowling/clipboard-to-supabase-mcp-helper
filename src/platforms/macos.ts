import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import logger from '../utils/logger.js';

/**
 * Uses pngpaste command-line tool to save clipboard image to a file
 * with enhanced error handling and verification
 * 
 * @param filePath - Path to save the clipboard image
 * @returns Promise<boolean> - true if image was captured, false otherwise
 */
export async function getImageFromClipboard(filePath: string): Promise<boolean> {
  try {
    // Check if pngpaste is installed
    try {
      execFileSync('which', ['pngpaste']);
    } catch (err) {
      logger.error('pngpaste not found. Please install with: brew install pngpaste');
      return false;
    }
    
    // Get pngpaste version (should be >= 2.0 for best results)
    try {
      const versionOutput = execFileSync('pngpaste', ['-v']).toString().trim();
      logger.debug(`Using pngpaste version: ${versionOutput}`);
    } catch {
      // Version check failed, but continue anyway
      logger.debug('Could not determine pngpaste version');
    }
    
    // Check if the directory exists
    const directory = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!existsSync(directory)) {
      logger.error(`Directory does not exist: ${directory}`);
      return false;
    }
    
    // Use pngpaste to extract the clipboard image
    try {
      execFileSync('pngpaste', [filePath]);
    } catch (execError) {
      logger.debug(`pngpaste execution failed: ${execError.message}`);
      return false;
    }
    
    // Verify the file was created with a small delay to ensure file system completion
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!existsSync(filePath)) {
      logger.debug('pngpaste did not create a file');
      return false;
    }
    
    // Verify the file has content
    try {
      const stats = statSync(filePath);
      if (stats.size === 0) {
        logger.debug('pngpaste created an empty file - clipboard likely does not contain a PNG image');
        return false;
      }
      
      // Success! Log the file size for debugging
      logger.debug(`Image captured successfully: ${Math.round(stats.size / 1024)} KB`);
      return true;
    } catch (statErr) {
      logger.debug(`Failed to stat file after pngpaste: ${statErr.message}`);
      return false;
    }
  } catch (error) {
    // Catch any other errors
    logger.error(`Unexpected error during clipboard capture: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}