#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

async function installWindowsService() {
  try {
    console.log('Installing clipboard service for Windows...');
    
    // Get current directory and node path
    const currentDir = process.cwd();
    const nodePath = process.execPath;
    const serverPath = path.join(currentDir, 'dist/server.js');
    
    // Create a Windows batch file to run the service
    const batchContent = `@echo off
"${nodePath}" "${serverPath}"
`;
    
    const batchPath = path.join(currentDir, 'start-cliphelper.bat');
    await fs.writeFile(batchPath, batchContent);
    
    // Create registry entry for auto-start
    // Note: This requires admin privileges
    const regFileContent = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run]
"ClipboardHelper"="${batchPath.replace(/\\/g, '\\\\')}"
`;
    
    const regFilePath = path.join(currentDir, 'cliphelper-autostart.reg');
    await fs.writeFile(regFilePath, regFileContent);
    
    console.log('✅ Setup files created successfully!');
    console.log(`1. Double-click "${regFilePath}" to add service to autostart.`);
    console.log(`2. You can start the service manually by running "${batchPath}".`);
    
    // Check if img-clipboard is installed
    try {
      execSync('npm list -g img-clipboard');
    } catch (err) {
      console.log('\n⚠️ img-clipboard may not be installed! Install it with:');
      console.log('   npm install -g img-clipboard');
    }
    
  } catch (error) {
    console.error('❌ Error installing service:', error);
    process.exit(1);
  }
}

installWindowsService();