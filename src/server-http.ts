import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from 'dotenv';
import { startClipboardListener, uploadCurrentClipboardImage } from './daemon.js';
import logger from './utils/logger.js';
import { registerGlobalErrorHandlers } from './utils/error-handler.js';
import { randomUUID } from 'crypto';
import { cleanupOldFiles } from './utils/cleanup.js';

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
  {}, // empty object for no parameters
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

// Register the cleanup_old_files tool
server.tool(
  "cleanup_old_files",
  {
    type: "object",
    properties: {
      days: {
        type: "integer",
        description: "Number of days to keep files"
      }
    }
  },
  async ({ days }) => {
    try {
      // Use the configured retention period if no days parameter provided
      const retentionDays = days || parseInt(process.env.RETENTION_DAYS || '30', 10);

      logger.info(`MCP tool called: cleanup_old_files with retention period of ${retentionDays} days`);

      const result = await cleanupOldFiles(retentionDays);

      return {
        content: [
          {
            type: "text",
            text: `Cleanup completed: Deleted ${result.success} files older than ${retentionDays} days. Failed: ${result.errors}.`
          }
        ]
      };
    } catch (error) {
      const errorMessage = `Error cleaning up old files: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(errorMessage);
      return {
        content: [
          { type: "text", text: `Error: Failed to cleanup old files` }
        ]
      };
    }
  }
);

// Create Express app
const app = express();
app.use(express.json());

// Handle MCP requests
app.post("/mcp", async (req: express.Request, res: express.Response) => {
  try {
    // Create a transport with session ID generator
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: false
    });
    
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error(`Error handling MCP request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add a health check endpoint
app.get("/health", (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: "healthy" });
});

// Start the HTTP server
const port = parseInt(process.env.MCP_PORT || '3333', 10);
app.listen(port, () => {
  logger.info(`MCP Clipboard Helper HTTP server listening on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down MCP server...');
  process.exit(0);
});