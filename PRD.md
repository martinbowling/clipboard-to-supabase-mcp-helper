Below is a complete Product Requirements Document (PRD) for a Clipboard-to-Supabase MCP Helper—a local agent that monitors the system clipboard, uploads any copied image to Supabase Storage, then writes the public (or signed) URL back to the clipboard. A TypeScript/Node implementation is the reference build; a Rust/Fast-MCP variant is outlined for teams that prefer Rust.

⸻

Executive Summary

The helper solves the friction of sharing screenshots and other copied images inside AI-powered workflows: every time a user hits ⌘/Ctrl +C on an image, the agent returns an instantly sharable link that any LLM, chat app, or teammate can consume. Implemented as an MCP server, it exposes this functionality to your agent mesh while running entirely on the user’s machine—keeping images private until the moment they’re uploaded.

⸻

1. Problem Statement
	•	Existing clipboard-to-URL tools are browser extensions or cloud services; they cannot be orchestrated by LLM agents or run offline.
	•	Developers building autonomous agents need a standard MCP tool that makes “paste screenshot here” a single function call.
	•	Teams want cross-platform (macOS, Windows, Linux) support without new infra; Supabase Storage gives durable, CDN-backed hosting for pennies.

⸻

2. Goals & Success Metrics

Goal	Metric	Target
Zero-click image hosting	% images uploaded automatically	≥ 95 %
Latency	Time from copy-to-URL in clipboard	≤ 800 ms
Reliability	Upload failures per 1 000 events	< 2
Security	No public leakage when bucket is private	100 %



⸻

3. Personas
	•	Developer Martin – AI hacker who pipes screenshots into a research agent.
	•	Designer Dana – pastes mock-ups into Slack without dragging files.
	•	Support Rep Sam – needs quick links while annotating bug reports.

⸻

4. User Stories
	1.	As Martin, when I copy an image, I want a URL in my clipboard so I can paste it into an LLM prompt.
	2.	As Dana, I need a tray toggle to pause uploads during confidential work.
	3.	As Sam, I want the same behavior on Windows and macOS.

⸻

5. Functional Requirements

#	Requirement
F-1	Watch clipboard for changes using native OS events—no polling.  ￼
F-2	Detect whether current payload is image; ignore text or files.
F-3	Upload image bytes to Supabase media bucket with unique path (UUID).  ￼ ￼
F-4	Retrieve public or signed URL and write it back to clipboard.  ￼
F-5	Expose an MCP endpoint upload_clipboard_image returning the same URL.  ￼
F-6	Debounce rapid clipboard events to prevent duplicates.  ￼
F-7	Provide auto-start at login via systemd user service (Linux), LaunchAgent (macOS), or registry/autostart (Windows).  ￼ ￼ ￼
F-8	Log all operations (success/failure) to rotating file.
F-9	Optional clean-up job: delete objects older than retention policy via Supabase lifecycle rules.  ￼



⸻

6. Non-Functional Requirements
	•	Cross-platform – macOS, Windows, Linux.
	•	Local-first – no image data leaves machine except explicit upload.
	•	Privacy – allow private buckets + signed URLs.
	•	Resource – CPU < 5 % idle, RAM < 75 MB.

⸻

7. Technical Architecture

7.1 Overview

graph TD
    A[Clipboard Event] -->|Image? | B[Temp File (.png)]
    B --> C[Supabase Storage]
    C --> D[Public/Signed URL]
    D --> E[Write to Clipboard]
    F[MCP Server] -->|invoke| D

7.2 Key Components

Component	Stack	Notes
Clipboard Watcher	clipboard-event  ￼ + clipboardy  ￼	Native events, cross-platform copy/write
Image Dump (macOS)	pngpaste CLI  ￼ ￼	Saves raw PNG from clipboard
Image Dump (Win/Linux)	img-clipboard  ￼ or imgpaste  ￼	
Storage	@supabase/supabase-js 2.x	Upload, getPublicUrl, createSignedUrl
MCP Layer	@modelcontextprotocol/typescript-sdk server  ￼	
Auto-start	systemd user, LaunchAgent, auto-launch (Electron)  ￼ ￼ ￼	



⸻

8. Detailed Design & Code Samples

8.1 Environment Variables

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
BUCKET=media

8.2 TypeScript Daemon (src/daemon.ts)

import clipboardListener from 'clipboard-event';
import clipboardy from 'clipboardy';
import { createClient } from '@supabase/supabase-js';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import debounce from 'lodash.debounce';           // small helper

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const TMP = tmpdir();
const BUCKET = process.env.BUCKET ?? 'media';

