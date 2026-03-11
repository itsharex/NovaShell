# NexTerm - Professional Terminal Emulator

> A visually stunning, feature-rich terminal emulator built with Tauri + React + TypeScript + xterm.js

---

## Visual Layout (ASCII Schema)

```
+========================================================================================+
|  [NexTerm Logo]  [Dark][Light][Cyber][Retro]     Professional Terminal    [F][S][-][M][X] |
+========================================================================================+
|  [PS Terminal 1] [>_ CMD] [$ Bash] [+ New Tab v]                                       |
+========================================================================================+
|                                                    |  [History][Snippets][Preview]      |
|  nexterm ~ $                                       |  [Plugins][Stats]                  |
|  > git status                                      | --------------------------------- |
|  On branch main                                    |  QUICK COMMANDS                    |
|  Changes not staged for commit:                    |  +-----------------------------+   |
|    modified: src/App.tsx                            |  | [>] Git Status              |   |
|    modified: src/styles/global.css                  |  |     git status              |   |
|                                                    |  +-----------------------------+   |
|  nexterm ~ $ docker ps                             |  +-----------------------------+   |
|  CONTAINER ID  IMAGE    STATUS                     |  | [>] List Files              |   |
|  a1b2c3d4      nginx    Up 2h                      |  |     ls -la                  |   |
|  e5f6g7h8      redis    Up 5h                      |  +-----------------------------+   |
|                                                    |  +-----------------------------+   |
|  nexterm ~ $ _                                     |  | [>] Docker PS               |   |
|                                                    |  |     docker ps               |   |
|                                                    |  +-----------------------------+   |
|                                                    |                                    |
|                                                    |  SYSTEM MONITOR                    |
|                                                    |  +----------+ +----------+         |
|                                                    |  |  23%     | |  53%     |         |
|                                                    |  |  CPU     | |  Memory  |         |
|                                                    |  | [======] | | [=====]  |         |
|                                                    |  +----------+ +----------+         |
|                                                    |  +----------+ +----------+         |
|                                                    |  |  142     | |  8.5 GB  |         |
|                                                    |  |  Procs   | |  RAM     |         |
|                                                    |  +----------+ +----------+         |
+========================================================================================+
|  [*] Ready  [>_] PowerShell  [Branch] main    [Theme] Dark  [Enc] UTF-8  [Time] 14:32  |
+========================================================================================+
```

## Architecture

```
nexterm/
+-- src-tauri/                  # Rust backend (Tauri v2)
|   +-- src/
|   |   +-- main.rs             # Tauri commands & app setup
|   |   +-- pty_manager.rs      # PTY session management (portable-pty)
|   |   +-- system_info.rs      # System stats (sysinfo crate)
|   +-- Cargo.toml
|   +-- tauri.conf.json
|
+-- src/                        # React frontend
|   +-- components/
|   |   +-- TitleBar.tsx        # Window controls, theme selector, logo
|   |   +-- TabBar.tsx          # Multi-tab management, shell selector
|   |   +-- TerminalPanel.tsx   # xterm.js terminal instances
|   |   +-- Sidebar.tsx         # History, snippets, preview, plugins, stats
|   |   +-- StatusBar.tsx       # Shell info, git branch, system stats, clock
|   +-- store/
|   |   +-- appStore.ts         # Zustand global state management
|   +-- styles/
|   |   +-- global.css          # Complete theme system (4 themes) & styles
|   +-- main.tsx                # React entry point
|   +-- App.tsx                 # Main layout with animated sidebar
|
+-- package.json
+-- tsconfig.json
+-- vite.config.ts
+-- index.html
```

## Tech Stack

