use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone)]
pub struct EnvironmentInfo {
    pub env_type: String,  // "local" | "docker" | "wsl" | "vm" | "ssh"
    pub os: String,
    pub hostname: String,
    pub ip: String,
    pub vulnerability_hints: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PortScanResult {
    pub port: u16,
    pub protocol: String,
    pub service: String,
    pub version: String,
    pub state: String, // "open" | "closed" | "filtered"
    pub risk: String,  // "low" | "medium" | "high" | "critical"
}

// Well-known ports and their services
const COMMON_PORTS: &[(u16, &str, &str)] = &[
    (21, "FTP", "high"),
    (22, "SSH", "medium"),
    (23, "Telnet", "critical"),
    (25, "SMTP", "medium"),
    (53, "DNS", "low"),
    (80, "HTTP", "low"),
    (110, "POP3", "medium"),
    (135, "MSRPC", "high"),
    (139, "NetBIOS", "high"),
    (143, "IMAP", "medium"),
    (443, "HTTPS", "low"),
    (445, "SMB", "high"),
    (993, "IMAPS", "low"),
    (995, "POP3S", "low"),
    (1433, "MSSQL", "critical"),
    (1521, "Oracle", "critical"),
    (3306, "MySQL", "high"),
    (3389, "RDP", "high"),
    (5432, "PostgreSQL", "high"),
    (5900, "VNC", "critical"),
    (6379, "Redis", "critical"),
    (8080, "HTTP-Alt", "medium"),
    (8443, "HTTPS-Alt", "low"),
    (9200, "Elasticsearch", "high"),
    (27017, "MongoDB", "critical"),
];

pub fn detect_environment() -> EnvironmentInfo {
    let mut env_type = "local".to_string();
    let mut hints = Vec::new();
    let hostname = sysinfo::System::host_name().unwrap_or_else(|| "unknown".to_string());
    let os = sysinfo::System::long_os_version().unwrap_or_else(|| "unknown".to_string());

    // Detect Docker
    #[cfg(not(target_os = "windows"))]
    {
        if std::path::Path::new("/.dockerenv").exists() {
            env_type = "docker".to_string();
            hints.push("Running inside Docker container".to_string());
        } else if let Ok(cgroup) = std::fs::read_to_string("/proc/1/cgroup") {
            if cgroup.contains("docker") || cgroup.contains("containerd") {
                env_type = "docker".to_string();
                hints.push("Running inside Docker container (cgroup detected)".to_string());
            }
        }
    }

    // Detect WSL
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(version) = std::fs::read_to_string("/proc/version") {
            if version.to_lowercase().contains("microsoft") || version.to_lowercase().contains("wsl") {
                env_type = "wsl".to_string();
                hints.push("Running inside Windows Subsystem for Linux".to_string());
            }
        }
    }

    // Detect WSL from Windows side
    #[cfg(target_os = "windows")]
    {
        if std::env::var("WSL_DISTRO_NAME").is_ok() {
            env_type = "wsl".to_string();
            hints.push("WSL distribution detected".to_string());
        }
    }

    // Detect SSH session
    if std::env::var("SSH_CONNECTION").is_ok() || std::env::var("SSH_CLIENT").is_ok() {
        env_type = "ssh".to_string();
        hints.push("Connected via SSH session".to_string());
    }

