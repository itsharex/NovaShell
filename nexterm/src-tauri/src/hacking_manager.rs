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
    let mut results = Vec::new();

    for &port in ports {
        let addr = format!("{}:{}", target, port);
        let state = match TcpStream::connect_timeout(
            &addr.parse().unwrap_or_else(|_| std::net::SocketAddr::from(([127, 0, 0, 1], port))),
            timeout,
        ) {
            Ok(_stream) => "open",
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => "filtered",
            Err(_) => "closed",
        };

        if state == "closed" {
            continue; // Only report open/filtered
        }

        let (service, risk) = COMMON_PORTS
            .iter()
            .find(|(p, _, _)| *p == port)
            .map(|(_, s, r)| (s.to_string(), r.to_string()))
            .unwrap_or_else(|| ("Unknown".to_string(), "low".to_string()));

        results.push(PortScanResult {
            port,
            protocol: "TCP".to_string(),
            service: service.clone(),
            version: String::new(), // Banner grab would go here
            state: state.to_string(),
            risk: if state == "open" { risk } else { "low".to_string() },
        });
    }

    results
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
