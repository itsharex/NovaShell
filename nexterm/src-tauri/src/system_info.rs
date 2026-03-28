use serde::{Deserialize, Serialize};
use sysinfo::System;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;

#[derive(Serialize, Deserialize, Clone)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub memory_percent: f32,
    pub processes_count: usize,
    pub hostname: String,
    pub os_name: String,
    pub uptime: u64,
}

// Refresh process count only every 30th call (~30 min at 60s intervals)
// to avoid the heavy enumerate-all-processes syscall on every poll
static CALL_COUNTER: AtomicUsize = AtomicUsize::new(0);
static CACHED_PROCESS_COUNT: AtomicUsize = AtomicUsize::new(0);
// Cache static system properties — they never change at runtime
static CACHED_HOSTNAME: OnceLock<String> = OnceLock::new();
static CACHED_OS_NAME: OnceLock<String> = OnceLock::new();

pub fn get_stats(sys: &mut System) -> SystemStats {
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let count = CALL_COUNTER.fetch_add(1, Ordering::Relaxed);
    let processes_count = if count % 30 == 0 {
        sys.refresh_processes();
        let n = sys.processes().len();
        CACHED_PROCESS_COUNT.store(n, Ordering::Relaxed);
        n
    } else {
        CACHED_PROCESS_COUNT.load(Ordering::Relaxed)
    };

    let memory_used = sys.used_memory();
    let memory_total = sys.total_memory();

    SystemStats {
        cpu_usage: sys.global_cpu_info().cpu_usage(),
        memory_used,
        memory_total,
        memory_percent: if memory_total > 0 {
            (memory_used as f32 / memory_total as f32) * 100.0
        } else {
            0.0
        },
        processes_count,
        hostname: CACHED_HOSTNAME.get_or_init(|| System::host_name().unwrap_or_default()).clone(),
        os_name: CACHED_OS_NAME.get_or_init(|| System::long_os_version().unwrap_or_default()).clone(),
        uptime: System::uptime(),
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_bytes: u64,
}

pub fn get_top_processes(sys: &mut System, limit: usize) -> Vec<ProcessInfo> {
    sys.refresh_processes();

    let mut procs: Vec<ProcessInfo> = sys.processes()
        .values()
        .filter(|p| p.cpu_usage() > 0.0 || p.memory() > 0)
        .map(|p| ProcessInfo {
            pid: p.pid().as_u32(),
            name: p.name().to_string(),
            cpu_usage: p.cpu_usage(),
            memory_bytes: p.memory(),
        })
        .collect();

    procs.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
    procs.truncate(limit);
    procs
}
