# NovaTerm - Lessons Learned

## UTF-8 Boundary Handling — CRITICAL (v2.4.9)
- A 16KB read buffer can split a multi-byte UTF-8 character (e.g., emoji, CJK) between two reads
- `str::from_utf8()` fails with `Utf8Error` which has `valid_up_to()` and `error_len()`
- `error_len() == None` means incomplete sequence at end → save leftover bytes for next read
- `error_len() == Some(n)` means invalid byte mid-stream → use lossy conversion
- Must prepend leftover bytes to next read's buffer before UTF-8 validation
- This affects both SSH and PTY readers — identical pattern in both

## SSH Integration
- ssh2 Rust crate v0.9 works well for native SSH without Node.js dependency
- Channel needs mut for request_pty_size call
- Non-blocking mode needed for reader thread, blocking for writes
- Temp key files must be cleaned up immediately after use
- Passwords must never be persisted to disk (only in-memory during session)
- localStorage stores connection configs without sensitive data
- sessionPassword field excluded from localStorage serialization alongside status/sessionId/errorMessage

## Performance Optimization
- sysinfo::System::new_all() is expensive - create once in AppState and reuse with targeted refresh_cpu/refresh_memory/refresh_processes
- sysinfo 0.30 API: use refresh_cpu() (no args), global_cpu_info().cpu_usage() (not global_cpu_usage)
- Dynamic imports of @tauri-apps/api modules should be cached at module level to avoid re-importing
- React useEffect deps that include state arrays/callbacks cause constant re-execution - use refs for values only read inside callbacks
- PATH command scanning is slow on Windows (many dirs) - cache results in Rust AppState
- Debounce user-driven searches (autocomplete) to avoid flooding backend
- Merging multiple useEffects with same lifecycle reduces overhead

## PTY Batching — CRITICAL
- Single-thread batching (read + time-check in same loop) causes data to get STUCK when `reader.read()` blocks
- Symptom: backspace doesn't work, keystroke echoes delayed until next input arrives
- Fix: TWO threads — one reader (appends to shared batch), one flusher (emits every 16ms regardless)
- The flusher guarantees data is never stuck waiting for the next blocking read()
- Large batch threshold (16KB) in reader provides fast-path for bulk output (e.g., `cat` large files)

## PowerShell AllScope Aliases
- `ls`, `dir`, `cd` etc. are built-in AllScope aliases in PowerShell 5.1
- `Set-Alias -Name ls -Value X -Force` FAILS with "La opcion de AllScope no se puede quitar"
- Cannot override AllScope aliases even with `-Force` — just don't try
- Use alternative alias names like `ll` instead, or define functions directly

## xterm.js Cursor & Selection
- `allowTransparency: true` is REQUIRED for proper cursor and selection rendering in WebView2
- Without it, cursor may become invisible and text selection overlay doesn't render
- `cursorWidth: 2` helps visibility for bar-style cursors
- Selection colors (selectionBackground/selectionForeground) in theme need alpha channel with allowTransparency

## Tab Close / PTY Cleanup
- Async PTY disposal can race with terminal.dispose() causing crashes
- Fix: remove from maps FIRST, unsubscribe listeners, THEN close PTY, dispose terminal in .finally()
- Never call terminal.dispose() before PTY close_pty_session completes

## Keychain / Credential Storage
- keyring crate v2 is the best option for cross-platform secure storage (no Tauri plugin needed)
- Windows: Credential Manager (DPAPI), macOS: Keychain, Linux: Secret Service/gnome-keyring
- keyring v2 API: delete_password() not delete_credential() (v3 renamed it)
- Lucide React icons don't accept title prop - wrap in <span title="..."> instead
- Always clean up keychain entries when deleting a connection to avoid orphaned credentials

## Debug / Log Monitoring
- Terminal output (PTY data) arrives as raw strings with ANSI escape codes - strip them before parsing
- Log level detection via regex patterns for common frameworks (ERROR, WARN, INFO, etc.)
- Also detect Android logcat style (E/, W/, I/, D/, V/)
- Filter prompt lines (PS C:\>, user@host:~$) to avoid noise in log view
- Use useAppStore.getState() inside event listeners to avoid stale closures
- Limit log buffer size (2000 entries) to prevent memory issues in long sessions
- Pause feature: snapshot current logs into a ref, display from ref while paused

## Shell Selector / Dropdown
- Tab bar `overflow-x: auto` clips absolutely-positioned dropdowns — use `createPortal` to render to `document.body`
- `position: fixed` + `getBoundingClientRect()` ensures dropdown appears at correct screen coordinates
- Always close portal menus on click-outside and Escape key

