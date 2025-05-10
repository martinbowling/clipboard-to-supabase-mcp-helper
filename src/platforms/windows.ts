import fs from 'fs/promises';
import { getImageFromClipboard as getImgClipboard } from 'img-clipboard';

/**
 * Windows clipboard image capture using img-clipboard
 * 
 * @param filePath - Path to save the clipboard image
 * @returns Promise<boolean> - true if image was captured, false otherwise
 */
export async function getImageFromClipboard(filePath: string): Promise<boolean> {
  try {
    // Get image from clipboard directly using img-clipboard
    const imgData = getImgClipboard();
    
    if (!imgData || imgData.length === 0) {
      return false; // No image in clipboard
    }
    
    // Write the image data to the file
    await fs.writeFile(filePath, imgData);
    
    // Verify the file exists and has content
    const stats = await fs.stat(filePath);
    return stats.size > 0;
  } catch (error) {
    console.error('Windows clipboard capture error:', error);
    return false;
  }
}