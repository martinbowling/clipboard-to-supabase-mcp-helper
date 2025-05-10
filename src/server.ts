import { MCPServer } from '@modelcontextprotocol/sdk';
import { config } from 'dotenv';
import { startClipboardListener, uploadCurrentClipboardImage } from './daemon.js';
import logger from './utils/logger.js';
import { registerGlobalErrorHandlers } from './utils/error-handler.js';

// Load environment variables
config();

// Register global error handlers
registerGlobalErrorHandlers();

// Start the clipboard listener
try {
  startClipboardListener();
} catch (error) {
  logger.error(`Failed to start clipboard listener: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exit(1);
}

// Initialize MCP server
const mcp = new MCPServer({ 
  port: parseInt(process.env.MCP_PORT || '3333', 10)
});

// Register the upload_clipboard_image tool
mcp.registerTool('upload_clipboard_image', {
  description: 'Uploads current clipboard image to Supabase and returns the URL.',
  invoke: async () => {
    try {
      return await uploadCurrentClipboardImage();
    } catch (error) {
      logger.error(`MCP tool error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return `Error: Failed to upload image`;
    }
  }
});

// Start the MCP server
mcp.listen();
logger.info(`MCP Clipboard Helper listening on port ${process.env.MCP_PORT || 3333}`);

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down MCP server...');
  process.exit(0);
});