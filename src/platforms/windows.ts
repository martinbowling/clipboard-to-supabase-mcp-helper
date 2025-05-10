import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

/**
 * Windows clipboard image capture
 * Note: This requires the img-clipboard NPM package to be installed
 * 
 * @param filePath - Path to save the clipboard image
 * @returns Promise<boolean> - true if image was captured, false otherwise
 */
export async function getImageFromClipboard(filePath: string): Promise<boolean> {
  try {
    // For Windows, we use a script that depends on img-clipboard
    // We'll create this script if it doesn't exist
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
    
    // Verify the file exists and has content
    const stats = await fs.stat(filePath);
    return stats.size > 0;
  } catch (error) {
    // Either the script failed or there's no image in clipboard
    console.error('Windows clipboard capture error:', error);
    return false;
  }
}