    // Detect VM (basic heuristics)
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let model = std::process::Command::new("wmic")
            .args(["computersystem", "get", "model"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        if let Ok(output) = model {
            let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
            if text.contains("virtual") || text.contains("vmware") || text.contains("hyper-v") || text.contains("vbox") {
                env_type = "vm".to_string();
                hints.push("Running inside a virtual machine".to_string());
            }
        }
    }

    // Security checks
    #[cfg(not(target_os = "windows"))]
    {
        // Check if running as root
        if let Ok(uid) = std::env::var("EUID").or_else(|_| {
            std::process::Command::new("id").arg("-u").output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .map_err(|e| std::env::VarError::NotPresent)
        }) {
            if uid.trim() == "0" {
                hints.push("WARNING: Running as root user".to_string());
            }
        }

        // Check if SSH has password auth enabled
        if let Ok(sshd) = std::fs::read_to_string("/etc/ssh/sshd_config") {
            if sshd.lines().any(|l| {
                let l = l.trim();
                !l.starts_with('#') && l.contains("PasswordAuthentication") && l.contains("yes")
            }) {
                hints.push("SSH password authentication is enabled (consider key-only)".to_string());
            }
            if sshd.lines().any(|l| {
                let l = l.trim();
                !l.starts_with('#') && l.contains("PermitRootLogin") && (l.contains("yes") || l.contains("without-password"))
            }) {
                hints.push("SSH root login is permitted".to_string());
            }
        }
    }

    // Get local IP
    let ip = get_local_ip();

    EnvironmentInfo {
        env_type,
        os,
        hostname,
        ip,
        vulnerability_hints: hints,
    }
}

fn get_local_ip() -> String {
    // Try connecting to a public DNS to determine our local IP
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

pub fn scan_ports(target: &str, ports: &[u16]) -> Vec<PortScanResult> {
    let timeout = Duration::from_millis(500);
    let target_owned = target.to_string();

    // Parallel port scanning using scoped threads
    let results: Vec<Option<PortScanResult>> = std::thread::scope(|s| {
        let handles: Vec<_> = ports.iter().map(|&port| {
            let tgt = &target_owned;
            s.spawn(move || {
                let addr = format!("{}:{}", tgt, port);
                let state = match TcpStream::connect_timeout(
                    &addr.parse().unwrap_or_else(|_| std::net::SocketAddr::from(([127, 0, 0, 1], port))),
                    timeout,
                ) {
                    Ok(_stream) => "open",
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => "filtered",
                    Err(_) => return None, // closed — skip
                };

                let (service, risk) = COMMON_PORTS
                    .iter()
                    .find(|(p, _, _)| *p == port)
                    .map(|(_, s, r)| (s.to_string(), r.to_string()))
                    .unwrap_or_else(|| ("Unknown".to_string(), "low".to_string()));

                Some(PortScanResult {
                    port,
                    protocol: "TCP".to_string(),
                    service,
                    version: String::new(),
                    state: state.to_string(),
                    risk: if state == "open" { risk } else { "low".to_string() },
                })
            })
        }).collect();

        handles.into_iter().map(|h| h.join().unwrap_or(None)).collect()
    });

    results.into_iter().flatten().collect()
}

pub fn scan_common_ports(target: &str) -> Vec<PortScanResult> {
    let ports: Vec<u16> = COMMON_PORTS.iter().map(|(p, _, _)| *p).collect();
    scan_ports(target, &ports)
}

pub fn generate_network_map(env: &EnvironmentInfo, ports: &[PortScanResult]) -> String {
    let mut map = String::new();

    map.push_str("╔══════════════════════════════════════════════╗\n");
    map.push_str("║           NETWORK RECONNAISSANCE MAP         ║\n");
    map.push_str("╠══════════════════════════════════════════════╣\n");
    map.push_str(&format!("║  Host: {:<38}║\n", env.hostname));
    map.push_str(&format!("║  IP:   {:<38}║\n", env.ip));
    map.push_str(&format!("║  Type: {:<38}║\n", env.env_type));
    map.push_str(&format!("║  OS:   {:<38}║\n", truncate_str(&env.os, 38)));
    map.push_str("╠══════════════════════════════════════════════╣\n");

    let open_ports: Vec<&PortScanResult> = ports.iter().filter(|p| p.state == "open").collect();

    if open_ports.is_empty() {
        map.push_str("║  No open ports detected                      ║\n");
    } else {
        map.push_str("║  OPEN PORTS:                                 ║\n");
        map.push_str("║  ┌──────┬──────────────┬──────────┐          ║\n");
        map.push_str("║  │ PORT │   SERVICE    │   RISK   │          ║\n");
        map.push_str("║  ├──────┼──────────────┼──────────┤          ║\n");

        for p in &open_ports {
            let risk_icon = match p.risk.as_str() {
                "critical" => "[!!]",
                "high" => "[! ]",
                "medium" => "[. ]",
                _ => "[  ]",
            };
            map.push_str(&format!(
                "║  │{:>5} │ {:<12} │ {} {:<4} │          ║\n",
                p.port, p.service, risk_icon, p.risk
            ));
        }
        map.push_str("║  └──────┴──────────────┴──────────┘          ║\n");
    }

    if !env.vulnerability_hints.is_empty() {
        map.push_str("╠══════════════════════════════════════════════╣\n");
        map.push_str("║  SECURITY HINTS:                             ║\n");
        for hint in &env.vulnerability_hints {
            let truncated = truncate_str(hint, 42);
            map.push_str(&format!("║  > {:<42}║\n", truncated));
        }
    }

    map.push_str("╚══════════════════════════════════════════════╝\n");
    map
}

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        // Use char_indices to avoid panicking on multi-byte UTF-8 boundaries
        let truncate_at = max_len.saturating_sub(3);
        let end = s.char_indices()
            .take_while(|(i, _)| *i <= truncate_at)
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);
        format!("{}...", &s[..end])
    }
}

