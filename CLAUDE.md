# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project is a Clipboard-to-Supabase MCP Helper - a local agent that:
1. Monitors the system clipboard
2. Uploads any copied images to Supabase Storage
3. Writes the public (or signed) URL back to clipboard

The helper solves the friction of sharing screenshots and other images inside AI-powered workflows. Every time a user copies an image, the agent returns a sharable link that any LLM, chat app, or teammate can consume.

## Technical Architecture

The project consists of several key components:
- Clipboard Watcher: Uses clipboard-event + clipboardy for cross-platform event listening
- Image Handling: Uses pngpaste (macOS) or img-clipboard/imgpaste (Windows/Linux)
- Storage: @supabase/supabase-js for image upload and URL management
- MCP Layer: @modelcontextprotocol/sdk for exposing functionality
- Auto-start mechanisms: systemd user services, LaunchAgent, auto-launch

## Core Dependencies

- clipboard-event: Native clipboard events (pinned to ^1.6.0 as v2.x doesn't exist)
- clipboardy: Cross-platform clipboard reading/writing
- pngpaste: macOS CLI for saving clipboard images
- img-clipboard: Windows/Linux equivalent for clipboard images
- @supabase/supabase-js: Supabase client for storage operations
- @modelcontextprotocol/sdk: MCP server implementation
- uuid: For generating unique filenames
- lodash.debounce: For handling rapid clipboard events

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build 

# Run the service locally
npm start

# Run with debugging
npm run dev

# Create platform-specific auto-start scripts
npm run install:macos
npm run install:linux
npm run install:windows
```

## Configuration

The project requires the following environment variables:
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
BUCKET=media
MCP_PORT=3333
```

## Platform-Specific Notes

- On macOS, relies on the pngpaste CLI utility
- On Windows/Linux, uses img-clipboard or imgpaste packages
- Auto-start configuration differs by platform (LaunchAgent, systemd user service, registry)

## Logging

The application uses a custom logger with:
- Rotating log files
- Multiple log levels (DEBUG, INFO, WARN, ERROR)
- Platform-specific log file locations

Log files are located at:
- macOS: ~/Library/Logs/cliphelper.log
- Linux: ~/.config/cliphelper/logs
- Windows: Logs subdirectory in the application directory

## Known Issues and Alternatives

### clipboard-event Package

The clipboard-event package (v1.6.0) is used for clipboard monitoring but has limitations:
- It's not actively maintained (last publish was 2 years ago)
- May have edge-case bugs on macOS/Ubuntu requiring manual chmod and race-condition fixes
- No TypeScript types and relies on child-process spawning

Potential alternatives for future versions:
- electron-clipboard-watcher: Maintained with better image and text support
- clipboardy with polling: More reliable but requires timer-based polling

For production or high-volume clipboard operations, consider switching to one of these alternatives.