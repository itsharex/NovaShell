# NovaShell - Lessons Learned

## Session 1 (2026-03-11)
- Project uses Vite + React + TypeScript + Tauri stack
- App.tsx imports components not yet created (TitleBar, TabBar, TerminalPanel, Sidebar, StatusBar)

## Session 2 - Packaging (2026-03-11)
- Tauri 2 bundle identifier must NOT end with `.app` (conflicts with macOS .app extension)
- `resources` glob in tauri.conf.json fails build if directory is empty — remove or add files
- curl on Windows with schannel needs `--ssl-no-revoke` flag for GitHub downloads
- Tauri auto-downloads NSIS 3.11 and WiX 3.14 when needed for bundling
- Release profile optimizations (LTO, strip, codegen-units=1, opt-level=s) result in ~2.9MB NSIS installer
- JetBrains Mono fonts must be bundled locally in `public/fonts/` for offline operation — Google Fonts won't work in packaged app
- `npx @tauri-apps/cli icon` generates all icon sizes from a single SVG/PNG source
- tauri-plugin-single-instance prevents multiple app windows from opening
- NSIS custom macros go in `src-tauri/nsis/installer.nsi` for context menu entries and desktop shortcuts
- Frontend plugins (@tauri-apps/plugin-updater, plugin-process) must be installed via npm AND registered in Rust main.rs AND added to capabilities/main.json

## Session 3 - Features & Optimization (2026-03-11)
- keyring crate v2 uses `delete_password()` not `delete_credential()` — API changed from v1
- Lucide React icons don't accept `title` prop directly — wrap in `<span title="...">` instead
- Zustand `useAppStore()` with no selector subscribes to entire store, causing cascading re-renders on any state change. Always use `useAppStore((s) => s.prop)` for individual selectors
- Shell-native command chaining (`&&` / `;`) is far more reliable than timed delays between commands — the shell itself manages sequencing
- `requestIdleCallback` is ideal for non-critical async work like debug log parsing — keeps terminal rendering smooth
- `useMemo` for filtered/derived data prevents O(n) recalculation on every render when inputs haven't changed
- Timer intervals (polling) are expensive for re-renders — prefer event-driven updates (e.g., useEffect on value change) over setInterval where possible
- JSONL format for log persistence allows append-only writes and line-by-line parsing without loading entire file into memory
- Tauri v2 updater requires: pubkey in tauri.conf.json, signing env vars (`TAURI_SIGNING_PRIVATE_KEY`) in CI, and a `latest.json` endpoint
- For Tauri updater, Windows uses `.exe` (NSIS), macOS uses `.app.tar.gz`, Linux uses `.AppImage` — each with `.sig` signature files
- The updater `latest.json` must have `version`, `pub_date`, `platforms` with per-platform `url` + `signature` fields
- Private signing keys must NEVER be committed — store as GitHub Secrets and reference via env vars in CI
- Tauri v2 updater config uses `plugins.updater.pubkey` and `plugins.updater.endpoints` (not `active`/`dialog` like v1)

## Session 4 - Cross-platform fixes & cmd.exe bug (2026-03-12)
- On Windows, `cmd /c command args...` breaks complex arguments (e.g., `node -e "try{...}catch{...}"` produces no output). Solution: try direct `Command::new()` first, only fall back to `cmd /c` when `ErrorKind::NotFound` (for .cmd/.bat scripts like npm, npx)
- `navigator.platform` is the simplest way to detect OS in frontend for default shell selection
- Shell detection must be dynamic from backend — hardcoded shell lists break on non-Windows OS
- macOS Homebrew installs shells to `/opt/homebrew/bin/` (ARM) or `/usr/local/bin/` (Intel) — must check both
- Always store event listener references for cleanup — anonymous functions in `addEventListener` leak memory
- When renaming a project, keep Cargo.toml `name` unchanged if Cargo.lock references it (avoids rebuild issues)

## Session 5 - Tab crash & PowerShell colors (2026-03-13)
- ConPTY `reader.read()` blocks forever on Windows — joining the reader thread in Drop causes infinite hang (app freezes). Solution: detach the reader thread and let it exit naturally when the master PTY struct field is dropped after Drop returns.
- PowerShell variables defined in a dot-sourced script are script-scoped by default. Functions defined as `function global:X` run in global scope, so they can't see script-scoped variables. Use `$global:varname` for variables that functions need.
- PowerShell AllScope aliases (ls, dir) can't be removed with `Remove-Item alias:\ls -Force`. Functions take precedence over aliases, but only if the function is in scope. Use `function global:ls` to override.

