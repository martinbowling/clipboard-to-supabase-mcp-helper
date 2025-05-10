import fs from 'fs/promises';
import { execSync } from 'child_process';
import { getImageFromClipboard as getImgClipboard } from 'img-clipboard';

/**
 * Linux clipboard image capture
 * Uses multiple methods: xclip, wl-clipboard, or img-clipboard
 * 
 * @param filePath - Path to save the clipboard image
 * @returns Promise<boolean> - true if image was captured, false otherwise
 */
export async function getImageFromClipboard(filePath: string): Promise<boolean> {
  try {
    let succeeded = false;
    
    // Try with xclip first (X11)
    try {
      execSync(`xclip -selection clipboard -t image/png -o > "${filePath}"`);
      
      // Verify the file exists and has content
      const stats = await fs.stat(filePath);
      if (stats.size > 0) {
        succeeded = true;
      }
    } catch (error) {
      // xclip failed or not installed
    }
    
    // If xclip failed, try with wl-clipboard (Wayland)
    if (!succeeded) {
      try {
        execSync(`wl-paste -t image/png > "${filePath}"`);
        
        // Verify the file exists and has content
        const stats = await fs.stat(filePath);
        if (stats.size > 0) {
          succeeded = true;
        }
      } catch (error) {
        // wl-paste failed or not installed
      }
    }
    
    // If native tools failed, try using img-clipboard
    if (!succeeded) {
      // Get image directly from img-clipboard
      const imgData = getImgClipboard();
      
      if (imgData && imgData.length > 0) {
        // Write the image data to the file
        await fs.writeFile(filePath, imgData);
        
        // Verify the file exists and has content
        const stats = await fs.stat(filePath);
        succeeded = stats.size > 0;
      }
    }
    
    return succeeded;
  } catch (error) {
    // All methods failed
    console.error('Linux clipboard capture error:', error);
    return false;
  }
}