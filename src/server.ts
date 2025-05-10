import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/http.js';
import { config } from 'dotenv';
import { startClipboardListener, uploadCurrentClipboardImage } from './daemon.js';
import logger from './utils/logger.js';
import { registerGlobalErrorHandlers } from './utils/error-handler.js';
import { z } from 'zod';

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

// Initialize MCP server with metadata
const server = new McpServer({
  name: "clipboard-helper",
  version: "0.1.0"
});

// Register the upload_clipboard_image tool
server.tool(
  "upload_clipboard_image",
  z.object({}), // empty schema - no parameters required
  async () => {
    try {
      const url = await uploadCurrentClipboardImage();
      logger.info(`MCP tool called: upload_clipboard_image → ${url}`);
      return {
        content: [
          { type: "text", text: url }
        ]
      };
    } catch (error) {
      const errorMessage = `Error uploading clipboard image: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(errorMessage);
      return {
        content: [
          { type: "text", text: `Error: Failed to upload image` }
        ]
      };
    }
  }
);

// Start the MCP server with HTTP transport
const port = parseInt(process.env.MCP_PORT || '3333', 10);
const transport = new StreamableHTTPServerTransport({ port });

// Connect the server to the transport
(async () => {
  try {
    await server.connect(transport);
    logger.info(`MCP Clipboard Helper listening on port ${port}`);
  } catch (error) {
    logger.error(`Failed to start MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
})();

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down MCP server...');
  process.exit(0);
});