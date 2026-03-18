# NovaShell

**A modern, feature-rich terminal emulator for developers and sysadmins.**

Built with [Tauri](https://tauri.app/) + React + Rust. Native performance, cross-platform, and packed with tools that go far beyond a traditional terminal.

Created by **0xArlee**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/FomoDonkey/NovaShell)](https://github.com/FomoDonkey/NovaShell/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/FomoDonkey/NovaShell/releases)

---

## Features

### Terminal
- Native PTY sessions with truecolor support (xterm-256color)
- Multiple tabs (up to 20) and split panes (vertical / horizontal)
- In-terminal search, clickable links, command autocomplete
- Command history (500 entries, filterable, click-to-rerun)
- Shell support: **PowerShell**, **CMD**, **Git Bash**, **WSL**, **Bash**, **Zsh**, **Fish**
- Focus mode for distraction-free work

### SSH & SFTP
- SSH connection manager with password and private key authentication
- OS keychain integration for secure credential storage
- Full interactive SSH terminal with resize support
- Dual-pane SFTP file browser (upload, download, rename, delete, preview)
- Remote file editing with save-back to server

### Snippets
- Create reusable command snippets with folders and custom colors
- Multi-line command sequences with stop-on-error or run-all modes
- Parameterized snippets with variables and default values
- **Shared folders** for team collaboration (via OneDrive, Dropbox, network drives)
- Sub-folders within shared folders for organization
- Drag-and-drop reordering

### Code Editor
- Built-in editor powered by CodeMirror 6
- Syntax highlighting for 18+ languages (JS, TS, Python, Rust, Go, SQL, YAML, and more)
- Open files from local filesystem or remote SFTP
- Live log streaming from remote servers
- AI-powered code analysis via Ollama

### Debug Console
- Real-time log capture with level detection (error, warn, info, debug, trace)
- Persistent log sessions saved to disk
- **Debug Copilot**: pattern-matched issue detection + AI analysis via Ollama
- Performance monitor: CPU/memory sparklines, top processes, session stats
- Filter by source, search, export, auto-cleanup

### Infrastructure Monitor
- Monitor multiple SSH servers in real-time (CPU, memory, disk, network, load)
- Anomaly detection (mean + 2 sigma spike alerts)
- Cross-server correlation (alerts when 2+ servers trigger simultaneously)
- Global timeline of all events
- **Disk Analyzer**: partition breakdown, cleanup categories, growth tracking
- Process management (kill with SIGTERM/SIGKILL from the UI)
- Configurable alert thresholds and polling intervals

### Server Map
- Scan connected servers for Docker containers, systemd services, and open ports
- Multi-server command execution
- Cross-server service search
- Inline config editing with save-to-server
- Security audit view

### AI Assistant
- Powered by **Ollama** (100% local, no data leaves your machine)
- Chat, explain commands, generate scripts, fix errors
- AI Security Copilot in Hacking Mode
- AI-generated session documentation with PDF export

### Hacking Mode
- Smart reconnaissance: environment detection, port scanning, banner grabbing
- Pentest scripts library with custom exploit editor
- Tools: hash calculator, encoder/decoder, reverse shell generator
- AI security analysis (privilege escalation, hardening, audit)
- Encrypted session save/load
- Security alert monitoring

### More
- **Command Palette** (Ctrl+K): fuzzy search across all actions, panels, servers, snippets
- **Workspaces**: save and restore tab layouts
- **Cross-server navigation**: `cd /servers/myserver` to switch contexts
- **5 themes**: Dark, Light, Cyberpunk, Retro, Hacking
- **2 languages**: English, Spanish (full UI coverage)
- **Auto-updater**: in-app updates with changelog showing all changes since your version
- **Plugin system**: Git, Docker, Node.js, Python, System Info

---

## Installation

Download the latest installer from [Releases](https://github.com/FomoDonkey/NovaShell/releases/latest):

| Platform | Format |
|----------|--------|
| Windows  | `.exe` (NSIS) or `.msi` |
| macOS    | `.dmg` |
| Linux    | `.deb`, `.rpm`, or `.AppImage` |

> **Windows note:** NovaShell installs in your user folder (`AppData`), so no administrator permissions are needed. Auto-updates download and apply automatically without elevation prompts.

---

## Build from Source

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

### Steps

```bash
# Clone the repository
git clone https://github.com/FomoDonkey/NovaShell.git
cd NovaShell/nexterm

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

The installers will be generated in `nexterm/src-tauri/target/release/bundle/`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri 2](https://tauri.app/) |
| Frontend | React 18 + TypeScript + Vite |
| Backend | Rust |
| Terminal | xterm.js (Canvas renderer) |
| Editor | CodeMirror 6 |
| State | Zustand |
| SSH/SFTP | libssh2 (ssh2 crate) |
| PTY | portable-pty |
| AI | Ollama (local models) |
| Keychain | OS credential store (keyring crate) |
| Icons | Lucide React |

---

## Shared Snippet Folders

NovaShell supports collaborative snippet sharing without a cloud backend:

1. Create a shared folder pointing to a path accessible by your team (OneDrive, Dropbox, network drive)
2. Team members create a shared folder pointing to the **same file**
3. Changes sync automatically every 3 seconds via file polling
4. Sub-folders let you organize shared commands by category

---

## AI Features (Ollama)

NovaShell AI runs entirely on your machine via [Ollama](https://ollama.com/):

1. Install Ollama
2. Start Ollama (`ollama serve`)
3. NovaShell auto-detects and downloads models as needed

Features: chat, command explanation, script generation, error fixing, security analysis, session documentation.

---

## Screenshots

*Coming soon*

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## Author

**0xArlee** — [GitHub](https://github.com/FomoDonkey)

## Acknowledgments

- [Tauri](https://tauri.app/) for the cross-platform framework
- [xterm.js](https://xtermjs.org/) for terminal emulation
- [CodeMirror](https://codemirror.net/) for the code editor
- [Ollama](https://ollama.com/) for local AI inference
- [Lucide](https://lucide.dev/) for the icon set
