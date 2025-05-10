#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const SYSTEMD_USER_DIR = path.join(homedir(), '.config/systemd/user');
const SERVICE_FILE = 'cliphelper.service';
const ENV_DIR = path.join(homedir(), '.config/cliphelper');
const ENV_FILE = path.join(ENV_DIR, 'env');

async function installLinuxService() {
  try {
    console.log('Installing clipboard service for Linux...');
    
    // Create systemd user directory if it doesn't exist
    try {
      await fs.mkdir(SYSTEMD_USER_DIR, { recursive: true });
    } catch (err) {
      // Directory may already exist
    }
    
    // Create env directory if it doesn't exist
    try {
      await fs.mkdir(ENV_DIR, { recursive: true });
    } catch (err) {
      // Directory may already exist
    }
    
    // Get current directory and node path
    const currentDir = process.cwd();
    const nodePath = process.execPath;
    const serverPath = path.join(currentDir, 'dist/server.js');
    
    // Create service content
    const serviceContent = `[Unit]
Description=Clipboard MCP Helper

[Service]
ExecStart=${nodePath} ${serverPath}
Restart=on-failure
EnvironmentFile=${ENV_FILE}

[Install]
WantedBy=default.target
`;
    
    // Write service file
    const servicePath = path.join(SYSTEMD_USER_DIR, SERVICE_FILE);
    await fs.writeFile(servicePath, serviceContent);
    
    // Create env file from .env if it exists, otherwise create a template
    try {
      const envContent = await fs.readFile(path.join(currentDir, '.env'), 'utf8');
      await fs.writeFile(ENV_FILE, envContent);
    } catch (err) {
      // .env may not exist, create a template
      const envTemplate = `SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
BUCKET=media
MCP_PORT=3333
`;
      await fs.writeFile(ENV_FILE, envTemplate);
      console.log(`⚠️ Created template env file at ${ENV_FILE}`);
      console.log('   Please edit this file with your Supabase credentials before starting the service.');
    }
    
    // Set permissions
    await fs.chmod(ENV_FILE, 0o600);
    
    // Reload systemd
    console.log('Reloading systemd...');
    execSync('systemctl --user daemon-reload');
    
    // Enable and start service
    console.log('Enabling and starting service...');
    execSync('systemctl --user enable --now cliphelper');
    
    console.log('✅ Service installed successfully!');
    console.log('To check service status: systemctl --user status cliphelper');
    console.log('To view logs: journalctl --user -u cliphelper');
    
  } catch (error) {
    console.error('❌ Error installing service:', error);
    process.exit(1);
  }
}

installLinuxService();