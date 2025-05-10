import { execFileSync } from 'child_process';
import fs from 'fs/promises';

/**
 * Uses pngpaste command-line tool to save clipboard image to a file
 * 
 * @param filePath - Path to save the clipboard image
 * @returns Promise<boolean> - true if image was captured, false otherwise
 */
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