| Layer       | Technology                   | Purpose                      |
|-------------|------------------------------|------------------------------|
| Framework   | **Tauri v2**                 | Lightweight native wrapper   |
| Frontend    | **React 18 + TypeScript**    | UI components                |
| Terminal    | **xterm.js v5**              | Terminal emulation           |
| PTY         | **portable-pty (Rust)**      | Native process execution     |
| State       | **Zustand**                  | Global state management      |
| Animation   | **Framer Motion**            | Smooth UI transitions        |
| Icons       | **Lucide React**             | Modern icon library          |
| Bundler     | **Vite 5**                   | Fast dev server & build      |
| System      | **sysinfo (Rust)**           | CPU, memory, process stats   |

## Features

### Multi-Shell Support
- PowerShell, CMD, Git Bash, WSL, Zsh
- Quick shell switching via tab dropdown
- Independent PTY sessions per tab

### 4 Built-in Themes
- **Dark** - GitHub-inspired dark theme
- **Light** - Clean light theme
- **Cyberpunk** - Neon cyan/magenta/purple with glow effects
- **Retro** - Green phosphor CRT with scanline effect

### Sidebar Panels
- **History** - Searchable command history with timestamps
- **Snippets** - Quick command cards with one-click execution
- **Preview** - File preview (MD, JSON, CSV, images)
- **Plugins** - Extension manager with toggle switches
- **Stats** - Live CPU, memory, process count dashboard

### UI/UX
- Custom frameless window with native controls
- Focus mode (auto-hide UI chrome)
- Animated sidebar with Framer Motion
- Custom scrollbars
- JetBrains Mono font with ligatures

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.70
- [Tauri CLI](https://tauri.app/start/): `cargo install tauri-cli`

### Install & Run

```bash
cd nexterm

# Install frontend dependencies
npm install

# Run in development mode
cargo tauri dev

# Build for production
cargo tauri build
```

### Run Frontend Only (Demo Mode)

```bash
cd nexterm
npm install
npm run dev
# Open http://localhost:5173
```

The terminal runs in demo mode without the Tauri backend, with interactive commands: `help`, `neofetch`, `colors`, `matrix`, `theme`, `date`, `clear`.

## Module Documentation

### Backend (Rust/Tauri)

| Module           | Commands                                        |
|------------------|-------------------------------------------------|
| `main.rs`        | App initialization, command registration        |
| `pty_manager.rs` | `create_pty_session`, `write_to_pty`, `resize_pty`, `close_pty_session` |
| `system_info.rs` | `get_system_info` (CPU, RAM, processes, OS)     |

### Frontend (React/TypeScript)

| Component         | Responsibility                                     |
|-------------------|----------------------------------------------------|
| `TitleBar`        | Drag region, theme dots, focus/sidebar toggles, window controls |
| `TabBar`          | Tab management, shell type selector dropdown       |
| `TerminalPanel`   | xterm.js lifecycle, PTY bridge, theme colors       |
| `Sidebar`         | 5 panels: history, snippets, preview, plugins, stats |
| `StatusBar`       | Shell type, git branch, encoding, theme, clock     |
| `appStore`        | Centralized state: tabs, themes, history, snippets |

### Plugin System

Plugins are defined as cards in the sidebar with enable/disable toggles. The architecture supports:
- Git integration (branch display, diff viewer)
- Docker management (container list, logs)
- Kubernetes (pod management)
- Language REPLs (Python, Node.js)
- SSH connection manager

## Extending

### Add a New Theme

1. Add CSS variables block in `global.css`:
```css
[data-theme="mytheme"] {
  --bg-primary: #...;
  /* ... all variables */
}
```
2. Add theme to `ThemeName` type in `appStore.ts`
3. Add theme dot in `TitleBar.tsx`
4. Add terminal colors in `TerminalPanel.tsx`

### Add a New Sidebar Panel

1. Add panel ID to `SidebarTab` type in `appStore.ts`
2. Create panel component in `Sidebar.tsx`
3. Add tab button to `sidebarTabs` array

### Add a New Tauri Command

1. Define `#[tauri::command]` function in Rust
2. Register in `invoke_handler!` in `main.rs`
3. Call from frontend: `await invoke("command_name", { args })`

## License

MIT