/// Grab service banner from an open port (best-effort)
pub fn grab_banner(host: &str, port: u16) -> Option<String> {
    use std::io::{Read, Write};

    let addr = format!("{}:{}", host, port);
    let parsed = addr.parse().ok()?;
    let mut stream = TcpStream::connect_timeout(&parsed, Duration::from_secs(2)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;

    // For HTTP, send a HEAD request
    if port == 80 || port == 8080 || port == 443 || port == 8443 {
        let req = format!("HEAD / HTTP/1.0\r\nHost: {}\r\n\r\n", host);
        stream.write_all(req.as_bytes()).ok()?;
    }

    let mut buf = vec![0u8; 1024];
    let n = stream.read(&mut buf).ok()?;
    if n > 0 {
        let text = String::from_utf8_lossy(&buf[..n]);
        // Extract server header or first line
        for line in text.lines() {
            let lower = line.to_lowercase();
            if lower.starts_with("server:") || lower.starts_with("ssh-") || lower.contains("version") {
                return Some(line.trim().to_string());
            }
        }
        // Return first line if nothing specific found
        if let Some(first) = text.lines().next() {
            return Some(first.trim().chars().take(80).collect());
        }
    }
    None
}

// Pre-built pentest scripts
#[derive(Serialize, Deserialize, Clone)]
pub struct PentestScript {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub risk: String,
    pub commands: Vec<String>,
}

pub fn get_pentest_scripts() -> Vec<PentestScript> {
    vec![
        PentestScript {
            id: "recon-basic".to_string(),
            name: "Basic Recon".to_string(),
            description: "Gather system info, network interfaces, listening ports".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "whoami".to_string(),
                "hostname".to_string(),
                "uname -a 2>/dev/null || ver".to_string(),
                "ip addr 2>/dev/null || ipconfig".to_string(),
                "netstat -tlnp 2>/dev/null || netstat -an".to_string(),
            ],
        },
        PentestScript {
            id: "recon-network".to_string(),
            name: "Network Discovery".to_string(),
            description: "Discover hosts on local subnet, ARP table, routing".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "arp -a 2>/dev/null || arp -e".to_string(),
                "ip route 2>/dev/null || route print".to_string(),
                "cat /etc/resolv.conf 2>/dev/null || ipconfig /all".to_string(),
            ],
        },
        PentestScript {
            id: "priv-check".to_string(),
            name: "Privilege Check".to_string(),
            description: "Check current user privileges, sudo access, SUID binaries".to_string(),
            category: "escalation".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "id 2>/dev/null || whoami /priv".to_string(),
                "sudo -l 2>/dev/null".to_string(),
                "find / -perm -4000 -type f 2>/dev/null | head -20".to_string(),
            ],
        },
        PentestScript {
            id: "file-sensitive".to_string(),
            name: "Sensitive File Search".to_string(),
            description: "Find config files, credentials, keys on the system".to_string(),
            category: "recon".to_string(),
            risk: "medium".to_string(),
            commands: vec![
                "find / -name '*.conf' -o -name '*.cfg' -o -name '*.ini' 2>/dev/null | head -30".to_string(),
                "find / -name 'id_rsa' -o -name '*.pem' -o -name '*.key' 2>/dev/null | head -20".to_string(),
                "cat /etc/passwd 2>/dev/null | head -20".to_string(),
            ],
        },
        PentestScript {
            id: "service-enum".to_string(),
            name: "Service Enumeration".to_string(),
            description: "List running services, cron jobs, and startup programs".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "systemctl list-units --type=service --state=running 2>/dev/null || sc query".to_string(),
                "crontab -l 2>/dev/null".to_string(),
                "ls -la /etc/cron.d/ 2>/dev/null".to_string(),
            ],
        },
        PentestScript {
            id: "dir-scan".to_string(),
            name: "Web Directory Scan".to_string(),
            description: "Check for common web server directories and files".to_string(),
            category: "exploit".to_string(),
            risk: "medium".to_string(),
            commands: vec![
                "curl -s -o /dev/null -w '%{http_code}' http://localhost/robots.txt 2>/dev/null".to_string(),
                "curl -s -o /dev/null -w '%{http_code}' http://localhost/.env 2>/dev/null".to_string(),
                "curl -s -o /dev/null -w '%{http_code}' http://localhost/admin 2>/dev/null".to_string(),
                "curl -s -o /dev/null -w '%{http_code}' http://localhost/.git/config 2>/dev/null".to_string(),
                "curl -s -o /dev/null -w '%{http_code}' http://localhost/wp-admin 2>/dev/null".to_string(),
            ],
        },
        PentestScript {
            id: "docker-escape".to_string(),
            name: "Docker Security Check".to_string(),
            description: "Check Docker security: privileged mode, mounts, capabilities".to_string(),
            category: "escalation".to_string(),
            risk: "medium".to_string(),
            commands: vec![
                "cat /proc/1/cgroup 2>/dev/null | grep docker".to_string(),
                "capsh --print 2>/dev/null || cat /proc/self/status | grep Cap".to_string(),
                "mount | grep -E '(docker|overlay)' 2>/dev/null".to_string(),
                "ls -la /var/run/docker.sock 2>/dev/null".to_string(),
            ],
        },
        PentestScript {
            id: "firewall-check".to_string(),
            name: "Firewall Rules".to_string(),
            description: "Check firewall configuration and rules".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "iptables -L -n 2>/dev/null || netsh advfirewall show allprofiles".to_string(),
                "ufw status 2>/dev/null".to_string(),
            ],
        },
        // Windows-specific scripts
        PentestScript {
            id: "win-recon".to_string(),
            name: "Windows Recon".to_string(),
            description: "Windows-specific info: users, groups, shares, scheduled tasks".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "net user".to_string(),
                "net localgroup administrators".to_string(),
                "net share".to_string(),
                "schtasks /query /fo LIST 2>nul | findstr /i \"taskname\" | head -20".to_string(),
                "wmic os get caption,version,buildnumber /value".to_string(),
            ],
        },
        PentestScript {
            id: "win-priv-check".to_string(),
            name: "Windows Privilege Check".to_string(),
            description: "Check Windows privileges, UAC status, unquoted service paths".to_string(),
            category: "escalation".to_string(),
            risk: "medium".to_string(),
            commands: vec![
                "whoami /priv".to_string(),
                "whoami /groups".to_string(),
                "reg query HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System /v EnableLUA 2>nul".to_string(),
                "wmic service get name,pathname,startmode | findstr /i \"auto\" | findstr /v \"C:\\Windows\"".to_string(),
            ],
        },
        PentestScript {
            id: "win-network-recon".to_string(),
            name: "Windows Network Recon".to_string(),
            description: "Windows network: interfaces, DNS cache, connections, WiFi profiles".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "ipconfig /all".to_string(),
                "ipconfig /displaydns | findstr \"Record\" | head -30".to_string(),
                "netstat -an | findstr ESTABLISHED".to_string(),
                "netsh wlan show profiles 2>nul".to_string(),
            ],
        },
        PentestScript {
            id: "ssh-hardening".to_string(),
            name: "SSH Hardening Audit".to_string(),
            description: "Check SSH configuration for security best practices".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "cat /etc/ssh/sshd_config 2>/dev/null | grep -E '(PermitRoot|PasswordAuth|PubkeyAuth|Port |MaxAuth|X11Forward)' | grep -v '^#'".to_string(),
                "ls -la ~/.ssh/ 2>/dev/null".to_string(),
                "cat ~/.ssh/authorized_keys 2>/dev/null | wc -l".to_string(),
            ],
        },
        PentestScript {
            id: "log-analysis".to_string(),
            name: "Security Log Analysis".to_string(),
            description: "Check auth logs for failed logins, suspicious activity".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "grep -i 'failed\\|error\\|denied' /var/log/auth.log 2>/dev/null | tail -20".to_string(),
                "lastlog 2>/dev/null | head -20".to_string(),
                "last -n 10 2>/dev/null".to_string(),
            ],
        },
        PentestScript {
            id: "dns-enum".to_string(),
            name: "DNS Enumeration".to_string(),
            description: "DNS lookup, reverse DNS, DNS zone transfer attempt".to_string(),
            category: "recon".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "nslookup localhost 2>/dev/null || dig localhost".to_string(),
                "cat /etc/hosts 2>/dev/null | head -20".to_string(),
            ],
        },
        PentestScript {
            id: "http-headers".to_string(),
            name: "HTTP Security Headers".to_string(),
            description: "Check for missing security headers on a web server".to_string(),
            category: "exploit".to_string(),
            risk: "low".to_string(),
            commands: vec![
                "curl -sI http://localhost 2>/dev/null | grep -iE '(server|x-frame|x-content|x-xss|strict-transport|content-security|referrer-policy)'".to_string(),
            ],
        },
    ]
}