async function handleImage() {
  const filename = path.join(TMP, `${uuid()}.png`);
  try {
    // macOS; swap with img-clipboard on other OSes
    execFileSync('pngpaste', [filename]);
    const data = await fs.readFile(filename);

    const filePath = `clips/${path.basename(filename)}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, data, { upsert: false });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    await clipboardy.write(urlData.publicUrl);
    console.log(`✅ Uploaded ${filePath}`);
  } catch {
    /* not an image or failed – safely ignore */
  } finally {
    fs.rm(filename).catch(() => {});
  }
}

// Start listener with 250 ms debounce
clipboardListener.startListening();
clipboardListener.on('change', debounce(handleImage, 250));

8.3 MCP Server (src/server.ts)

import { MCPServer } from '@modelcontextprotocol/typescript-sdk';
import clipboardy from 'clipboardy';
import './daemon.js';          // ensure listener boots first

const mcp = new MCPServer({ port: 3333 });

mcp.registerTool('upload_clipboard_image', {
  description: 'Uploads current clipboard image to Supabase and returns the URL.',
  invoke: async () => clipboardy.read()
});

mcp.listen();
console.log('📋 MCP Clipboard Helper listening on :3333');

8.4 Cross-Platform Image Capture Snippets
	•	Windows/Linux – replace pngpaste line with:

import { getImageFromClipboard } from 'img-clipboard';    //  [oai_citation:20‡npm](https://www.npmjs.com/package/img-clipboard?utm_source=chatgpt.com)
const data = await getImageFromClipboard(); // returns Buffer

	•	Rust / Fast-MCP (excerpt)

use arboard::Clipboard;                         //  [oai_citation:21‡Docs.rs](https://docs.rs/arboard/latest/arboard/struct.Clipboard.html?utm_source=chatgpt.com)
use fastmcp::prelude::*;                        //  [oai_citation:22‡Crates](https://crates.io/crates/fastmcp?utm_source=chatgpt.com)
use supabase_rs::Client;

#[tool]
async fn upload_clipboard_image() -> mcp::Result<String> {
    let mut cb = Clipboard::new().unwrap();
    let img = cb.get_image().map_err(|_| "No image")?;
    let png = img.to_png()?;
    let file_name = format!("clips/{}.png", uuid::Uuid::new_v4());
    let url = Client::from_env().upload("media", &file_name, png).await?;
    cb.set_text(url.clone())?;
    Ok(url)
}



⸻

9. Deployment & Auto-Start

9.1 macOS LaunchAgent (~/Library/LaunchAgents/com.cliphelper.plist)

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.cliphelper</string>
  <key>ProgramArguments</key>
    <array><string>/usr/local/bin/node</string><string>/path/to/dist/server.js</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>

Launch with launchctl load.

9.2 systemd User Service (~/.config/systemd/user/cliphelper.service)

[Unit]
Description=Clipboard MCP Helper

[Service]
ExecStart=/usr/bin/node /home/$USER/cliphelper/dist/server.js
Restart=on-failure
EnvironmentFile=%h/.config/cliphelper/env

[Install]
WantedBy=default.target

Enable via systemctl --user enable --now cliphelper.

⸻

10. Supabase Configuration
	1.	Bucket: media (set to public or keep private and call createSignedUrl).
	2.	CORS: Allow POST from localhost if using signed URLs.
	3.	(Optional) Lifecycle rule: “Delete objects older than 30 days.”  ￼

⸻

11. Risks & Mitigations

Risk	Mitigation
Large files > 10 MB overwhelm bandwidth	Reject with size check before upload.
Bucket goes public accidentally	Prefer private + signed URLs in production.
Duplicate uploads on rapid copy	Debounced listener.  ￼
Startup mismatch across OS	Provide packaged install scripts for each platform.



⸻

12. Future Roadmap
	•	Tray UI with pause/resume and history (Electron + auto-launch).  ￼
	•	Text-file support – auto-upload any copied file path.
	•	Image optimization – compress before upload to save storage.
	•	Analytics endpoint – emit Prometheus metrics from MCP server.

⸻

Appendix A – Package Index

Package	Version	License
clipboard-event	^2.3	MIT
clipboardy	^4.0	MIT
pngpaste	brew/latest	ISC
img-clipboard	^1.1	MIT
@supabase/supabase-js	^2.x	Apache-2.0
@modelcontextprotocol/typescript-sdk	latest	MIT
fastmcp (Rust)	0.0.x	MIT
arboard (Rust)	^3.3	MIT



⸻

With this PRD and sample code, your team can move from concept to a cross-platform clipboard uploader in under a day, then plug it straight into any LLM workflow via the Model Context Protocol.
