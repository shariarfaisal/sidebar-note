# Sidebar Note

A Chrome extension that provides a minimal markdown note-taking editor and a built-in terminal in the browser's side panel.

## Features

- **Markdown Editor** — Rich text editing powered by TipTap with full markdown support, code blocks with syntax highlighting, images, task lists, and links
- **Note Management** — Create, search, pin, duplicate, and delete notes with auto-save and persistent storage via Chrome Storage API
- **Built-in Terminal** — Integrated xterm.js terminal with multiple tabs, connected to a local shell via WebSocket + node-pty
- **Dark / Light Themes** — Toggle between themes; terminal colors update to match

## Tech Stack

- **Build:** Vite
- **Editor:** TipTap, lowlight
- **Terminal:** xterm.js, node-pty, WebSocket
- **Platform:** Chrome Extensions Manifest V3

## Getting Started

### Prerequisites

- Node.js (v18+)
- Google Chrome

### Install & Build

```bash
npm install
npm run build
```

### Load in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` directory

### Terminal Server

The terminal feature requires a local WebSocket server:

```bash
cd terminal-server
npm install
npm start
```

This starts a server on `ws://localhost:8768` that spawns shell sessions for each terminal tab.

## Development

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

## Project Structure

```
src/
├── main.js          # App initialization & view switching
├── editor.js        # TipTap editor setup
├── chat.js          # Multi-terminal management & WebSocket
├── notes.js         # Note CRUD & utilities
├── ui.js            # UI event handlers & rendering
├── storage.js       # Chrome storage wrapper
├── theme.js         # Theme management
├── sidepanel.html   # Main HTML
└── styles/          # CSS (main, editor, chat, themes)
terminal-server/
└── server.js        # WebSocket + node-pty server
public/
├── manifest.json    # Chrome extension manifest
└── icons/           # Extension icons
```

## License

MIT
