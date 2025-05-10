import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { tmpdir } from 'os';

/**
 * Linux clipboard image capture
 * Note: This tries multiple methods to get the image (xclip, wl-clipboard)
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
      succeeded = true;
    } catch (error) {
      // xclip failed or not installed
    }
    
    // If xclip failed, try with wl-clipboard (Wayland)
    if (!succeeded) {
      try {
        execSync(`wl-paste -t image/png > "${filePath}"`);
        succeeded = true;
      } catch (error) {
        // wl-paste failed or not installed
      }
    }
    
    // If direct methods failed, try using a Node.js library via a helper script
    if (!succeeded) {
      const scriptPath = path.join(tmpdir(), 'get-clipboard-image.js');
      
      // Check if we need to create the script
      try {
        await fs.access(scriptPath);
      } catch {
        // Script doesn't exist, create it
        const scriptContent = `
const { getImageFromClipboard } = require('img-clipboard');
const fs = require('fs');

// Get output file path from command line
const outputPath = process.argv[2];
if (!outputPath) {
  console.error('Output path is required');
  process.exit(1);
}

try {
  // Get image from clipboard
  const imgData = getImageFromClipboard();
  
  if (imgData && imgData.length > 0) {
    // Write to file
    fs.writeFileSync(outputPath, imgData);
    process.exit(0);
  } else {
    // No image data
    process.exit(1);
  }
} catch (error) {
  console.error('Error capturing clipboard image:', error);
  process.exit(1);
}
`;
        await fs.writeFile(scriptPath, scriptContent);
      }
      
      // Execute the script
      execSync(`node "${scriptPath}" "${filePath}"`);
      succeeded = true;
    }
    
    // Verify the file exists and has content
    if (succeeded) {
      const stats = await fs.stat(filePath);
      return stats.size > 0;
    }
    
    return false;
  } catch (error) {
    // All methods failed
    console.error('Linux clipboard capture error:', error);
    return false;
  }
}