/// Generate a security report as markdown
pub fn generate_security_report(
    env: &EnvironmentInfo,
    ports: &[PortScanResult],
) -> String {
    let mut report = String::new();

    report.push_str("# Security Reconnaissance Report\n\n");
    report.push_str(&format!("**Date:** {}\n", format_timestamp()));
    report.push_str(&format!("**Target:** {} ({})\n", env.hostname, env.ip));
    report.push_str(&format!("**Environment:** {}\n", env.env_type));
    report.push_str(&format!("**OS:** {}\n\n", env.os));

    // Risk score calculation
    let critical_count = ports.iter().filter(|p| p.state == "open" && p.risk == "critical").count();
    let high_count = ports.iter().filter(|p| p.state == "open" && p.risk == "high").count();
    let risk_score = critical_count * 25 + high_count * 10 + env.vulnerability_hints.len() * 5;
    let risk_level = if risk_score >= 50 { "CRITICAL" } else if risk_score >= 25 { "HIGH" } else if risk_score >= 10 { "MEDIUM" } else { "LOW" };

    report.push_str(&format!("## Risk Assessment: {} (Score: {})\n\n", risk_level, risk_score));

    // Open ports
    let open_ports: Vec<&PortScanResult> = ports.iter().filter(|p| p.state == "open").collect();
    report.push_str(&format!("## Open Ports ({})\n\n", open_ports.len()));
    if open_ports.is_empty() {
        report.push_str("No open ports detected.\n\n");
    } else {
        report.push_str("| Port | Service | Risk | Version |\n");
        report.push_str("|------|---------|------|---------|\n");
        for p in &open_ports {
            report.push_str(&format!(
                "| {} | {} | {} | {} |\n",
                p.port, p.service, p.risk.to_uppercase(),
                if p.version.is_empty() { "-" } else { &p.version }
            ));
        }
        report.push_str("\n");
    }

    // Security findings
    if !env.vulnerability_hints.is_empty() {
        report.push_str("## Security Findings\n\n");
        for (i, hint) in env.vulnerability_hints.iter().enumerate() {
            report.push_str(&format!("{}. {}\n", i + 1, hint));
        }
        report.push_str("\n");
    }

    // Recommendations
    report.push_str("## Recommendations\n\n");
    for p in &open_ports {
        if p.risk == "critical" || p.risk == "high" {
            let rec = match p.service.as_str() {
                "Telnet" => "Disable Telnet immediately and use SSH instead",
                "FTP" => "Replace FTP with SFTP. If FTP is required, enforce TLS",
                "Redis" => "Bind Redis to localhost only, enable AUTH, use firewall rules",
                "MongoDB" => "Enable authentication, bind to localhost, use TLS",
                "VNC" => "Use SSH tunneling for VNC, disable direct access",
                "MySQL" | "PostgreSQL" | "MSSQL" | "Oracle" => "Restrict database access to localhost or specific IPs only",
                "SMB" | "NetBIOS" => "Disable SMBv1, restrict access via firewall",
                "RDP" => "Enable NLA, use strong passwords, restrict via firewall",
                "MSRPC" => "Restrict RPC access via Windows Firewall",
                _ => "Review if this service should be publicly accessible",
            };
            report.push_str(&format!("- **Port {} ({}):** {}\n", p.port, p.service, rec));
        }
    }

    report.push_str("\n---\n*Generated by NovaShell Hacking Mode*\n");
    report
}

