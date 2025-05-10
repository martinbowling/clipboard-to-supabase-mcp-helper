#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const LAUNCH_AGENTS_DIR = path.join(homedir(), 'Library/LaunchAgents');
const PLIST_FILE = 'com.cliphelper.plist';
const SERVICE_NAME = 'com.cliphelper';

async function installMacOSService() {
  try {
    console.log('Installing clipboard service for macOS...');
    
    // Create LaunchAgents directory if it doesn't exist
    try {
      await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
    } catch (err) {
      // Directory may already exist
    }
    
    // Get current directory and node path
    const currentDir = process.cwd();
    const nodePath = process.execPath;
    const serverPath = path.join(currentDir, 'dist/server.js');
    
    // Create plist content
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${serverPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(homedir(), 'Library/Logs/cliphelper.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(homedir(), 'Library/Logs/cliphelper.error.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>`;
    
    // Write plist file
    const plistPath = path.join(LAUNCH_AGENTS_DIR, PLIST_FILE);
    await fs.writeFile(plistPath, plistContent);
    
    // Set permissions
    await fs.chmod(plistPath, 0o644);
    
    // Unload any existing service
    try {
      execSync(`launchctl unload ${plistPath}`);
    } catch (err) {
      // Service may not be loaded
    }
    
    // Load the service
    console.log('Loading service...');
    execSync(`launchctl load ${plistPath}`);
    
    console.log('✅ Service installed successfully!');
    console.log(`Logs available at:\n  - ${path.join(homedir(), 'Library/Logs/cliphelper.log')}\n  - ${path.join(homedir(), 'Library/Logs/cliphelper.error.log')}`);
    
    // Check if pngpaste is installed
    try {
      execSync('which pngpaste');
    } catch (err) {
      console.log('\n⚠️ pngpaste not found! Install it with:');
      console.log('   brew install pngpaste');
    }
    
  } catch (error) {
    console.error('❌ Error installing service:', error);
    process.exit(1);
  }
}

installMacOSService();