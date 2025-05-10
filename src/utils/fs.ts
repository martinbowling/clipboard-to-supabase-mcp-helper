import fs from "fs/promises";

/**
 * Safely removes a file, ignoring ENOENT (file not found) errors
 * @param path - Path to the file to remove
 */
export async function safeRemove(path: string): Promise<void> {
  try { 
    await fs.rm(path); 
  } catch (err: any) {
    // Ignore "file not found" errors, but throw others
    if (err?.code !== "ENOENT") throw err;
  }
}