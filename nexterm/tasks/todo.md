# NovaShell - Tasks

## Completed
- [x] Create package.json with dependencies
- [x] Create tsconfig.json and tsconfig.node.json
- [x] Create vite.config.ts
- [x] Create index.html entry point
- [x] Create src/main.tsx React entry
- [x] Create src/App.tsx main layout component
- [x] Create src/store/appStore.ts Zustand global state
- [x] Create component stubs: TitleBar, TabBar, TerminalPanel, Sidebar, StatusBar
- [x] Create src/styles/global.css with theme styles
- [x] Implement xterm.js terminal integration
- [x] Set up Tauri backend
- [x] Add get_git_branch Tauri command
- [x] Add list_directory Tauri command
- [x] Add read_file_preview Tauri command
- [x] Add get_command_suggestions Tauri command
- [x] Register all new commands in invoke_handler
- [x] Configure Tauri bundling for Windows (NSIS + MSI)
- [x] Configure Tauri bundling for macOS (DMG + .app)
- [x] Configure Tauri bundling for Linux (deb + rpm + AppImage)
- [x] Generate proper app icons (all sizes + ICO + ICNS)
- [x] Bundle JetBrains Mono font locally (offline-ready)
- [x] Add CSP security policy
- [x] Add release profile optimization (LTO, strip, codegen-units=1)
- [x] Add tauri-plugin-single-instance (prevent duplicate windows)
- [x] Add tauri-plugin-updater (auto-update framework)
- [x] Add tauri-plugin-process
- [x] Create NSIS custom installer script (desktop shortcut + context menu)
- [x] Create BUILD.md with full packaging instructions
- [x] Create icon generator script
- [x] Rename product to NovaTerm
- [x] Build Windows NSIS installer (NovaTerm_1.0.0_x64-setup.exe - 2.9MB)
- [x] Build Windows MSI installer (NovaTerm_1.0.0_x64_en-US.msi - 3.6MB)

- [x] Add system keychain credential storage (keyring crate, cross-platform)
- [x] Add debug console with log monitoring, level filters, search, export
- [x] Add debug log persistence to disk (JSONL, session files, 7-day rotation)
- [x] Add snippet command sequences (multi-line, shell-native && / ; operators)
- [x] Deep performance optimization: individual Zustand selectors across all components
- [x] React.memo for App children (TerminalPanel, TabBar, StatusBar)
- [x] useMemo for filtered debug logs and level counts
- [x] Async debug log parsing via requestIdleCallback (non-blocking)
- [x] Reduce timer intervals (clock, stats, git branch, session time)
- [x] Move achievement checks from timer to commandCount-driven useEffect

- [x] Auto-update system: signing keys, UpdateNotification component, CI/CD with latest.json

- [x] Rename NovaTerm → NovaShell across entire codebase (~20 files)
- [x] Make extensions panel fully functional (Git, Docker, Node.js, Python, System Info)
- [x] Fix git branch "--" display in StatusBar
- [x] Cross-platform shell detection (dynamic from backend, Homebrew paths)
- [x] Fix contextmenu event listener memory leaks (TerminalPanel + SSHPanel)
- [x] Cap debug parse queue at 500 entries
- [x] Security whitelist for run_command_output
- [x] Fix cmd.exe argument handling (direct exec first, cmd /c fallback for .cmd scripts)
- [x] CI/CD pipeline for automated cross-platform builds (GitHub Actions)

- [x] Fix tab close crash: Drop was joining reader thread blocked on ConPTY read() — detach instead
- [x] Fix ls colors in PowerShell: $e variable was script-scoped, made it $global:e
- [x] Fix Show-ColorDir: improved param handling, added dir/ll function overrides

- [x] Apply i18n translations to HackingPanel and its 6 sub-components (ReconView, ExploitView, ToolsView, AiSecView, AlertsView, HistoryView)

- [x] Performance Round 3: CodeMirror chunk splitting, React.lazy sidebar panels, screenshot removal, initTerminal theme dep fix
  - Main bundle: 1,661KB -> 403KB (76% reduction)
  - CodeMirror split into vendor-codemirror (377KB) + vendor-codemirror-langs (658KB), lazy-loaded
  - 6 heavy sidebar panels lazy-loaded (SSHPanel, SFTPPanel, EditorPanel, InfraMonitor, Hacking, ServerMap)
  - Removed per-command screenshot capture (canvas compositing + base64 on every Enter)
  - Fixed initTerminal theme dependency causing unnecessary useCallback identity changes
  - Optimized addDebugLog: counter ID instead of crypto.randomUUID()
  - Optimized addHistory: skip slice when under 500 limit

- [x] Performance Round 4: Deep optimization audit (2026-03-27)
  - Fix SFTPPanel store destructuring causing full-app re-renders
  - Fix StatusBar stale activeNavStack bug (useMemo+getState → reactive selector)
  - Consolidate server_map_scan from 4 SSH connections to 1 compound command
  - Wrap all blocking SSH calls in tokio::spawn_blocking (prevent async starvation)
  - Fix SFTP manager: use cached SFTP channel for all ops + add missing algorithm config
  - Replace LogStream Mutex<bool> with AtomicBool (eliminate lock contention)
  - Optimize scrollback trim: drain() instead of to_string() allocation
  - Parallelize port scanning with scoped threads (25x faster)
  - Add 10MB read cap to ssh_exec (prevent OOM)
  - Extract duplicated themeColors, EXT_COLORS, formatSize to shared utils
  - Memoize CollabOverlay + targeted selector (reduce re-renders)
  - Lazy-flatten i18n dictionaries (defer unused language)
  - Add vendor-codemirror-langs and vendor-pdf manual chunks to Vite config
  - Replace spread+slice metrics history with .concat() (fewer intermediate arrays)

- [x] Performance Round 5: Deep optimization pass 2 (2026-03-27)
  - Wrap ALL SFTP commands in spawn_blocking (11 commands: list_dir, download, upload, mkdir, delete, rename, home_dir, read_text, write_text, download_dir, upload_dir)
  - Wrap sftp_connect, ssh_connect, start_log_stream in spawn_blocking
  - Wrap hacking commands in spawn_blocking (detect_environment, scan_ports, scan_custom_ports, grab_banner)
  - Fix TerminalPanel navigation listener leak: navListeners map tracks and cleans exit/error listeners per tab
  - Fix debugBuffers orphan: clean old key before tab title change during server navigation
  - Optimize SessionDocPanel: derived count selectors instead of subscribing to full history+debugLogs arrays
  - Optimize SnippetsPanel: 14 action functions moved from individual selectors to getState()
  - Optimize AlertToast: subscribe to alert count instead of full array
  - Unify formatSize: shared util with showZero param, removed 1 duplicate from SFTPPanel

## Pending
- [ ] Code signing for Windows (requires certificate)
- [ ] Code signing for macOS (requires Apple Developer account)
- [ ] Future optimization: dynamic import() for CodeMirror language packs in getLang() (would require async refactor)
