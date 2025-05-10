# Clipboard to Supabase MCP Helper

A local agent that monitors the system clipboard, uploads any copied image to Supabase Storage, then writes the public (or signed) URL back to the clipboard.

## Features

- Zero-click image hosting: Copy an image, get a URL instantly
- Low latency: Under 800ms from copy to URL
- Cross-platform: Works on macOS, Windows, and Linux
- MCP integration: Expose clipboard image upload as an MCP endpoint
- Auto-start: Configure to run at system startup

## Prerequisites

- Node.js 18+
- Supabase account with Storage enabled
- Platform-specific dependencies:
  - macOS: `pngpaste` (`brew install pngpaste`)
  - Windows/Linux: `img-clipboard` (will be installed via npm)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/clipboard-to-supabase-mcp-helper.git
cd clipboard-to-supabase-mcp-helper
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example`:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BUCKET=media
MCP_PORT=3333
```

4. Build the project:

```bash
npm run build
```

5. Install as a system service:

For macOS:
```bash
npm run install:macos
```

For Linux:
```bash
npm run install:linux
```

For Windows:
```bash
npm run install:windows
```

## Usage

Once installed and running, the helper will:

1. Monitor your clipboard for image changes
2. Upload any copied images to your Supabase bucket
3. Place the public URL back in your clipboard, ready to paste

### MCP Integration

The helper exposes an MCP endpoint on port 3333 (configurable):

```json
{
  "tool_name": "upload_clipboard_image",
  "input": {}
}
```

Response:
```json
{
  "content": "https://your-project.supabase.co/storage/v1/object/public/media/clips/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.png"
}
```

## Platform-Specific Notes

### macOS
- Requires `pngpaste`: Install with `brew install pngpaste`
- Uses LaunchAgents for auto-start

### Windows
- Uses Windows Registry for auto-start
- Requires Node.js to be in PATH

### Linux
- Uses systemd for auto-start
- May require xclip or wl-clipboard depending on your display server

## Supabase Configuration

1. Create a bucket named `media` (or your choice, update in `.env`)
2. Set public access or use signed URLs 
3. Optional: Configure lifecycle rules to delete old images

## Development

```bash
# Run with live reload
npm run dev

# Build for production
npm run build

# Run built version
npm start
```

## License

MIT