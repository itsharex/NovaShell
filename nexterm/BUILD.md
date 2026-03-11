# NovaTerm - Build & Packaging Guide

## Prerequisites

### All Platforms
- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.70
- npm (comes with Node.js)

### Windows
- Visual Studio Build Tools 2022 (C++ workload)
- WebView2 (pre-installed on Windows 10/11)
- NSIS >= 3.08 (auto-downloaded by Tauri if missing)

### macOS
- Xcode Command Line Tools: `xcode-select --install`
- For universal builds: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`

### Linux
```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  patchelf

# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget \
  libappindicator-gtk3-devel librsvg2-devel patchelf
```

---

## Quick Build

```bash
# 1. Install dependencies
cd nexterm
npm install

# 2. Build for current platform
npm run tauri:build
```

The installer will be at: `src-tauri/target/release/bundle/`

---

## Platform-Specific Builds

### Windows (.exe installer + .msi)

```bash
npm run tauri:build:windows
```

**Output:**
- `src-tauri/target/release/bundle/nsis/NovaTerm_1.0.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/NovaTerm_1.0.0_x64_en-US.msi`

The NSIS installer includes:
- Installation folder selection
- Desktop shortcut creation
- Start menu entry
- "Open NovaTerm here" context menu entry
- Language selector (English/Spanish)
- Uninstaller with full cleanup

### macOS (.dmg + .app)

```bash
# Intel Mac
npm run tauri:build:mac

# Apple Silicon (M1/M2/M3)
npm run tauri:build:mac-arm

# Universal binary (both architectures)
npm run tauri build -- --target universal-apple-darwin
```

**Output:**
- `src-tauri/target/release/bundle/dmg/NovaTerm_1.0.0_x64.dmg`
- `src-tauri/target/release/bundle/macos/NovaTerm.app`

### Linux (.deb + .rpm + .AppImage)

```bash
npm run tauri:build:linux
```

**Output:**
- `src-tauri/target/release/bundle/deb/novaterm_1.0.0_amd64.deb`
- `src-tauri/target/release/bundle/rpm/novaterm-1.0.0-1.x86_64.rpm`
- `src-tauri/target/release/bundle/appimage/novaterm_1.0.0_amd64.AppImage`

---

## Custom Icons

To use your own icon:

```bash
# Place a 1024x1024 PNG with transparency at src-tauri/icons/
npx @tauri-apps/cli icon path/to/your-icon.png
```

Or use the built-in generator:

```bash
npm run icons:generate              # Generate default NovaTerm icon
npm run icons:generate my-icon.png  # Use custom source (needs: npm i -D sharp)
```

---

## Debug Build

```bash
npm run tauri:build:debug
```

Produces a debug build with dev tools enabled and source maps.

---

## Auto-Update Setup (Optional)

1. Generate signing keys:
   ```bash
   npx @tauri-apps/cli signer generate -w ~/.tauri/novaterm.key
   ```

2. Set environment variables:
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/novaterm.key)
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"
   ```

3. Update `src-tauri/tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "active": true,
       "dialog": true,
       "pubkey": "YOUR_PUBLIC_KEY_HERE",
       "endpoints": [
         "https://your-server.com/updates/{{target}}/{{arch}}/{{current_version}}"
       ]
     }
   }
   ```

4. Build with signing:
   ```bash
   npm run tauri:build
   ```

---

## Build Optimization

The release build is already optimized with:

- **LTO** (Link-Time Optimization): Smaller, faster binary
- **codegen-units = 1**: Better optimization at cost of compile time
- **opt-level = "s"**: Optimize for size
- **strip = true**: Remove debug symbols
- **panic = "abort"**: Smaller binary (no unwind tables)
- **esbuild minification**: Frontend assets minified
- **Local fonts**: JetBrains Mono bundled (no internet needed)

Typical installer sizes:
- Windows NSIS: ~8-12 MB
- macOS DMG: ~10-15 MB
- Linux AppImage: ~15-20 MB
- Linux .deb: ~8-12 MB

---

## Troubleshooting

### Windows: "WebView2 not found"
The installer includes a WebView2 bootstrapper. If offline, download WebView2
from Microsoft and install before running NovaTerm.

### macOS: "App is damaged"
Run: `xattr -cr /Applications/NovaTerm.app`

### Linux: AppImage won't start
```bash
chmod +x NovaTerm_1.0.0_amd64.AppImage
./NovaTerm_1.0.0_amd64.AppImage
```

### Build fails with Cargo errors
```bash
cd src-tauri && cargo clean && cd ..
npm run tauri:build
```