## Session - i18n Hacking Panel (2026-03-16)
- When applying i18n to files with `.map((t, i) =>` callbacks, the `t` variable shadows the `useT()` hook's `t`. Rename the callback param (e.g., `tpl`, `tab`) to avoid conflicts.
- The en.ts/es.ts locale files already had a `hacking` section with most keys pre-defined from a prior session. Always check existing locale sections before adding duplicates.
- Sub-components (HashTool, EncodeTool, RevShellTool, CopyButton) inside the same file each need their own `const t = useT()` call since hooks must be called at the component level.
- When changing object property names (e.g., `label` -> `labelKey`) in const arrays used by components, check all references including non-UI code (log messages, etc.) that used the old property name.

## Session - Performance Round 3 (2026-03-16)
- Vite `manualChunks` can't use bare package names for packages without a "." export in package.json (e.g., `@codemirror/legacy-modes` only exports subpaths). Use specific subpath imports or omit from manualChunks.
- `React.lazy()` with named exports requires a `.then(m => ({ default: m.NamedExport }))` wrapper since lazy expects a default export.
- When a `useCallback` reads store state only at init time (not reactively), use `useAppStore.getState()` inside the callback body instead of subscribing to the value and adding it to deps. This prevents unnecessary callback identity changes.
- Canvas screenshot capture (compositing multiple canvas layers + blob + base64) on every command is a hidden performance killer — GPU readback is expensive and base64 strings consume memory. Only capture on demand.
- `crypto.randomUUID()` is fast but not free — for high-frequency IDs like debug log entries, a simple incrementing counter is sufficient and zero-cost.

## Session - Performance Round 5: Deep Optimization Pass 2 (2026-03-27)
- ALL Tauri commands that call SSH/SFTP network I/O MUST use `spawn_blocking`. Tauri dispatches sync commands on a thread pool and async commands on Tokio — both block if the underlying I/O is synchronous. This includes sftp_connect, ssh_connect, and every SFTP operation.
- Port scanning and environment detection (wmic on Windows) are also blocking and should not run on the main command thread.
- Navigation listeners (ssh-exit, ssh-error) accumulate in the `unlisteners` array across server hops. Track them separately and clean on each new navigation to prevent leak.
- Debug buffer keys are the tab title — when a tab's title changes during server navigation, the old buffer key is orphaned. Always delete the old key before updating the title.
- Zustand selectors like `(s) => s.array.filter(...).length` only cause re-renders when the returned NUMBER changes, not when the array reference changes. This is a cheap way to subscribe to derived counts without subscribing to the full array.
- Action functions from Zustand (e.g., `addSnippet`, `removeSnippet`) are stable references that never change. Reading them via `useAppStore.getState()` once is safe and eliminates unnecessary subscription overhead.

## Session - Performance Round 4: Deep Optimization (2026-03-27)
- `useAppStore()` with destructuring `const { x } = useAppStore()` is equivalent to no selector — subscribes to ALL state. Must always use `useAppStore((s) => s.x)`.
- `useMemo` with `useAppStore.getState()` inside is an anti-pattern: the memoized value won't update when store changes, only when the deps array changes. Use a reactive selector instead.
- `ssh2::exec_command` is blocking (TCP+SSH handshake). Never call it directly in an async Tauri command — wrap in `tokio::task::spawn_blocking()` to avoid starving the Tokio runtime.
- Compound shell commands (`echo DELIM; cmd1; echo DELIM; cmd2`) over a single SSH session are far cheaper than opening multiple SSH connections (saves 3+ TCP+SSH handshakes per call).
- `String::drain(..n)` modifies in-place without allocating, while `sb[n..].to_string()` allocates a new String. For hot paths like scrollback trimming, drain() is significantly better.
- `Mutex<bool>` for a simple running flag is overkill — `AtomicBool` with `Ordering::Relaxed` is lock-free and sufficient for stop signals.
- SFTP `session.sftp()` creates a new subsystem channel each time. Cache the `Sftp` handle and reuse it for all operations in the same session.
- `std::thread::scope` enables easy parallelization of independent work items (like port scanning) with automatic lifetime management.
- `read_to_string()` with no size cap on SSH command output can cause OOM if the remote command produces unbounded output. Always add a read cap.

## Session - SSH transport read fix (2026-03-17)
- Calling `session.keepalive_send()` on every WouldBlock/TimedOut (every ~100ms) floods the server with keepalive packets and can cause it to drop the connection ("transport read" error). Use a time-based interval (15s).
- `session.set_timeout()` is shared state between reader thread and write method — changing it in write() creates a race condition. Use retries with the existing timeout instead of temporarily increasing it.
- OS-level TCP keepalive (via `socket2` crate) is essential alongside SSH-level keepalive to survive NAT/firewall idle timeouts that silently kill TCP connections.
