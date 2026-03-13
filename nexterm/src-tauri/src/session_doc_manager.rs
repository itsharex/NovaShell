use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionDocInfo {
    pub filename: String,
    pub title: String,
    pub created: u64,
    pub size: u64,
}

pub struct SessionDocManager {
    doc_dir: std::path::PathBuf,
}

impl SessionDocManager {
    pub fn new() -> Self {
        let doc_dir = dirs::data_dir()
            .or_else(|| dirs::home_dir())
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("novashell")
            .join("session-docs");
        std::fs::create_dir_all(&doc_dir).ok();
        Self { doc_dir }
    }

    pub fn save_doc(&self, content: &str) -> Result<String, String> {
        let now = chrono_filename();
        let filename = format!("session_{}.md", now);
        let path = self.doc_dir.join(&filename);
        std::fs::write(&path, content).map_err(|e| format!("Write error: {}", e))?;
        Ok(filename)
    }

    pub fn list_docs(&self) -> Result<Vec<SessionDocInfo>, String> {
        let mut docs = Vec::new();
        let entries = std::fs::read_dir(&self.doc_dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".md") {
                continue;
            }
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            // Extract title from first line only (avoid reading entire file)
            let title = {
                use std::io::BufRead;
                std::fs::File::open(entry.path())
                    .ok()
                    .and_then(|f| {
                        let reader = std::io::BufReader::new(f);
                        reader.lines().take(5).flatten().find(|l| l.starts_with('#'))
                            .map(|l| l.trim_start_matches('#').trim().to_string())
                    })
                    .unwrap_or_else(|| name.clone())
            };

            let created = meta
                .created()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            docs.push(SessionDocInfo {
                filename: name,
                title,
                created,
                size: meta.len(),
            });
        }
        docs.sort_by(|a, b| b.created.cmp(&a.created));
        Ok(docs)
    }

    pub fn load_doc(&self, filename: &str) -> Result<String, String> {
        let path = self.doc_dir.join(filename);
        std::fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))
    }

    pub fn delete_doc(&self, filename: &str) -> Result<(), String> {
        let path = self.doc_dir.join(filename);
        std::fs::remove_file(&path).map_err(|e| format!("Delete error: {}", e))
    }
}

fn chrono_filename() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Simple timestamp-based filename
    format!("{}", secs)
}