## Updater / Signing
- Minisign `.sig` files are two lines (untrusted comment + base64 signature)
- Embedding multiline strings in heredoc JSON breaks JSON syntax — use `jq` to properly escape
- `jq -n --arg` handles newlines and special chars automatically

## Ghost Window / Process Spawning
- Spawning `git` process on Windows can flash a console window even with CREATE_NO_WINDOW
- Read `.git/HEAD` file directly instead of spawning `git rev-parse` — zero process creation
- Walk parent directories to find `.git/HEAD` for repos where CWD is a subdirectory

## Debug Copilot / AI Analysis
- Two-layer error analysis: hardcoded regex patterns (fast) + AI via Ollama (deep) for unmatched errors
- collectUnmatchedErrors() groups similar errors by first 150 chars, returns top 20 with stable hash for AI caching
- Ollama AI responses may be wrapped in markdown code fences — always extract JSON from inside ```json...``` blocks
- Cache AI results by error hash to avoid re-analyzing the same error
- Check Ollama health (localhost:11434/api/tags) before offering AI features — graceful degradation if offline
- ai_chat Tauri command already existed — no Rust changes needed for AI integration
- sysinfo 0.30: Process::name() returns &str, so .to_string() works directly

## SFTP Transfer — Critical
- `transferring` state flag used as both UI indicator AND guard in useCallback creates a fatal bug
- If ANY error occurs before `setTransferring(false)` (e.g., `getInvoke()` throws), the flag stays `true` forever
- Once stuck, Download button is `disabled`, Upload button is `disabled`, drag & drop is rejected — NOTHING works
- Fix: use `useRef` for the guard (avoids stale closures) + `try-finally` to ALWAYS reset the flag
- Remove `transferring` from `useCallback` dependency arrays — the ref doesn't cause re-creation
- Also: Tauri sync commands block the main thread — make file transfer commands `async`

## Cross-Server Navigation
- Intercepting `cd server:/path` requires buffering terminal input (ptyInputBuffer) and checking pattern on Enter
- Must send Ctrl+U (\x15) to clear the shell's line buffer BEFORE intercepting, otherwise shell tries to execute the raw cd command
- Use a mutable ref object (`currentTermRef`) to track which session (PTY vs SSH) the terminal is currently bound to
- When switching servers: save current context to a stack, rebind event listeners, update sessionType
- Credentials resolution: sessionPassword → keychain → null (prompt needed)
- Tab title update with server name provides visual feedback of current context

## Infrastructure Monitor — Safety
- Never run `find -delete` or `rm` on production servers from a one-click button — always scan first, show results, then let the user decide in a terminal
- Kill PID must be two-step: enter PID → confirm with SIGTERM (graceful) vs SIGKILL (force) choice. Show process info (`ps -p PID`) before killing so the user can verify they have the right process
- `journalctl --vacuum-time=7d` is safer than `--vacuum-size=100M` — time-based retention is predictable and won't delete recent logs
- Log scan should show sizes + file counts so the user understands the impact before cleanup
- Always verify PID exists before sending signal (`ps -p PID && kill`) to give a clear error instead of silent failure

## Disk Analyzer (CCleaner-style)
- No new Rust commands needed — the existing `ssh_exec` command handles all disk scanning and cleanup
- A single combined shell script collects all disk categories in one SSH call (partitions + 9 categories + largest dirs) to avoid multiple connections
- `df -hT` gives filesystem type which is useful context (ext4, xfs, btrfs)
- Parse `journalctl --disk-usage` output carefully — it returns human-readable strings like "4.0G"
- Package cache location varies by distro: apt=/var/cache/apt/archives, yum=/var/cache/yum, dnf=/var/cache/dnf
- Every cleanup action needs a confirm step — even "safe" ones like vacuum-time can surprise users
- Auto-rescan after cleanup gives immediate visual feedback of reclaimed space
- Donut chart with SVG: strokeDasharray/strokeDashoffset is the trick, rotate -90deg to start from top
- `timeout 10s du -xmd1 /` prevents hangs on huge filesystems — -xdev prevents crossing mount boundaries
- `find /tmp -xdev -mtime +7` is critical — without -xdev, find can traverse NFS/bind mounts and hang
- Disk growth tracking: save previous scan's directory sizes in store, diff on rescan — catches runaway logs/docker
- Preview-before-clean flow: Inspect (read-only) → Review files → Confirm → Clean — builds user trust
- Multi-select batch cleanup: combine commands with && for atomicity, show total reclaimable in green summary bar
- Click-to-navigate: largest dirs are clickable, opens terminal at that exact path via cross-server nav

