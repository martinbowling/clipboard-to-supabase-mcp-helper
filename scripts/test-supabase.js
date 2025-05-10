#!/usr/bin/env node

/**
 * This script tests connectivity to Supabase and verifies bucket access.
 * It's useful for troubleshooting connection issues.
 * 
 * Usage:
 * $ node scripts/test-supabase.js
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { URL } from 'url';

// Load environment variables from .env file
config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.BUCKET || 'media';

async function runTests() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║       Supabase Connection Test Script       ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // Check if environment variables are set
  console.log('Step 1: Checking environment variables...');
  if (!SUPABASE_URL) {
    console.error('❌ SUPABASE_URL is not set. Please add it to your .env file.');
    process.exit(1);
  }
  if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set. Please add it to your .env file.');
    process.exit(1);
  }
  console.log('✅ Environment variables are set.\n');

  // Create Supabase client
  console.log('Step 2: Testing network connectivity to Supabase...');
  try {
    // Parse the Supabase URL to get the hostname
    const supabaseUrl = new URL(SUPABASE_URL);
    const hostname = supabaseUrl.hostname;

    // Test simple HTTPS connectivity
    await new Promise((resolve, reject) => {
      const req = https.get(`https://${hostname}`, res => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Network connectivity test successful (status: ${res.statusCode}).\n`);
          resolve();
        } else {
          reject(new Error(`HTTP status ${res.statusCode}`));
        }
        res.resume(); // Consume response to free up memory
      });

      req.on('error', e => {
        reject(e);
      });

      // Set a timeout of 10 seconds
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  } catch (error) {
    console.error(`❌ Network connectivity test failed: ${error.message}`);
    console.log('This indicates network connectivity issues. Check your internet connection.');
    console.log('If you are behind a proxy or firewall, ensure it allows connections to Supabase.\n');
  }

  console.log('Step 3: Creating Supabase client...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });
  console.log('✅ Supabase client created.\n');

  // Check bucket exists
  console.log(`Step 4: Checking if bucket "${BUCKET}" exists...`);
  console.log(`   Connecting to: ${SUPABASE_URL}`);
  console.log(`   Using bucket: ${BUCKET}`);
  try {
    console.log('   Attempting connection...');
    const { data, error } = await supabase.storage.getBucket(BUCKET);
    if (error) {
      console.error(`❌ Error accessing bucket: ${error.message}`);
      if (error.message === 'fetch failed') {
        console.log('\n🔍 TROUBLESHOOTING "fetch failed" ERROR:');
        console.log('1. Make sure your Supabase project is not paused (visit the dashboard to wake it)');
        console.log('2. Verify your SUPABASE_URL is correct in .env file');
        console.log('3. Check that your SUPABASE_SERVICE_ROLE_KEY is valid');
        console.log('4. Ensure you have internet connectivity');
        console.log('5. Check if Supabase is experiencing an outage: https://status.supabase.com/');
        console.log('\nℹ️ For free tier Supabase projects, you may need to visit the project dashboard to wake it up.');
      }
      process.exit(1);
    }
    console.log(`✅ Bucket "${BUCKET}" exists.\n`);
  } catch (error) {
    console.error(`❌ Error checking bucket: ${error.message}`);
    console.log('\n🔍 TROUBLESHOOTING STEPS:');
    console.log('1. Make sure your Supabase project is not paused');
    console.log('2. Verify your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env file');
    console.log('3. Check if you can access the Supabase dashboard in your browser');
    process.exit(1);
  }

  // Test small upload
  console.log('Step 5: Testing 1-byte upload...');
  try {
    const tiny = new Uint8Array([1]).buffer;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload('test/health-check.txt', tiny, { upsert: true });
    
    if (error) {
      console.error(`❌ Upload test failed: ${error.message}`);
      process.exit(1);
    }
    console.log('✅ Upload test successful.\n');
  } catch (error) {
    console.error(`❌ Upload test error: ${error.message}`);
    process.exit(1);
  }

  // Test download
  console.log('Step 6: Testing download of uploaded file...');
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download('test/health-check.txt');
    
    if (error) {
      console.error(`❌ Download test failed: ${error.message}`);
      process.exit(1);
    }
    console.log('✅ Download test successful.\n');
  } catch (error) {
    console.error(`❌ Download test error: ${error.message}`);
    process.exit(1);
  }

  // Test get URL
  console.log('Step 7: Testing public URL generation...');
  try {
    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl('test/health-check.txt');
    
    console.log(`✅ Public URL generated: ${data.publicUrl}\n`);
  } catch (error) {
    console.error(`❌ URL generation error: ${error.message}`);
    process.exit(1);
  }

  // Test list files
  console.log('Step 8: Testing listing files in test directory...');
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('test');
    
    if (error) {
      console.error(`❌ List test failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`✅ List test successful. Found ${data.length} files in test directory.\n`);
  } catch (error) {
    console.error(`❌ List test error: ${error.message}`);
    process.exit(1);
  }

  // Test cleanup
  console.log('Step 9: Cleaning up test file...');
  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove(['test/health-check.txt']);
    
    if (error) {
      console.error(`❌ Cleanup failed: ${error.message}`);
      process.exit(1);
    }
    console.log('✅ Cleanup successful.\n');
  } catch (error) {
    console.error(`❌ Cleanup error: ${error.message}`);
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════╗');
  console.log('║               All Tests Passed!             ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('Your Supabase configuration is working correctly.');
  console.log(`Bucket "${BUCKET}" is accessible and functioning properly.`);
}

runTests().catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});