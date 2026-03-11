# NovaTerm - Lessons Learned

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
