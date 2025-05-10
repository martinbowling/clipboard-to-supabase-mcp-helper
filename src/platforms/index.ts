import { platform } from 'os';
import * as macOS from './macos.js';
import * as windows from './windows.js';
import * as linux from './linux.js';

const PLATFORM = platform();

// Export the appropriate platform-specific functions
export const getImageFromClipboard = 
  PLATFORM === 'darwin' ? macOS.getImageFromClipboard : 
  PLATFORM === 'win32' ? windows.getImageFromClipboard : 
  linux.getImageFromClipboard;

// Export helper function to determine if platform is supported
export function getPlatformName(): string {
  return PLATFORM;
}

export function isPlatformSupported(): boolean {
  return ['darwin', 'win32', 'linux'].includes(PLATFORM);
}