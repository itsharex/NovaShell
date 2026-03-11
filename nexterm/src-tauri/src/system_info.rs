use serde::{Deserialize, Serialize};
use sysinfo::System;

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

pub fn get_stats() -> SystemStats {
    let mut sys = System::new_all();
    sys.refresh_all();

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
        processes_count: sys.processes().len(),
        hostname: System::host_name().unwrap_or_default(),
        os_name: System::long_os_version().unwrap_or_default(),
        uptime: System::uptime(),
    }
}
