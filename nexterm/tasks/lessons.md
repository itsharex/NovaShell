# NovaTerm - Lessons Learned

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
