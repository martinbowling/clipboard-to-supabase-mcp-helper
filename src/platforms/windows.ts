import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { tmpdir } from 'os';

/**
 * Windows clipboard image capture
 * 
 * @param filePath - Path to save the clipboard image
 * @returns Promise<boolean> - true if image was captured, false otherwise
 */
export async function getImageFromClipboard(filePath: string): Promise<boolean> {
  try {
    // For Windows, PowerShell can capture clipboard images
    const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    if ([Windows.Forms.Clipboard]::ContainsImage()) {
      $img = [Windows.Forms.Clipboard]::GetImage()
      $img.Save("${filePath.replace(/\\/g, '\\\\')}")
      exit 0
    } else {
      exit 1
    }
    `;
    
    // Execute PowerShell script
    execSync(`powershell -Command "${psScript}"`);
    
    // Verify the file exists and has content
    const stats = await fs.stat(filePath);
    return stats.size > 0;
  } catch (error) {
    // Either PowerShell failed or there's no image in clipboard
    console.error('Windows clipboard capture error:', error);
    return false;
  }
}