# NovaShell User Guide

## Version 1.7.0

---

# Table of Contents

1. [Getting Started](#1-getting-started)
2. [Terminal Basics](#2-terminal-basics)
3. [SSH Connections](#3-ssh-connections)
4. [Cross-Server Navigation](#4-cross-server-navigation)
5. [SFTP File Transfer](#5-sftp-file-transfer)
6. [Infrastructure Monitor](#6-infrastructure-monitor)
7. [Disk Analyzer](#7-disk-analyzer)
8. [Debug Console](#8-debug-console)
9. [AI Assistant](#9-ai-assistant)
10. [Hacking Mode](#10-hacking-mode)
11. [Keyboard Shortcuts](#11-keyboard-shortcuts)
12. [Troubleshooting](#12-troubleshooting)

---

# 1. Getting Started

## Installation

### Windows
1. Download `NovaShell_x.x.x_x64-setup.exe` from the [Releases page](https://github.com/FomoDonkey/NovaShell/releases)
2. Run the installer and follow the wizard
3. Launch NovaShell from the Desktop shortcut or Start Menu

### macOS
1. Download the `.dmg` file from Releases
2. Open the `.dmg` and drag NovaShell to Applications
3. If blocked: run `xattr -cr /Applications/NovaShell.app` in Terminal

### Linux
1. Download `.AppImage`, `.deb`, or `.rpm` from Releases
2. For AppImage: `chmod +x NovaShell_*.AppImage && ./NovaShell_*.AppImage`
3. For deb: `sudo dpkg -i NovaShell_*_amd64.deb`

## Interface Overview

When you first open NovaShell, you'll see:

```
+--------------------------------------------------+
|  [Title Bar]  NovaShell    [Theme dots] [_][x]    |
+--------------------------------------------------+
|  [Tab Bar]  Terminal 1  | Terminal 2  | [+]       |
+--------+-----------------------------------------+
|        |                                          |
| Sidebar|           Terminal Area                   |
| [icons]|                                          |
|        |  user@machine:~$                         |
|        |                                          |
+--------+-----------------------------------------+
|  [Status Bar]  Ready | PowerShell | main | 14:30  |
+--------------------------------------------------+
```

**Key Areas:**
- **Title Bar** — Theme selector (colored dots), window controls
- **Tab Bar** — Multiple terminal tabs, shell selector dropdown (+)
- **Sidebar** — 15 tool panels (click icons to switch)
- **Terminal** — Main terminal with full shell access
- **Status Bar** — Shell type, git branch, server location, clock

---

# 2. Terminal Basics

## Opening Tabs
- Click the **+** button in the tab bar to add a new terminal
- Click the dropdown arrow next to + to select a specific shell (PowerShell, CMD, Git Bash, WSL, etc.)

## Split Panes
- Click the split button in the status bar (bottom right) to cycle through:
  - **No Split** — Single terminal
  - **Vertical Split** — Side by side
  - **Horizontal Split** — Top and bottom

## Command Autocomplete
- Start typing a command (at least 2 characters)
- Suggestions appear automatically
- Press **Tab** to accept the highlighted suggestion
- Press **Up/Down** arrows to navigate suggestions

## Search
- Press **Ctrl+F** to open the search overlay
- Type your search term and press Enter to find next
- Use the arrow buttons to navigate matches

## Copy & Paste
- **Copy**: Select text with mouse, then Ctrl+C (or Ctrl+Shift+C)
- **Paste**: Ctrl+V (or Ctrl+Shift+V)
- **Right-click**: Copy if text selected, paste if not

## Focus Mode
- Click the focus mode button in the title bar to hide all UI chrome
- Only the terminal remains visible
- Click again to restore the full interface

---

# 3. SSH Connections

## Adding a Connection

1. Click the **SSH** icon in the sidebar (monitor icon)
2. Click **Add Connection**
3. Fill in the details:
   - **Name** — Friendly name (e.g., "Web Server")
   - **Host** — IP address or hostname
   - **Port** — Default: 22
   - **Username** — SSH username
   - **Auth Method** — Password or Private Key
4. Click **Test** to verify the connection works
5. Click **Save**

## Connecting

1. Click **Connect** on any saved connection
2. If password is needed and not saved:
   - Choose: **Save to Keychain** (permanent), **Remember for Session** (until app closes), or **Don't Save**
   - Enter your password
3. The SSH terminal opens with full xterm.js emulation

## Password Storage Options
- **System Keychain** — Uses Windows Credential Manager, macOS Keychain, or Linux Secret Service. Persists across app restarts.
- **Session Memory** — Stored in RAM only. Gone when app closes. Never touches disk.
- **Don't Save** — Must enter password every time you connect.

---

# 4. Cross-Server Navigation

This is one of NovaShell's most powerful features. Navigate between SSH servers as if they were directories.

## Prerequisites
- Have at least one SSH connection configured in the SSH panel
- The connection must have credentials available (keychain, session password, or private key)

## Basic Usage

### Colon Syntax
```bash
# Jump to a server
cd webserver:/var/www

# Navigate to a specific directory on another server
cd dbserver:/home/admin

# Return to your local machine
cd local:~
```

### Filesystem Syntax
```bash
# Same thing, different style
cd /servers/webserver/var/www

# List all available servers with their status
ls /servers
```

### Output of `ls /servers`
```
/servers — NovaShell Virtual Server Filesystem

  local/              <- your machine
  webserver           connected  admin@192.168.1.10:22
  dbserver            disconnected  root@10.0.0.5:22
  staging             connected  deploy@staging.example.com:22

Usage:  cd /servers/webserver/var/www
        cd webserver:/var/www
        cd local:~
```

## Multi-Hop Navigation

You can chain server jumps:
```bash
user@local:~$ cd webserver:/var/www
[NovaShell] Connecting to webserver (192.168.1.10)...
[NovaShell] Connected! Navigating to /var/www

user@webserver:/var/www$ cd dbserver:/home
[NovaShell] Connecting to dbserver (10.0.0.5)...
[NovaShell] Connected! Navigating to /home

user@dbserver:/home$ cd local:~
[NovaShell] Returning to local machine...
user@local:~$
```

## StatusBar Breadcrumb

When navigating servers, the status bar shows your location:
```
[Server icon]  webserver  192.168.1.10  [local -> webserver]
```

## Server Name Resolution

NovaShell matches server names by:
1. **Connection name** (case-insensitive) — e.g., "webserver", "WebServer"
2. **Host/IP** — e.g., "192.168.1.10"
3. **Connection ID** — Internal UUID

---

# 5. SFTP File Transfer

## Starting a Transfer

1. Click the **SFTP** icon in the sidebar
2. Select an SSH connection from the dropdown
3. Click **Connect**
4. Browse the dual-panel file browser:
   - **Left** — Local filesystem
   - **Right** — Remote filesystem

## Transferring Files

- **Download**: Select files on the right (remote), click Download
- **Upload**: Select files on the left (local), click Upload
- Transfer progress appears in the transfer log at the bottom

## File Management

On the remote server, you can:
- **Create folders** — Right-click > New Folder
- **Rename** — Right-click > Rename
- **Delete** — Right-click > Delete
- **Preview** — Click a text file to preview its contents (up to 1 MB)

---

# 6. Infrastructure Monitor

Real-time monitoring dashboard for all your SSH servers.

## Opening the Monitor

1. Click the **Infra Monitor** icon in the sidebar (gauge icon, last in the list)
2. You'll see 5 tabs: **Overview**, **Timeline**, **Alerts**, **Disk**, **Settings**

## Starting Monitoring

1. Make sure servers are connected via the SSH panel
2. In the Overview tab, click the **Play** button on a server card
3. Metrics start updating every 10 seconds (configurable)

## Understanding the Dashboard

### Server Cards
Each connected server shows:
```
+-- webserver -------- Score: 87 ----------+
| CPU ########-- 78%  MEM ######-- 62%     |
| DSK #####----- 45%  NET up12MB dn4MB     |
| Load: 2.1 1.8 1.5                        |
| [CPU sparkline ~~~~~~~~~~~]              |
| [MEM sparkline ~~~~~~~~~~~]              |
| Top: nginx 12% | postgres 8%            |
+------------------------------------------+
```

- **Health Score** — 0-100 (green >70, yellow >40, red <40)
- **Metric Bars** — Color-coded by threshold (green/yellow/red)
- **Sparklines** — 60-point trend charts for CPU and Memory
- **Network Rate** — Calculated from consecutive snapshots (bytes/sec)

### Compact Mode
Click the layout toggle button (top right) to switch to one-line-per-server view:
```
webserver   87  [|||] [|||] [||]  [Stop]
dbserver    41  [|||] [|||] [||]  [Stop]
```

## Control Center Actions

Click a server card to expand the action panel:

### When CPU is High
- **Show Processes** — Lists top 20 processes by CPU usage
- **Kill PID** — Enter a PID, then choose:
  - **SIGTERM** — Graceful shutdown (process can save state)
  - **SIGKILL** — Immediate termination (cannot be caught)
  - **Cancel** — Abort
- **Open Terminal** — Jump to the server via cross-server navigation

### When Disk is High
- **Analyze Disk** — Opens the Disk Analyzer tab for deep analysis
- **Scan Large Files** — Finds files >100MB and largest directories
- **Scan Old Logs** — Shows rotated log files and their sizes

### When Services Fail
- **Restart [service]** — Runs `systemctl restart`
- **Show All Failed** — Lists all failed systemd units

## Alerts

The Alerts tab shows threshold violations:
- **Warning** (yellow) — Metric above warning threshold (default 80%)
- **Critical** (red) — Metric above critical threshold (default 95%)
- Click the checkmark to acknowledge an alert
- Alerts deduplicate: same metric/server won't re-alert within 60 seconds

## Timeline

Chronological log of everything:
```
Today
  14:32  webserver  CPU at 92.3%
  14:33  webserver  Executed: top on webserver
  14:35  dbserver   Started monitoring dbserver
  14:38  webserver  Cleaned: System Logs
```

## Settings

- **Polling Interval** — How often to collect metrics (5s, 10s, 15s, 30s, 60s)
- **Alert Thresholds** — Customize warning/critical levels for CPU, Memory, Disk

---

# 7. Disk Analyzer

A CCleaner-style disk management tool built into the Infra Monitor.

## Running a Scan

1. Go to **Infra Monitor > Disk** tab
2. Click a server name button to start scanning
3. Wait for the analysis to complete (usually 5-15 seconds)

## Understanding the Results

### Partitions
Each partition shows:
- **Donut chart** — Visual usage percentage
- **Progress bar** — With gradient coloring (green/yellow/red)
- **Details** — Used, Free, Total, device name, filesystem type

### Largest Directories
```
/var/lib/docker  ################  12.4 GB  +2.3 GB
/var/log         #############     8.1 GB
/home            ########          6.2 GB
/usr             ######            4.8 GB
```
- Bars show relative size
- **Red delta** (+2.3 GB) appears when a directory grew significantly since last scan
- **Click any directory** to open a terminal at that path

### Disk Growth Alerts
If any directory grew >500MB since the last scan, a red alert appears:
```
[!] Disk Growth Detected
/var/log     +2.3 GB
/tmp         +800 MB
vs scan at 14:32
```

## Cleanup Categories

Each category can be expanded to show actions:

| Category | What it scans | Safe to clean? |
|----------|--------------|----------------|
| System Logs | Rotated files (.gz, .old, .1) older than 7 days | Yes |
| Systemd Journal | Journal logs older than 7 days | Yes |
| System Cache | /var/cache contents | Inspect first |
| Package Cache | apt/yum/dnf downloaded packages | Yes |
| Temporary Files | /tmp + /var/tmp files older than 7 days | Yes |
| Docker | Unused containers, networks, images | Yes (prune) |
| Core Dumps | Crash dumps from failed processes | Yes |
| Snap Packages | /var/lib/snapd/snaps | Manual only |

## Cleanup Workflow

The safe 3-step workflow:

### Step 1: Inspect
Click **Inspect** on a category to see exactly which files will be affected:
```
Preview: System Logs
  2.1M  /var/log/syslog.3.gz
  1.8M  /var/log/auth.log.2.gz
  1.2M  /var/log/kern.log.1
  ...
```

### Step 2: Review
Each category also has contextual actions:
- **View files** — List directory contents
- **Tail syslog** — See recent log entries
- **Show errors** — Recent journal errors
- **Docker images/volumes** — Docker-specific views

### Step 3: Clean
Click **Clean**, then **Confirm Clean** to execute. The cleanup:
- Only deletes files matching safe criteria (rotated, >7 days old)
- Shows the command output so you see what was done
- Auto-rescans to show updated disk usage

## Multi-Select Cleanup

1. Check the boxes next to categories you want to clean
2. A green summary bar appears at the bottom:
   ```
   3 selected -- ~8.3 GB
   Logs, Docker, Temp Files    [Clean Selected]
   ```
3. Click **Clean Selected** to batch-clean all checked categories

---

# 8. Debug Console

## Opening
Click the **Debug** icon in the sidebar (bug icon).

## Features
- **Level Filters** — Toggle: Error, Warn, Info, Debug, Trace, Output
- **Source Filter** — Filter by terminal tab or SSH connection
- **Search** — Full-text search across all log entries
- **Pause/Resume** — Freeze the log view while still collecting
- **Export** — Save logs to a file
- **Persistence** — Logs saved to JSONL files with 7-day auto-cleanup

---

# 9. AI Assistant

## Prerequisites
- Install [Ollama](https://ollama.ai) on your local machine
- Pull a model: `ollama pull llama3.2`

## Using the AI
1. Click the **AI** icon in the sidebar (sparkles icon)
2. Select a model from the dropdown
3. Choose a mode:
   - **Chat** — General conversation
   - **Explain** — Explain code or errors
   - **Generate** — Generate shell commands
   - **Fix** — Fix error messages
4. Type your message and press Enter

---

# 10. Hacking Mode

## Activating
Click the **shield** icon in the title bar or sidebar. This:
- Switches to the matrix-green "hacking" theme
- Opens the Hacking panel
- Starts the security monitor

## Tools Available
- **Recon** — Port scanning, banner grabbing, environment detection
- **Exploits** — Curated pentest script database
- **AI Copilot** — Security-focused AI analysis
- **Tools** — Hash calculator, Base64/URL/Hex encoder-decoder, reverse shell generator
- **History** — Encrypted session save/load
- **Alerts** — Real-time security event monitoring

## Deactivating
Click the shield icon again to restore your previous theme.

---

# 11. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+F | Search in terminal |
| Ctrl+C | Copy (with selection) / SIGINT (without) |
| Ctrl+V | Paste from clipboard |
| Ctrl+Shift+C | Copy (alternative) |
| Ctrl+Shift+V | Paste (alternative) |
| Tab | Accept autocomplete suggestion |
| Right-click | Copy if selected, paste if not |

---

# 12. Troubleshooting

## SSH Connection Fails
- Verify the server is reachable: `ping hostname`
- Check port 22 is open: `telnet hostname 22`
- Try **Test Connection** in the SSH panel before connecting
- Check authentication method (password vs key)

## Terminal Looks Wrong
- Try switching themes (colored dots in title bar)
- If text is garbled, the shell may not support the terminal type — try a different shell

## Infra Monitor Shows No Data
- Ensure the SSH connection is active (green status in SSH panel)
- The remote server must have standard Linux tools: `top`, `free`, `df`, `ps`
- Check the Timeline tab for error messages

## Disk Analyzer Scan Hangs
- Scans use `timeout` to prevent hangs (10s for `du`, 5s for `find`)
- On very large filesystems, the scan may return partial data
- Use the **Rescan** button to retry

## Auto-Update Not Working
- Check your internet connection
- Verify you have write permissions to the installation directory
- Download manually from the Releases page

---

*NovaShell v1.7.0 - Built with Tauri v2 + React + TypeScript*
*https://github.com/FomoDonkey/NovaShell*
