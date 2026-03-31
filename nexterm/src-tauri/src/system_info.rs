use serde::{Deserialize, Serialize};
use sysinfo::System;
use std::sync::atomic::{AtomicUsize, AtomicU32, Ordering};
use std::sync::OnceLock;
use std::time::{Instant, Duration};
use std::sync::Mutex;

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
// Debounce: minimum 2 seconds between CPU refreshes to get accurate deltas
static LAST_CPU_REFRESH: Mutex<Option<Instant>> = Mutex::new(None);
static CACHED_CPU_USAGE: AtomicU32 = AtomicU32::new(0);

const MIN_CPU_REFRESH_INTERVAL: Duration = Duration::from_secs(2);

/// Quick init: just capture CPU baseline without blocking.
/// The first real reading will come from get_stats() after the frontend polls.
pub fn init_system(sys: &mut System) {
    // Record initial CPU times — first call is just a baseline, not accurate yet.
    // The second call (from get_stats ~500ms later) will have a proper delta.
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    // Do NOT sleep here — it blocks the entire app startup.
    // Mark that we need a fresh read on first get_stats call.
    CACHED_CPU_USAGE.store(0f32.to_bits(), Ordering::Relaxed);
    // Leave LAST_CPU_REFRESH as None so the first get_stats always refreshes
}

pub fn get_stats(sys: &mut System) -> SystemStats {
    // Only refresh CPU if enough time has passed since last refresh
    // to avoid short deltas that produce inaccurate readings
    let should_refresh_cpu = {
        let mut last = LAST_CPU_REFRESH.lock().unwrap();
        match *last {
            Some(t) if t.elapsed() < MIN_CPU_REFRESH_INTERVAL => false,
            _ => {
                *last = Some(Instant::now());
                true
            }
        }
    };

    if should_refresh_cpu {
        sys.refresh_cpu_usage();
        let cpu = sys.global_cpu_info().cpu_usage();
        CACHED_CPU_USAGE.store(cpu.to_bits(), Ordering::Relaxed);
    }

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

    let cpu_raw = f32::from_bits(CACHED_CPU_USAGE.load(Ordering::Relaxed));
    let cpu_usage = if cpu_raw.is_finite() { cpu_raw } else { 0.0 };

    SystemStats {
        cpu_usage,
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

// Debounce process refresh: minimum 5 seconds between full enumerations
// refresh_processes() is extremely heavy on Windows (NtQuerySystemInformation)
static LAST_PROCESS_REFRESH: Mutex<Option<Instant>> = Mutex::new(None);
const MIN_PROCESS_REFRESH_INTERVAL: Duration = Duration::from_secs(5);

pub fn get_top_processes(sys: &mut System, limit: usize) -> Vec<ProcessInfo> {
    let should_refresh = {
        let mut last = LAST_PROCESS_REFRESH.lock().unwrap();
        match *last {
            Some(t) if t.elapsed() < MIN_PROCESS_REFRESH_INTERVAL => false,
            _ => {
                *last = Some(Instant::now());
                true
            }
        }
    };

    if should_refresh {
        sys.refresh_processes();
    }

    // Normalize per-process CPU by dividing by number of cores
    // sysinfo reports per-core (e.g. 800% on 8 cores), we want 0-100%
    let num_cpus = sys.cpus().len().max(1) as f32;

    let mut procs: Vec<ProcessInfo> = sys.processes()
        .values()
        .filter(|p| p.cpu_usage() > 0.0 || p.memory() > 0)
        .map(|p| ProcessInfo {
            pid: p.pid().as_u32(),
            name: p.name().to_string(),
            cpu_usage: p.cpu_usage() / num_cpus,
            memory_bytes: p.memory(),
        })
        .collect();

    procs.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
    procs.truncate(limit);
    procs
}