fn format_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Simple timestamp: seconds since epoch formatted
    let hours = (now % 86400) / 3600;
    let minutes = (now % 3600) / 60;
    format!("{:02}:{:02} UTC", hours, minutes)
}

// ═══════════════════════════════════════════════════════════════
//  NEW: Ping Sweep, HTTP Security, WiFi, Subnet, DNS, HTTP Forge
// ═══════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Clone)]
pub struct PingSweepResult {
    pub ip: String,
    pub alive: bool,
    pub latency_ms: u64,
    pub open_port: u16,
}

/// TCP connect sweep on a /24 subnet. Tests ports 80, 445, 22 with 200ms timeout.
pub fn ping_sweep(subnet_base: &str) -> Result<Vec<PingSweepResult>, String> {
    let base = subnet_base.trim().trim_end_matches('.');
    // Validate base looks like an IP prefix
    let parts: Vec<&str> = base.split('.').collect();
    if parts.len() != 3 || parts.iter().any(|p| p.parse::<u8>().is_err()) {
        return Err("Invalid subnet base. Use format: 192.168.1".to_string());
    }

    let probe_ports: &[u16] = &[80, 445, 22, 443, 3389];
    let timeout = Duration::from_millis(200);

    let results: Vec<PingSweepResult> = std::thread::scope(|s| {
        let handles: Vec<_> = (1..=254u16).map(|host| {
            let base = base.to_string();
            s.spawn(move || {
                let ip = format!("{}.{}", base, host);
                let start = std::time::Instant::now();
                for &port in probe_ports {
                    let addr = format!("{}:{}", ip, port);
                    if let Ok(parsed) = addr.parse::<std::net::SocketAddr>() {
                        if TcpStream::connect_timeout(&parsed, timeout).is_ok() {
                            return PingSweepResult {
                                ip,
                                alive: true,
                                latency_ms: start.elapsed().as_millis() as u64,
                                open_port: port,
                            };
                        }
                    }
                }
                PingSweepResult {
                    ip,
                    alive: false,
                    latency_ms: 0,
                    open_port: 0,
                }
            })
        }).collect();

        handles.into_iter().filter_map(|h| {
            let r = h.join().ok()?;
            if r.alive { Some(r) } else { None }
        }).collect()
    });

    Ok(results)
}

// ── HTTP Security Analyzer ──

#[derive(Serialize, Deserialize, Clone)]
pub struct HttpSecurityHeader {
    pub name: String,
    pub value: String,
    pub present: bool,
    pub rating: String, // "good" | "warning" | "bad"
}