## Infrastructure Monitor
- SSH exec_command() creates a NEW connection each poll — no session reuse (simpler, no mutex contention with interactive sessions)
- Polling thread sleeps in small increments (100ms) to allow quick shutdown when `running` flag is set to false
- Anomaly detection: mean + 2σ over last 30 samples catches sudden spikes below fixed thresholds
- Cross-server correlation: if 2+ servers alert within 30 seconds, it suggests a systemic issue
- MetricsSnapshot fields use snake_case in Rust, camelCase in TypeScript — transform in the event listener
- Network I/O rate: calculate delta between consecutive snapshots divided by time interval

## SSH Performance — CRITICAL
- SSHPanel was calling `parseTerminalOutput()` SYNCHRONOUSLY on every SSH data event — this blocks the event handler and causes massive lag during rapid output
- TerminalPanel correctly uses `queueDebugParse()` with 200ms debounce — SSHPanel must do the same (separate buffer to avoid cross-contamination)
- The ssh2 `session.set_timeout(100)` already provides a 100ms wait on WouldBlock — adding `thread::sleep(10ms)` on top was redundant double-waiting
- Increasing SSH read buffer from 4KB to 16KB reduces the number of events emitted per second for bulk output (e.g., `cat` large files), directly reducing frontend re-renders
- String-based error matching (`e.to_string().contains("transport read")`) is fragile — prefer `e.kind()` for OS-level errors (ConnectionReset, BrokenPipe, ConnectionAborted) and only use string matching as fallback for ssh2-specific messages
- OS-level connection errors (ConnectionReset, BrokenPipe) should be immediately fatal — no point retrying, the TCP socket is dead

## SSH Batching — CRITICAL (v2.4.5)
- SSH reader thread was emitting one IPC event per `channel.read()` call — up to hundreds per second during fast output
- PTY already had a dual-thread (reader + flusher) pattern that batches data and emits on 50ms intervals
- Ported the same pattern to SSH: reader appends to shared `Arc<Mutex<String>>`, flusher emits on Condvar signal or 50ms timeout
- This reduces IPC events from ~100/sec to ~20/sec during bulk output, dramatically reducing frontend overhead
- `AtomicBool` is faster than `Mutex<bool>` for a simple running flag — no lock contention
- SSH write retry: 10 retries × 50ms sleep = 500ms worst case blocking on Tauri async thread. Reduced to 5 × 20ms = 100ms max
- StatusBar reactive selectors for `hackingAlerts.length` and filtered `infraAlerts` caused re-renders on EVERY alert change — replaced with 3s polling interval
- Config save at 500ms debounce fires too often when many state changes happen in sequence (e.g., terminal resize + history add + command count) — 2000ms is much safer
- Shell init delay of 2000ms for PowerShell was unnecessarily conservative — 800ms is sufficient, and bash 300ms is fine

## SSH Lock Elimination — CRITICAL (v2.4.7)
- Double lock per reader iteration (lock for writes, release, lock for reads) was the remaining bottleneck
- Fix: single lock scope — process writes, check EOF, read — all without releasing the Mutex
- This halves lock acquire/release overhead and eliminates the window where resize could interleave
- RwLock for ssh_sessions HashMap: ssh_write and ssh_resize only need read access (lookup), so they run concurrently
- Only ssh_connect and ssh_disconnect need write access (insert/remove) — very infrequent
- Session timeout must match flusher frequency: 20ms timeout + 16ms flusher = max ~36ms latency (was 50+50=100ms)
- UTF-8 fast path: std::str::from_utf8 is a simple validation pass (no allocation), only fallback to lossy on invalid bytes
- 99%+ of terminal output is valid UTF-8, so this eliminates almost all heap allocations in the read path

## SSH Write Queue Architecture — CRITICAL (v2.4.6)
- The #1 cause of SSH lag was lock contention: reader thread holds channel Mutex during blocking ch.read() (up to 100ms), and every keystroke IPC call also needed that same Mutex
- Fix: mpsc write queue — IPC just pushes Vec<u8> to queue (instant), reader thread drains queue before each read
- This means ALL channel I/O happens in a single thread — zero Mutex contention between IPC and reader
- The write() method went from "lock session + lock channel + retry + sleep + flush" to "mpsc send" — literally instant
- Resize still needs the Mutex (infrequent), but with session timeout reduced from 100ms to 50ms, contention window is halved
- Frontend buffered write queue further helps: batches rapid keystrokes into fewer IPC calls
- Combined with flusher at 16ms (60fps) instead of 50ms, SSH now feels as responsive as local PTY

## Windows / Antivirus
- Unsigned compiled `.exe` files in project root trigger Windows Defender false positives
- Add `*.exe`, `*.msi`, `*.dmg`, etc. to `.gitignore` to prevent accidental commits
- Advise users to add project directory to Windows Defender exclusions
