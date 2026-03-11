use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: u64,
    pub level: String,
    pub message: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LogSessionInfo {
    pub filename: String,
    pub created: u64,
    pub size: u64,
    pub entry_count: usize,
}

pub struct LogManager {
    log_dir: PathBuf,
    current_file: Option<PathBuf>,
    retention_days: u64,
}

impl LogManager {
    pub fn new() -> Self {
        let log_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("novaterm")
            .join("logs");

        // Create directory if it doesn't exist
        let _ = fs::create_dir_all(&log_dir);

        // Create session log file
        let now = chrono_filename();
        let current_file = log_dir.join(format!("{}.jsonl", now));

        LogManager {
            log_dir,
            current_file: Some(current_file),
            retention_days: 7,
        }
    }

    pub fn append_log(&self, entry: &LogEntry) -> Result<(), String> {
        let file_path = self.current_file.as_ref()
            .ok_or_else(|| "No active log file".to_string())?;

        let mut line = serde_json::to_string(entry)
            .map_err(|e| format!("Serialize error: {}", e))?;
        line.push('\n');

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file_path)
            .map_err(|e| format!("File open error: {}", e))?;

        file.write_all(line.as_bytes())
            .map_err(|e| format!("Write error: {}", e))
    }

    pub fn append_batch(&self, entries: &[LogEntry]) -> Result<(), String> {
        if entries.is_empty() {
            return Ok(());
        }

        let file_path = self.current_file.as_ref()
            .ok_or_else(|| "No active log file".to_string())?;

        let mut data = String::new();
        for entry in entries {
            let line = serde_json::to_string(entry)
                .map_err(|e| format!("Serialize error: {}", e))?;
            data.push_str(&line);
            data.push('\n');
        }

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file_path)
            .map_err(|e| format!("File open error: {}", e))?;

        file.write_all(data.as_bytes())
            .map_err(|e| format!("Write error: {}", e))
    }

    pub fn list_sessions(&self) -> Result<Vec<LogSessionInfo>, String> {
        let mut sessions = Vec::new();

        let entries = fs::read_dir(&self.log_dir)
            .map_err(|e| format!("Read dir error: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(true, |ext| ext != "jsonl") {
                continue;
            }

            let metadata = fs::metadata(&path)
                .map_err(|e| format!("Metadata error: {}", e))?;

            let filename = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Count lines
            let content = fs::read_to_string(&path).unwrap_or_default();
            let entry_count = content.lines().filter(|l| !l.trim().is_empty()).count();

            let created = metadata.created()
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64)
                .unwrap_or(0);

            sessions.push(LogSessionInfo {
                filename,
                created,
                size: metadata.len(),
                entry_count,
            });
        }

        sessions.sort_by(|a, b| b.created.cmp(&a.created));
        Ok(sessions)
    }

    pub fn load_session(&self, filename: &str) -> Result<Vec<LogEntry>, String> {
        // Validate filename to prevent path traversal
        if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
            return Err("Invalid filename".to_string());
        }

        let path = self.log_dir.join(filename);
        if !path.exists() {
            return Err("File not found".to_string());
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Read error: {}", e))?;

        let mut entries = Vec::new();
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(entry) = serde_json::from_str::<LogEntry>(trimmed) {
                entries.push(entry);
            }
        }

        Ok(entries)
    }

    pub fn cleanup_old(&self) -> Result<u32, String> {
        let cutoff = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            - (self.retention_days * 86400);

        let mut deleted = 0u32;

        let entries = fs::read_dir(&self.log_dir)
            .map_err(|e| format!("Read dir error: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(true, |ext| ext != "jsonl") {
                continue;
            }

            // Don't delete current session file
            if let Some(ref current) = self.current_file {
                if path == *current {
                    continue;
                }
            }

            if let Ok(metadata) = fs::metadata(&path) {
                let created = metadata.created()
                    .or_else(|_| metadata.modified())
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
                    .unwrap_or(0);

                if created < cutoff {
                    if fs::remove_file(&path).is_ok() {
                        deleted += 1;
                    }
                }
            }
        }

        Ok(deleted)
    }

    pub fn delete_session(&self, filename: &str) -> Result<(), String> {
        if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
            return Err("Invalid filename".to_string());
        }

        let path = self.log_dir.join(filename);

        // Don't allow deleting current session
        if let Some(ref current) = self.current_file {
            if path == *current {
                return Err("Cannot delete active session log".to_string());
            }
        }

        fs::remove_file(&path).map_err(|e| format!("Delete error: {}", e))
    }

    pub fn set_retention_days(&mut self, days: u64) {
        self.retention_days = days;
    }

    pub fn get_log_dir(&self) -> String {
        self.log_dir.to_string_lossy().to_string()
    }
}

fn chrono_filename() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();

    // Convert to date-time parts manually (UTC)
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Simple date calculation from days since epoch
    let mut y = 1970i64;
    let mut remaining_days = days as i64;

    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        y += 1;
    }

    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut m = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if remaining_days < md {
            m = i;
            break;
        }
        remaining_days -= md;
    }

    format!(
        "{:04}-{:02}-{:02}_{:02}-{:02}-{:02}",
        y,
        m + 1,
        remaining_days + 1,
        hours,
        minutes,
        seconds
    )
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
