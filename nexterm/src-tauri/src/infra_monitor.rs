use crate::ssh_manager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MetricsSnapshot {
    pub timestamp: u64,
    pub cpu: f64,
    pub mem_percent: f64,
    pub mem_used_mb: f64,
    pub mem_total_mb: f64,
    pub disk_percent: f64,
    pub net_rx_bytes: u64,
    pub net_tx_bytes: u64,
    pub load_avg: [f64; 3],
    pub top_processes: Vec<ProcessInfo>,
    pub failed_services: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProcessInfo {
    pub name: String,
    pub cpu: f64,
    pub mem: f64,
}

pub struct MonitoredServer {
    pub connection_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
    running: Arc<Mutex<bool>>,
    stop_signal: Arc<Condvar>,
    poll_thread: Option<JoinHandle<()>>,
}

impl Drop for MonitoredServer {
    fn drop(&mut self) {
        if let Ok(mut running) = self.running.lock() {
            *running = false;
        }
        self.stop_signal.notify_all(); // Wake the poll thread so it exits immediately
        if let Some(handle) = self.poll_thread.take() {
            let _ = handle.join();
        }
    }
}

const METRICS_SCRIPT: &str = r#"echo "===CPU===" && top -bn1 2>/dev/null | grep 'Cpu(s)' | awk '{printf "%.1f", $2+$4}' && echo "===MEM===" && free 2>/dev/null | awk '/Mem:/{printf "%.1f %d %d", $3/$2*100, $3/1024, $2/1024}' && echo "===DISK===" && df / 2>/dev/null | awk 'NR==2{gsub(/%/,"",$5); printf "%s %s %s", $5, $3, $2}' && echo "===NET===" && cat /proc/net/dev 2>/dev/null | awk 'NR>2{rx+=$2;tx+=$10} END{printf "%d %d", rx, tx}' && echo "===LOAD===" && cat /proc/loadavg 2>/dev/null | cut -d' ' -f1-3 && echo "===PROCS===" && ps aux --sort=-%cpu 2>/dev/null | awk 'NR>1&&NR<=6{printf "%s %.1f %.1f\n",$11,$3,$4}' && echo "===FAILED===" && systemctl list-units --state=failed --no-pager --no-legend 2>/dev/null | head -5"#;

fn parse_metrics(output: &str) -> MetricsSnapshot {
    let mut snapshot = MetricsSnapshot {
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        cpu: 0.0,
        mem_percent: 0.0,
        mem_used_mb: 0.0,
        mem_total_mb: 0.0,
        disk_percent: 0.0,
        net_rx_bytes: 0,
        net_tx_bytes: 0,
        load_avg: [0.0, 0.0, 0.0],
        top_processes: Vec::new(),
        failed_services: Vec::new(),
    };

    let mut section = "";
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("===") && trimmed.ends_with("===") {
            section = trimmed;
            continue;
        }
        if trimmed.is_empty() {
            continue;
        }

        match section {
            "===CPU===" => {
                snapshot.cpu = trimmed.parse().unwrap_or(0.0);
            }
            "===MEM===" => {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 3 {
                    snapshot.mem_percent = parts[0].parse().unwrap_or(0.0);
                    snapshot.mem_used_mb = parts[1].parse().unwrap_or(0.0);
                    snapshot.mem_total_mb = parts[2].parse().unwrap_or(0.0);
                }
            }
            "===DISK===" => {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if !parts.is_empty() {
                    snapshot.disk_percent = parts[0].parse().unwrap_or(0.0);
                }
            }
            "===NET===" => {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    snapshot.net_rx_bytes = parts[0].parse().unwrap_or(0);
                    snapshot.net_tx_bytes = parts[1].parse().unwrap_or(0);
                }
            }
            "===LOAD===" => {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 3 {
                    snapshot.load_avg = [
                        parts[0].parse().unwrap_or(0.0),
                        parts[1].parse().unwrap_or(0.0),
                        parts[2].parse().unwrap_or(0.0),
                    ];
                }
            }
            "===PROCS===" => {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 3 {
                    snapshot.top_processes.push(ProcessInfo {
                        name: parts[0].to_string(),
                        cpu: parts[1].parse().unwrap_or(0.0),
                        mem: parts[2].parse().unwrap_or(0.0),
                    });
                }
            }
            "===FAILED===" => {
                if !trimmed.is_empty() {
                    // Extract service name (first word)
                    let name = trimmed.split_whitespace().next().unwrap_or(trimmed);
                    snapshot.failed_services.push(name.to_string());
                }
            }
            _ => {}
        }
    }

    snapshot
}

impl MonitoredServer {
    pub fn start(
        connection_id: String,
        host: String,
        port: u16,
        username: String,
        password: Option<String>,
        private_key: Option<String>,
        interval_secs: u64,
        app_handle: tauri::AppHandle,
    ) -> Self {
        let running = Arc::new(Mutex::new(true));
        let stop_signal = Arc::new(Condvar::new());
        let running_clone = Arc::clone(&running);
        let stop_signal_clone = Arc::clone(&stop_signal);

        let h = host.clone();
        let u = username.clone();
        let p = password.clone();
        let pk = private_key.clone();
        let cid = connection_id.clone();
        let data_event = format!("infra-metrics-{}", connection_id);
        let error_event = format!("infra-error-{}", connection_id);

        let poll_thread = std::thread::spawn(move || {
            loop {
                // Check if still running
                if let Ok(r) = running_clone.lock() {
                    if !*r {
                        break;
                    }
                } else {
                    break;
                }

                // Execute metrics collection
                match ssh_manager::exec_command(
                    &h,
                    port,
                    &u,
                    p.as_deref(),
                    pk.as_deref(),
                    METRICS_SCRIPT,
                ) {
                    Ok((stdout, _)) => {
                        let snapshot = parse_metrics(&stdout);
                        let _ = app_handle.emit(&data_event, &snapshot);
                    }
                    Err(e) => {
                        let msg = format!("Monitor error for {}: {}", cid, e);
                        let _ = app_handle.emit(&error_event, msg);
                    }
                }

                // Sleep until next poll — uses Condvar for instant shutdown (zero CPU when idle)
                let guard = running_clone.lock().unwrap();
                let result = stop_signal_clone.wait_timeout(guard, std::time::Duration::from_secs(interval_secs)).unwrap();
                if !*result.0 {
                    return;
                }
            }
        });

        MonitoredServer {
            connection_id,
            host,
            port,
            username,
            password,
            private_key,
            running,
            stop_signal,
            poll_thread: Some(poll_thread),
        }
    }

    pub fn stop(&mut self) {
        if let Ok(mut running) = self.running.lock() {
            *running = false;
        }
        self.stop_signal.notify_all();
    }
}

/// State holder for all infrastructure monitors
pub struct InfraMonitors {
    pub monitors: HashMap<String, MonitoredServer>,
}

impl InfraMonitors {
    pub fn new() -> Self {
        InfraMonitors {
            monitors: HashMap::new(),
        }
    }
}
