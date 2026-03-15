# NovaShell - Modern Terminal Emulator

> A feature-rich, cross-platform terminal emulator built with Tauri v2 + React + TypeScript + xterm.js

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange)](https://tauri.app)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()
[![Release](https://img.shields.io/github/v/release/FomoDonkey/NovaShell)](https://github.com/FomoDonkey/NovaShell/releases)

---

## Features

### Terminal
- **Multi-Shell Support** — PowerShell, CMD, Git Bash, WSL (Windows) / Bash, Zsh, Fish (macOS/Linux), auto-detected
- **Multi-Tab Terminal** — Independent PTY sessions per tab with shell selector
- **Split Panes** — Horizontal and vertical splits
- **Command Autocomplete** — Suggestions from PATH and common commands
- **Focus Mode** — Auto-hide UI chrome for distraction-free work
- **Colored Prompts** — Init scripts inject styled prompts, syntax highlighting, and `ls` coloring per shell
- **Offline-Ready** — Bundled JetBrains Mono font, no internet required

### Cross-Server Navigation
- **Jump Between Servers** — Navigate SSH servers like folders: `cd webserver:/var/www`
- **Filesystem Syntax** — Global path style: `cd /servers/webserver/var/www`
- **Server Listing** — `ls /servers` shows all SSH connections with status
- **Navigation Stack** — Breadcrumb in StatusBar shows: `local → webserver → dbserver`
- **Multi-Hop** — Chain servers: local → web → db → back to local with `cd local:~`
- **Auto-Restore** — SSH disconnect auto-restores previous context
- **Session-Aware** — Clipboard paste, terminal resize, snippets, and autocomplete all route to the correct active session (PTY or SSH)

### SSH Client
- **Full SSH Terminal** — Built-in SSH connections with xterm.js emulation
- **Dual Authentication** — Password or private key (PEM, OpenSSH, ECDSA, Ed25519)
- **Secure Keychain Storage** — Save passwords in system keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- **Session Memory** — "Remember for this session" option for passwords without persisting to disk
- **Connection Management** — Add, edit, delete, and test connections before saving
- **Live Status Indicators** — Per-connection status (disconnected, connecting, connected, error)

### SFTP File Transfer
- **WinSCP-Style Dual Panel** — Browse local and remote filesystems side by side
- **Upload & Download** — Multi-file transfer with status tracking (pending, transferring, done, error)
- **Remote File Management** — Create folders, rename, delete files/directories on the remote server
- **Text File Preview** — View remote text files up to 1 MB directly in the panel
- **Reuses SSH Connections** — Connects via saved SSH configs with keychain/session password support
- **Transfer Log** — Real-time transfer history with status indicators

### Infrastructure Monitor
Real-time monitoring dashboard for all connected SSH servers:
- **Live Metrics** — CPU, RAM, Disk, Network I/O, Load Average, Top Processes — polled every 10s via SSH
- **SVG Sparklines** — Zero-dependency inline charts showing metric trends (60 data points)
- **Health Score** — 0-100 composite score per server (weighted: 40% CPU, 35% Memory, 25% Disk)
- **Anomaly Detection** — Statistical spike detection (mean + 2 standard deviations) even below fixed thresholds
- **Cross-Server Correlation** — Alerts when 2+ servers spike within 30 seconds (systemic issue indicator)
- **Alert System** — Threshold-based warnings/criticals with 60-second deduplication cooldown
- **Global Timeline** — Chronological event log: alerts, actions, connections, disk cleanups
- **Control Center** — One-click actions per server:
  - CPU High: Show Processes, Kill PID (SIGTERM/SIGKILL with 2-step confirm), Open Terminal
  - Memory High: Memory Map, Cache/Buffers info, Open Terminal
  - Disk High: Analyze Disk (opens Disk tab), Scan Large Files, Open Terminal
  - Failed Services: Restart service, Show all failed
- **Compact Mode** — Toggle between full cards and one-line-per-server view
- **Configurable** — Adjustable polling intervals (5-60s) and warning/critical thresholds

### Disk Analyzer (CCleaner-style)
Built into the Infrastructure Monitor — scan and clean remote server disks:
- **Partition Overview** — Donut charts per partition with used/free/total and filesystem type
- **Largest Directories** — Treemap-style bars from `du -xmd1 /` (click any to open terminal there)
- **Disk Growth Tracking** — Compares current vs previous scan, highlights directories with >500MB growth
- **9 Cleanup Categories** — System Logs, Systemd Journal, System Cache, Package Cache, Temp Files, Docker, Core Dumps, Snap Packages, Old Kernels
- **Inspect Before Clean** — Preview files that will be affected before any deletion
- **Per-Category Actions** — View files, Tail syslog, Show errors, Docker images/volumes, and more
- **Multi-Select Cleanup** — Check categories, see total reclaimable space, batch clean with one click
- **Confirm Before Delete** — Every cleanup action requires explicit confirmation
- **Auto-Rescan** — Automatic re-scan after cleanup to show reclaimed space
- **Safe Scans** — `timeout` + `-xdev` flags prevent hangs on large/networked filesystems

### Themes
- **5 Built-in Themes** — Dark, Light, Cyberpunk (neon glow), Retro (green CRT), Hacking (matrix green)
- Each theme fully styles terminal, UI panels, SSH sessions, and status bar

### Sidebar Panels
- **History** — Command history with timestamps, search/filter, one-click re-run
- **Snippets** — Saved command templates with folder organization, icons, and batch execution modes (stop-on-error / run-all)
- **File Explorer** — Browse local filesystem and preview file contents
- **Plugins** — Live integrations with real system data:
  - **Git** — Branch, changed files, status, recent commits
  - **Docker** — Running containers and images
  - **Node.js** — Version, npm version, package.json scripts
  - **Python** — Version, pip, virtual environment info
  - **System Info** — Hostname, uptime, network info (platform-aware)
- **System Stats** — Real-time CPU, memory, disk usage, process list with performance sparklines
- **SSH** — Connection manager (see SSH Client section)
- **SFTP Transfer** — Dual-panel file transfer (see SFTP section)
- **Server Map** — Service discovery and port scanning on remote servers
- **Editor** — Built-in file editor with VS Code-like syntax highlighting
- **Debug Console** — Live log monitoring (see below)
- **AI Assistant** — Local AI chat via Ollama (see below)
- **Session Docs** — Auto-generated session documentation (see below)
- **Hacking Mode** — Security toolkit (see below)
- **Infra Monitor** — Live infrastructure monitoring + disk analyzer (see above)

### Debug Console
- **Live Log Monitoring** — Real-time log capture with level filters (error, warn, info, debug, trace, output)
- **Source Filtering** — Filter logs by terminal tab or SSH connection
- **Search & Filter** — Full-text search across all log entries
- **Persistent Logs** — JSONL log files with 7-day retention and session history
- **Export** — Export logs to file for external analysis

### AI Assistant (Ollama)
- **Local AI Chat** — Chat with locally-running LLMs via Ollama (no cloud required)
- **Multiple Modes** — Chat, explain code, generate commands, fix errors
- **Model Management** — List, pull, and select Ollama models from the sidebar
- **Context-Aware** — Full conversation history for multi-turn interactions
- **Health Check** — Auto-detect Ollama availability

### Session Documentation
- **Auto-Generated Docs** — AI-powered session summaries with commands executed, errors encountered, and duration
- **Save & Browse** — Save session docs with timestamps, browse history
- **PDF Export** — Export session documentation to Downloads folder
- **Delete Management** — Clean up old session documents

### Hacking Mode
- **Security Theme** — Activates matrix-green "hacking" theme with animated alert toasts
- **Reconnaissance** — Environment detection, port scanning (common + custom ports), banner grabbing, network map visualization
- **Exploit Database** — Curated pentest scripts and exploit templates
- **AI Security Copilot** — AI-powered security analysis with full conversation context
- **Security Tools** — Hash calculator (MD5, SHA-1, SHA-256), encoder/decoder (Base64, URL, Hex), reverse shell generator (Bash, Python, Netcat, PHP, Perl, PowerShell)
- **Session History** — Encrypted session save/load with password protection (AES-style encryption)
- **Security Reports** — Auto-generated vulnerability assessment reports
- **Real-Time Alerts** — Security monitoring with dismissable alert toasts

### Auto-Update
- **Background Update Checks** — Automatic detection of new versions
- **Download Progress** — Visual progress tracking with percentage
- **One-Click Install** — Install and relaunch with a single click
- **Signed Releases** — Minisign-verified updates for all platforms

### Other
- **Single Instance** — Prevents duplicate app windows
- **Custom NSIS Installer** — Desktop shortcut, Start menu, "Open NovaShell here" context menu (Windows)
- **Resizable Sidebar** — Drag to resize sidebar width (260px-700px)
- **File-Based Config** — Settings, connections, snippets, and history persist across app updates (stored in OS data directory)

---

## Download & Install

### Windows
Download `NovaShell_x.x.x_x64-setup.exe` or `.msi` from [Releases](../../releases).

The NSIS installer includes:
- Custom installation folder
- Desktop shortcut + Start menu entry
- "Open NovaShell here" context menu
- Language selector (English/Spanish)

### macOS
Download `NovaShell_x.x.x_aarch64.dmg` (Apple Silicon) or `NovaShell_x.x.x_x64.dmg` (Intel) from [Releases](../../releases). Open and drag to Applications.

If macOS blocks the app: `xattr -cr /Applications/NovaShell.app`

### Linux
Download from [Releases](../../releases):
- `.AppImage` — Run directly: `chmod +x NovaShell_*.AppImage && ./NovaShell_*.AppImage`
- `.deb` — `sudo dpkg -i NovaShell_*_amd64.deb`
- `.rpm` — `sudo rpm -i NovaShell-*-1.x86_64.rpm`

---

## Quick Start: Cross-Server Navigation

Once you have SSH connections configured in the SSH panel:

```bash
# Jump to a server
cd webserver:/var/www

# Or use filesystem-style syntax
cd /servers/webserver/var/www

# List available servers
ls /servers

# Jump between servers directly
cd dbserver:/home

# Return to local machine
cd local:~
```

The StatusBar shows your current location and navigation breadcrumb.

---

## Quick Start: Infrastructure Monitor

1. Open the **Infra Monitor** tab in the sidebar (Gauge icon)
2. Connect to SSH servers in the SSH panel first
3. Click **Play** on a server card to start monitoring
4. Watch real-time metrics, sparklines, and health scores update
5. Click **Disk** tab to scan and analyze disk usage
6. Use **Timeline** to see all events chronologically

---

## Tech Stack

| Layer       | Technology                   | Purpose                            |
|-------------|------------------------------|------------------------------------|
| Framework   | **Tauri v2**                 | Lightweight native wrapper         |
| Frontend    | **React 18 + TypeScript**    | UI components                      |
| Terminal    | **xterm.js v5 + CanvasAddon**| GPU-accelerated terminal emulation |
| PTY         | **portable-pty (Rust)**      | Native process execution           |
| SSH/SFTP    | **ssh2 (Rust)**              | SSH connections + SFTP transfers   |
| Keychain    | **keyring (Rust)**           | Secure credential storage          |
| State       | **Zustand**                  | Global state management            |
| Icons       | **Lucide React**             | Modern icon library                |
| Bundler     | **Vite 5**                   | Fast dev server & build            |
| System      | **sysinfo (Rust)**           | CPU, memory, process stats         |
| AI          | **Ollama (local)**           | Local LLM inference via HTTP API   |
| HTTP        | **reqwest (Rust)**           | Async HTTP client for AI/updates   |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.70
- Platform-specific dependencies (see [BUILD.md](BUILD.md))

### Development

```bash
cd nexterm

# Install frontend dependencies
npm install

# Run in development mode (starts both frontend and Tauri backend)
npm run tauri dev
```

### Production Build

```bash
cd nexterm
npm install
npm run tauri:build
```

Installers output to `src-tauri/target/release/bundle/`

---

## Architecture

```
nexterm/
├── src-tauri/                     # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── main.rs                # Commands, shell detection, AppState, security whitelist
│   │   ├── pty_manager.rs         # PTY session lifecycle (two-thread batching)
│   │   ├── ssh_manager.rs         # SSH connections, terminal I/O, log streams
│   │   ├── sftp_manager.rs        # SFTP file transfer operations
│   │   ├── infra_monitor.rs       # Infrastructure monitoring engine (per-server polling threads)
│   │   ├── keychain_manager.rs    # System keychain integration
│   │   ├── log_manager.rs         # JSONL log persistence & rotation
│   │   ├── session_doc_manager.rs # Session documentation storage
│   │   ├── ai_manager.rs          # Ollama AI integration (chat, models)
│   │   ├── hacking_manager.rs     # Port scanning, recon, encryption
│   │   └── system_info.rs         # CPU, memory, disk, process stats
│   ├── capabilities/main.json     # Tauri permission declarations
│   ├── nsis/installer.nsi         # Custom Windows installer script
│   ├── icons/                     # App icons (ICO, ICNS, PNG at multiple sizes)
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                           # React frontend
│   ├── components/
│   │   ├── TitleBar.tsx           # Window controls, theme selector, hacking mode toggle
│   │   ├── TabBar.tsx             # Multi-tab management, dynamic shell selector
│   │   ├── TerminalPanel.tsx      # xterm.js terminal with PTY bridge + cross-server navigation
│   │   ├── Sidebar.tsx            # Tab navigation + all sidebar panels (15 tabs)
│   │   ├── SSHPanel.tsx           # SSH connection manager & terminal
│   │   ├── SFTPPanel.tsx          # SFTP dual-panel file transfer explorer
│   │   ├── InfraMonitorPanel.tsx  # Infrastructure monitor + disk analyzer dashboard
│   │   ├── ServerMapPanel.tsx     # Server service discovery & port scanning
│   │   ├── FileExplorer.tsx       # Local filesystem browser
│   │   ├── EditorPanel.tsx        # Built-in file editor with syntax highlighting
│   │   ├── StatusBar.tsx          # Shell, git branch, server breadcrumb, infra alerts, clock
│   │   ├── DebugPanel.tsx         # Debug console with log persistence
│   │   ├── AIPanel.tsx            # Ollama AI assistant chat interface
│   │   ├── SessionDocPanel.tsx    # Session documentation viewer
│   │   ├── HackingPanel.tsx       # Hacking mode sub-tab container
│   │   ├── UpdateNotification.tsx # Auto-update UI
│   │   ├── SearchOverlay.tsx      # Terminal search (Ctrl+F)
│   │   ├── Autocomplete.tsx       # Command autocomplete dropdown
│   │   └── hacking/              # Hacking mode sub-components
│   │       ├── ReconView.tsx      # Reconnaissance & port scanning
│   │       ├── ExploitView.tsx    # Exploit database & scripts
│   │       ├── AiSecView.tsx      # AI security copilot
│   │       ├── HistoryView.tsx    # Encrypted session history
│   │       ├── AlertsView.tsx     # Security alert management
│   │       ├── AlertToast.tsx     # Animated alert toasts
│   │       └── ToolsView.tsx      # Hash, encode/decode, reverse shells
│   ├── store/
│   │   └── appStore.ts            # Zustand state (tabs, themes, SSH, infra, disk, navigation)
│   ├── utils/
│   │   ├── serverNavigation.ts    # Cross-server navigation (resolve, parse, navigate)
│   │   ├── hackingAlerts.ts       # Security monitor & alert generation
│   │   ├── pdfGenerator.ts        # PDF document generation
│   │   └── markdown.ts            # Markdown parsing utilities
│   ├── styles/
│   │   └── global.css             # 5 theme systems & all component styles
│   ├── main.tsx
│   └── App.tsx
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

---

## Extending

### Add a New Theme

1. Add CSS variables in `global.css`:
```css
[data-theme="mytheme"] {
  --bg-primary: #...;
  /* ... all variables */
}
```
2. Add theme to `ThemeName` type in `appStore.ts`
3. Add theme dot in `TitleBar.tsx`
4. Add terminal colors in `TerminalPanel.tsx` and `SSHPanel.tsx`

### Add a New Tauri Command

1. Define `#[tauri::command]` function in Rust
2. Register in `invoke_handler!` in `main.rs`
3. Call from frontend: `await invoke("command_name", { args })`

### Add a New Sidebar Panel

1. Add tab ID to `SidebarTab` type in `appStore.ts`
2. Create the panel component in `src/components/`
3. Add tab entry (icon + label) in `sidebarTabs` array in `Sidebar.tsx`
4. Add conditional render in the sidebar content section

### Add a New Plugin Integration

1. Add plugin entry in `DEFAULT_PLUGINS` array in `appStore.ts`
2. Add the plugin panel UI in `Sidebar.tsx` `PluginsPanel` component
3. Use `run_command_output` to fetch real system data (commands must be in the security whitelist in `main.rs`)

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## License

MIT — See [LICENSE](LICENSE) for details.