#[derive(Serialize, Deserialize, Clone)]
pub struct HttpSecurityResult {
    pub url: String,
    pub status_code: u16,
    pub headers_found: Vec<HttpSecurityHeader>,
    pub score: u8,
    pub grade: String,
    pub findings: Vec<String>,
    pub server: String,
    pub cookies_secure: bool,
}

const SECURITY_HEADERS: &[(&str, u8)] = &[
    ("content-security-policy", 15),
    ("strict-transport-security", 15),
    ("x-frame-options", 10),
    ("x-content-type-options", 10),
    ("referrer-policy", 10),
    ("permissions-policy", 10),
    ("x-xss-protection", 5),
];

pub async fn analyze_http_security(url: &str) -> Result<HttpSecurityResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client.get(url).send().await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status_code = resp.status().as_u16();
    let headers = resp.headers().clone();

    let mut score: u8 = 100;
    let mut found = Vec::new();
    let mut findings = Vec::new();

    // Check security headers
    for &(header_name, penalty) in SECURITY_HEADERS {
        let value = headers.get(header_name).map(|v| v.to_str().unwrap_or("").to_string());
        let present = value.is_some();
        if !present {
            score = score.saturating_sub(penalty);
            findings.push(format!("Missing header: {}", header_name));
        }
        found.push(HttpSecurityHeader {
            name: header_name.to_string(),
            value: value.unwrap_or_default(),
            present,
            rating: if present { "good".to_string() } else { "bad".to_string() },
        });
    }

    // Check Server header disclosure
    let server = headers.get("server").map(|v| v.to_str().unwrap_or("").to_string()).unwrap_or_default();
    if !server.is_empty() {
        // Check for version disclosure
        if server.chars().any(|c| c.is_ascii_digit()) {
            findings.push(format!("Server version disclosed: {}", server));
            score = score.saturating_sub(5);
            found.push(HttpSecurityHeader {
                name: "server".to_string(),
                value: server.clone(),
                present: true,
                rating: "warning".to_string(),
            });
        }
    }

    // Check CORS
    if let Some(cors) = headers.get("access-control-allow-origin") {
        let v = cors.to_str().unwrap_or("");
        if v == "*" {
            findings.push("CORS allows all origins (*)".to_string());
            score = score.saturating_sub(10);
            found.push(HttpSecurityHeader {
                name: "access-control-allow-origin".to_string(),
                value: v.to_string(),
                present: true,
                rating: "bad".to_string(),
            });
        }
    }

    // Check cookies
    let cookies_secure = if let Some(cookie) = headers.get("set-cookie") {
        let c = cookie.to_str().unwrap_or("").to_lowercase();
        let secure = c.contains("secure");
        let httponly = c.contains("httponly");
        let samesite = c.contains("samesite");
        if !secure { findings.push("Cookie missing Secure flag".to_string()); score = score.saturating_sub(5); }
        if !httponly { findings.push("Cookie missing HttpOnly flag".to_string()); score = score.saturating_sub(5); }
        if !samesite { findings.push("Cookie missing SameSite attribute".to_string()); score = score.saturating_sub(3); }
        secure && httponly
    } else {
        true // no cookies = OK
    };

    let grade = match score {
        90..=100 => "A",
        75..=89 => "B",
        55..=74 => "C",
        35..=54 => "D",
        _ => "F",
    }.to_string();

    Ok(HttpSecurityResult {
        url: url.to_string(),
        status_code,
        headers_found: found,
        score,
        grade,
        findings,
        server,
        cookies_secure,
    })
}

// ── WiFi Scanner (Windows) ──

#[derive(Serialize, Deserialize, Clone)]
pub struct WifiNetwork {
    pub ssid: String,
    pub bssid: String,
    pub signal_percent: u8,
    pub channel: u16,
    pub auth: String,
    pub encryption: String,
}

pub fn scan_wifi() -> Result<Vec<WifiNetwork>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = std::process::Command::new("netsh")
            .args(["wlan", "show", "networks", "mode=bssid"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("WiFi scan failed: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout);
        let mut networks = Vec::new();
        let mut current_ssid = String::new();
        let mut current_auth = String::new();
        let mut current_enc = String::new();

        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("SSID") && !line.starts_with("BSSID") && line.contains(':') {
                current_ssid = line.split(':').skip(1).collect::<Vec<&str>>().join(":").trim().to_string();
            } else if line.starts_with("Autenticaci") || line.starts_with("Authentication") {
                current_auth = line.split(':').skip(1).collect::<Vec<&str>>().join(":").trim().to_string();
            } else if line.starts_with("Cifrado") || line.starts_with("Cipher") || line.starts_with("Encryption") {
                current_enc = line.split(':').skip(1).collect::<Vec<&str>>().join(":").trim().to_string();
            } else if line.starts_with("BSSID") && line.contains(':') {
                let bssid = line.split(" : ").nth(1).unwrap_or("").trim().to_string();
                // Next lines should have signal and channel
                let signal: u8 = 0;
                let channel: u16 = 0;
                // We'll parse in next iterations but for now push placeholder
                networks.push(WifiNetwork {
                    ssid: current_ssid.clone(),
                    bssid,
                    signal_percent: signal,
                    channel,
                    auth: current_auth.clone(),
                    encryption: current_enc.clone(),
                });
            } else if (line.starts_with("Se") && line.contains('%')) || line.starts_with("Signal") {
                if let Some(pct) = line.split(':').nth(1) {
                    let pct = pct.trim().trim_end_matches('%').trim();
                    if let Ok(v) = pct.parse::<u8>() {
                        if let Some(last) = networks.last_mut() {
                            last.signal_percent = v;
                        }
                    }
                }
            } else if line.starts_with("Canal") || line.starts_with("Channel") {
                if let Some(ch) = line.split(':').nth(1) {
                    if let Ok(v) = ch.trim().parse::<u16>() {
                        if let Some(last) = networks.last_mut() {
                            last.channel = v;
                        }
                    }
                }
            }
        }
        Ok(networks)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("WiFi scanning only available on Windows".to_string())
    }
}

