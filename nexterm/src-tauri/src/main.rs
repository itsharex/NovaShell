#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty_manager;
mod system_info;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub sessions: Mutex<HashMap<String, pty_manager::PtySession>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ShellInfo {
    pub name: String,
    pub path: String,
    pub available: bool,
}

#[tauri::command]
fn get_available_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();

    #[cfg(target_os = "windows")]
    {
        shells.push(ShellInfo {
            name: "PowerShell".to_string(),
            path: "powershell.exe".to_string(),
            available: true,
        });
        shells.push(ShellInfo {
            name: "CMD".to_string(),
            path: "cmd.exe".to_string(),
            available: true,
        });
        if std::path::Path::new("C:\\Program Files\\Git\\bin\\bash.exe").exists() {
            shells.push(ShellInfo {
                name: "Git Bash".to_string(),
                path: "C:\\Program Files\\Git\\bin\\bash.exe".to_string(),
                available: true,
            });
        }
        if std::path::Path::new("C:\\Windows\\System32\\wsl.exe").exists() {
            shells.push(ShellInfo {
                name: "WSL".to_string(),
                path: "C:\\Windows\\System32\\wsl.exe".to_string(),
                available: true,
            });
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for (name, path) in [("Bash", "/bin/bash"), ("Zsh", "/bin/zsh"), ("Fish", "/usr/bin/fish")] {
            if std::path::Path::new(path).exists() {
                shells.push(ShellInfo {
                    name: name.to_string(),
                    path: path.to_string(),
                    available: true,
                });
            }
        }
    }

    shells
}

#[tauri::command]
async fn create_pty_session(
    shell_path: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let session = pty_manager::PtySession::new(&shell_path, &session_id, app_handle)
        .map_err(|e| e.to_string())?;

    state.sessions.lock()
        .map_err(|e| format!("Session lock error: {}", e))?
        .insert(session_id.clone(), session);
    Ok(session_id)
}

#[tauri::command]
fn write_to_pty(
    session_id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock()
        .map_err(|e| format!("Session lock error: {}", e))?;
    if let Some(session) = sessions.get(&session_id) {
        session.write(data.as_bytes()).map_err(|e| e.to_string())
    } else {
        Err(format!("Session '{}' not found", session_id))
    }
}

#[tauri::command]
fn resize_pty(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock()
        .map_err(|e| format!("Session lock error: {}", e))?;
    if let Some(session) = sessions.get(&session_id) {
        session.resize(cols, rows).map_err(|e| e.to_string())
    } else {
        Err(format!("Session '{}' not found", session_id))
    }
}

#[tauri::command]
fn close_pty_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock()
        .map_err(|e| format!("Session lock error: {}", e))?;
    if sessions.remove(&session_id).is_some() {
        Ok(())
    } else {
        Err(format!("Session '{}' not found", session_id))
    }
}

#[tauri::command]
fn get_system_info() -> system_info::SystemStats {
    system_info::get_stats()
}

#[tauri::command]
fn get_git_branch(path: Option<String>) -> Result<String, String> {
    let dir = path
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::home_dir())
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let output = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&dir)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("Not a git repository".to_string())
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: String,
}

#[tauri::command]
fn list_directory(path: Option<String>) -> Result<Vec<FileEntry>, String> {
    let dir = path
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::home_dir())
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let path = entry.path();

        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            extension: path.extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default(),
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
fn read_file_preview(path: String) -> Result<String, String> {
    let file_path = std::path::Path::new(&path);
    let metadata = std::fs::metadata(file_path).map_err(|e| e.to_string())?;

    if metadata.len() > 1_048_576 {
        return Err("File too large for preview (>1MB)".to_string());
    }

    std::fs::read_to_string(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_command_suggestions(prefix: String) -> Vec<String> {
    let mut suggestions = Vec::new();

    let common_commands = [
        "cd", "ls", "dir", "mkdir", "rmdir", "cp", "mv", "rm", "cat", "echo",
        "git status", "git add", "git commit", "git push", "git pull", "git log",
        "git branch", "git checkout", "git merge", "git diff", "git clone",
        "npm install", "npm run", "npm start", "npm test", "npm build",
        "docker ps", "docker images", "docker run", "docker build", "docker compose",
        "cargo build", "cargo run", "cargo test", "cargo check",
        "python", "python3", "pip install", "node", "npx",
        "kubectl get pods", "kubectl get services", "kubectl apply",
        "ssh", "scp", "curl", "wget", "ping", "tracert", "ipconfig", "netstat",
        "code", "notepad", "explorer", "tasklist", "taskkill",
        "cls", "clear", "exit", "history", "whoami", "hostname",
    ];

    let prefix_lower = prefix.to_lowercase();
    for cmd in &common_commands {
        if cmd.to_lowercase().starts_with(&prefix_lower) {
            suggestions.push(cmd.to_string());
        }
    }

    if let Ok(path_var) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(separator) {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let name_lower = name.to_lowercase();
                    if name_lower.starts_with(&prefix_lower) && suggestions.len() < 20 {
                        let clean_name = if cfg!(windows) {
                            name.strip_suffix(".exe")
                                .or_else(|| name.strip_suffix(".cmd"))
                                .or_else(|| name.strip_suffix(".bat"))
                                .unwrap_or(&name)
                                .to_string()
                        } else {
                            name.clone()
                        };
                        if !suggestions.contains(&clean_name) {
                            suggestions.push(clean_name);
                        }
                    }
                }
            }
        }
    }

    suggestions.sort();
    suggestions.truncate(15);
    suggestions
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            sessions: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_available_shells,
            create_pty_session,
            write_to_pty,
            resize_pty,
            close_pty_session,
            get_system_info,
            get_git_branch,
            list_directory,
            read_file_preview,
            get_command_suggestions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NovaTerm");
}