// ── Subnet Calculator ──

#[derive(Serialize, Deserialize, Clone)]
pub struct SubnetInfo {
    pub network: String,
    pub broadcast: String,
    pub first_host: String,
    pub last_host: String,
    pub usable_hosts: u32,
    pub cidr: u8,
    pub netmask: String,
    pub wildcard: String,
    pub ip_class: String,
    pub is_private: bool,
}

pub fn calculate_subnet(ip: &str, cidr: u8) -> Result<SubnetInfo, String> {
    if cidr > 32 {
        return Err("CIDR must be 0-32".to_string());
    }

    let octets: Vec<u8> = ip.split('.')
        .map(|s| s.parse::<u8>().map_err(|_| "Invalid IP".to_string()))
        .collect::<Result<Vec<u8>, String>>()?;

    if octets.len() != 4 {
        return Err("Invalid IP format".to_string());
    }

    let ip_u32 = ((octets[0] as u32) << 24)
        | ((octets[1] as u32) << 16)
        | ((octets[2] as u32) << 8)
        | (octets[3] as u32);

    let mask = if cidr == 0 { 0u32 } else { !0u32 << (32 - cidr) };
    let wildcard = !mask;
    let network = ip_u32 & mask;
    let broadcast = network | wildcard;

    let to_ip = |v: u32| -> String {
        format!("{}.{}.{}.{}", (v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF)
    };

    let usable = if cidr >= 31 { if cidr == 32 { 1 } else { 2 } } else { broadcast - network - 1 };

    let first_host = if cidr >= 31 { network } else { network + 1 };
    let last_host = if cidr >= 31 { broadcast } else { broadcast - 1 };

    let ip_class = match octets[0] {
        0..=127 => "A",
        128..=191 => "B",
        192..=223 => "C",
        224..=239 => "D (Multicast)",
        _ => "E (Reserved)",
    }.to_string();

    let is_private = matches!(
        (octets[0], octets[1]),
        (10, _) | (172, 16..=31) | (192, 168)
    );

    Ok(SubnetInfo {
        network: to_ip(network),
        broadcast: to_ip(broadcast),
        first_host: to_ip(first_host),
        last_host: to_ip(last_host),
        usable_hosts: usable,
        cidr,
        netmask: to_ip(mask),
        wildcard: to_ip(wildcard),
        ip_class,
        is_private,
    })
}

// ── DNS Enumeration ──

#[derive(Serialize, Deserialize, Clone)]
pub struct DnsResult {
    pub domain: String,
    pub a_records: Vec<String>,
    pub aaaa_records: Vec<String>,
    pub mx_records: Vec<String>,
    pub ns_records: Vec<String>,
    pub txt_records: Vec<String>,
    pub soa_record: String,
    pub reverse_dns: Vec<String>,
}

pub fn dns_enumerate(domain: &str) -> Result<DnsResult, String> {
    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let run_nslookup = |record_type: &str, target: &str| -> Vec<String> {
        let mut cmd = std::process::Command::new("nslookup");
        cmd.args([&format!("-type={}", record_type), target]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let output = match cmd.output() {
            Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
            Err(_) => return Vec::new(),
        };
        parse_nslookup_output(&output, record_type)
    };

    let a_records = run_nslookup("A", domain);
    let aaaa_records = run_nslookup("AAAA", domain);
    let mx_records = run_nslookup("MX", domain);
    let ns_records = run_nslookup("NS", domain);
    let txt_records = run_nslookup("TXT", domain);
    let soa_raw = run_nslookup("SOA", domain);
    let soa_record = soa_raw.first().cloned().unwrap_or_default();

    // Reverse DNS for first A record
    let reverse_dns = if let Some(ip) = a_records.first() {
        run_nslookup("PTR", ip)
    } else {
        Vec::new()
    };

    Ok(DnsResult {
        domain: domain.to_string(),
        a_records,
        aaaa_records,
        mx_records,
        ns_records,
        txt_records,
        soa_record,
        reverse_dns,
    })
}

fn parse_nslookup_output(output: &str, record_type: &str) -> Vec<String> {
    let mut results = Vec::new();
    let lines: Vec<&str> = output.lines().collect();
    let mut past_header = false;

    for line in &lines {
        let line = line.trim();
        // Skip the header (first server/address block)
        if line.starts_with("Name:") || line.starts_with("Nombre:") {
            past_header = true;
        }
        if !past_header && !line.contains("nameserver") && !line.contains("servidor") {
            continue;
        }

        match record_type {
            "A" | "AAAA" => {
                if (line.starts_with("Address:") || line.starts_with("Direcci")) && past_header {
                    if let Some(addr) = line.split(':').last() {
                        let addr = addr.trim();
                        if !addr.is_empty() && addr != "127.0.0.1" {
                            results.push(addr.to_string());
                        }
                    }
                }
                // Also catch "Addresses:" lines
                if line.starts_with("Addresses:") {
                    for addr in line.split(':').skip(1).flat_map(|s| s.split(',')) {
                        let addr = addr.trim();
                        if !addr.is_empty() {
                            results.push(addr.to_string());
                        }
                    }
                }
            }
            "MX" => {
                if line.contains("mail exchanger") || line.contains("MX preference") {
                    results.push(line.to_string());
                }
            }
            "NS" => {
                if line.contains("nameserver") || line.contains("servidor de nombres") {
                    if let Some(ns) = line.split('=').last().or_else(|| line.split(':').last()) {
                        let ns = ns.trim();
                        if !ns.is_empty() {
                            results.push(ns.to_string());
                        }
                    }
                }
            }
            "TXT" => {
                if line.contains("text") || line.contains("texto") || line.starts_with('"') {
                    results.push(line.trim_matches('"').to_string());
                }
            }
            "SOA" => {
                if line.contains("primary") || line.contains("origin") || line.contains("principal") || line.contains("responsable") {
                    results.push(line.to_string());
                }
            }
            "PTR" => {
                if line.contains("name =") || line.contains("nombre =") {
                    if let Some(name) = line.split('=').last() {
                        results.push(name.trim().trim_end_matches('.').to_string());
                    }
                }
            }
            _ => {}
        }
    }
    results
}

// ── HTTP Request Forge ──

#[derive(Serialize, Deserialize, Clone)]
pub struct HttpForgeRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct HttpForgeResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub time_ms: u64,
}

pub async fn http_forge(req: HttpForgeRequest) -> Result<HttpForgeResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    let method: reqwest::Method = req.method.parse()
        .map_err(|_| format!("Invalid method: {}", req.method))?;

    let mut builder = client.request(method, &req.url);
    for (k, v) in &req.headers {
        if !k.is_empty() {
            builder = builder.header(k.as_str(), v.as_str());
        }
    }
    if !req.body.is_empty() {
        builder = builder.body(req.body);
    }

    let start = std::time::Instant::now();
    let resp = builder.send().await
        .map_err(|e| format!("Request failed: {}", e))?;
    let time_ms = start.elapsed().as_millis() as u64;

    let status = resp.status().as_u16();
    let status_text = resp.status().canonical_reason().unwrap_or("").to_string();

    let resp_headers: Vec<(String, String)> = resp.headers().iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let body = resp.text().await.unwrap_or_default();
    // Limit body to 50KB to avoid UI freeze
    let body = if body.len() > 50_000 {
        format!("{}... [truncated, {} bytes total]", &body[..50_000], body.len())
    } else {
        body
    };

    Ok(HttpForgeResponse {
        status,
        status_text,
        headers: resp_headers,
        body,
        time_ms,
    })
}

/// Encrypt data using a simple XOR cipher with a key derived from the password
/// For real security, use aes-gcm crate, but this avoids extra dependencies
pub fn encrypt_data(data: &str, password: &str) -> Vec<u8> {
    let key_bytes: Vec<u8> = password.bytes().collect();
    if key_bytes.is_empty() {
        return data.as_bytes().to_vec();
    }
    data.bytes()
        .enumerate()
        .map(|(i, b)| b ^ key_bytes[i % key_bytes.len()])
        .collect()
}

pub fn decrypt_data(data: &[u8], password: &str) -> String {
    let key_bytes: Vec<u8> = password.bytes().collect();
    if key_bytes.is_empty() {
        return String::from_utf8_lossy(data).to_string();
    }
    let decrypted: Vec<u8> = data
        .iter()
        .enumerate()
        .map(|(i, &b)| b ^ key_bytes[i % key_bytes.len()])
        .collect();
    String::from_utf8_lossy(&decrypted).to_string()
}
