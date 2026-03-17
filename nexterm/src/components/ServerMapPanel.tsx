import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Server, Loader2, RefreshCw, X, Play, Square, FileText, RotateCcw,
  Globe, Database, Shield, Container, Cpu, Wifi, ChevronDown, ChevronRight,
  Activity, HardDrive, MemoryStick, Timer, Layers, Search,
  Lock, AlertTriangle, Copy, Terminal, Eye, Settings, Zap, Edit3, Save,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useT } from "../i18n";
import type { SSHConnection } from "../store/appStore";

let tauriCoreCache: typeof import("@tauri-apps/api/core") | null = null;
async function getTauriCore() {
  if (!tauriCoreCache) tauriCoreCache = await import("@tauri-apps/api/core");
  return tauriCoreCache;
}

interface DetectedService { name: string; kind: string; status: string; port: number | null; detail: string; }
interface ServerSystemInfo { os: string; kernel: string; uptime: string; cpu_count: string; ram_usage: string; disk_usage: string; }
interface ServerQuickStats { cpu_percent: string; mem_percent: string; disk_percent: string; load_avg: string; top_processes: string[]; }
interface ServerScan {
  connectionId: string; connectionName: string; services: DetectedService[];
  scannedAt: number; systemInfo?: ServerSystemInfo; quickStats?: ServerQuickStats;
}

// ── Smart Actions per service type ──
type SmartAction = { label: string; icon: React.ReactNode; cmd: string; copyOnly?: boolean; editable?: boolean; saveCmdFn?: (content: string) => string };

function getSmartActions(svc: DetectedService): SmartAction[] {
  const n = svc.name.toLowerCase();
  const actions: SmartAction[] = [];

  // Common actions
  if (svc.kind === "docker") {
    actions.push(
      { label: "Status", icon: <Eye size={8} />, cmd: `docker inspect --format 'Status: {{.State.Status}}\\nImage: {{.Config.Image}}\\nStarted: {{.State.StartedAt}}\\nPorts: {{range $p,$c := .NetworkSettings.Ports}}{{$p}}->{{range $c}}{{.HostPort}}{{end}} {{end}}\\nNetworks: {{range $k,$v := .NetworkSettings.Networks}}{{$k}}({{$v.IPAddress}}) {{end}}' ${svc.name} 2>&1` },
      { label: "Logs", icon: <FileText size={8} />, cmd: `docker logs --tail 100 ${svc.name} 2>&1` },
      { label: "Stats", icon: <Activity size={8} />, cmd: `docker stats --no-stream --format 'CPU: {{.CPUPerc}}\\nMEM: {{.MemUsage}} ({{.MemPerc}})\\nNET: {{.NetIO}}\\nDISK: {{.BlockIO}}\\nPIDs: {{.PIDs}}' ${svc.name} 2>&1` },
      { label: "Processes", icon: <Layers size={8} />, cmd: `docker top ${svc.name} -eo pid,user,%cpu,%mem,comm 2>&1` },
      { label: "Volumes", icon: <HardDrive size={8} />, cmd: `docker inspect --format '{{range .Mounts}}{{.Type}}: {{.Source}} -> {{.Destination}}\\n{{end}}' ${svc.name} 2>&1` },
      { label: "Env Vars", icon: <Settings size={8} />, cmd: `docker inspect --format '{{range .Config.Env}}{{.}}\\n{{end}}' ${svc.name} 2>&1` },
      { label: "Networks", icon: <Globe size={8} />, cmd: `docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}: IP={{$v.IPAddress}} GW={{$v.Gateway}}\\n{{end}}' ${svc.name} 2>&1` },
      { label: "Shell cmd", icon: <Copy size={8} />, cmd: `docker exec -it ${svc.name} bash`, copyOnly: true },
      { label: "Restart", icon: <RotateCcw size={8} />, cmd: `docker restart ${svc.name} 2>&1 && echo '✓ Restarted'` },
      { label: "Stop", icon: <Square size={8} />, cmd: `docker stop ${svc.name} 2>&1 && echo '✓ Stopped'` },
    );
  } else if (svc.kind === "systemd") {
    actions.push(
      { label: "Status", icon: <Eye size={8} />, cmd: `systemctl status ${svc.name} --no-pager -l 2>&1` },
      { label: "Logs", icon: <FileText size={8} />, cmd: `journalctl -u ${svc.name} -n 100 --no-pager 2>&1` },
      { label: "Errors only", icon: <AlertTriangle size={8} />, cmd: `journalctl -u ${svc.name} -p err -n 30 --no-pager 2>&1` },
      { label: "Config", icon: <Settings size={8} />, cmd: `systemctl cat ${svc.name} 2>&1`, editable: true, saveCmdFn: (content: string) => {
        // systemctl cat shows the path in the first line (# /etc/systemd/system/xxx.service)
        // We extract it and use tee to write back
        const lines = content.split("\n");
        const pathLine = lines.find(l => l.startsWith("# /"));
        const path = pathLine ? pathLine.replace("# ", "").trim() : `/etc/systemd/system/${svc.name}.service`;
        const cleanContent = lines.filter(l => !l.startsWith("# /")).join("\n");
        const safeContent = cleanContent.replace(/NOVASHELL_EOF/g, 'NOVASHELL_EOF_ESCAPED');
        return `cp ${path} ${path}.bak 2>/dev/null; cat > ${path} << 'NOVASHELL_EOF'\n${safeContent}\nNOVASHELL_EOF\nsystemctl daemon-reload 2>&1 && echo '✓ Config saved and daemon reloaded'`;
      }},
    );

    // Service-specific smart actions
    if (n.includes("nginx")) {
      actions.push(
        { label: "Edit nginx.conf", icon: <Edit3 size={8} />, cmd: `cat /etc/nginx/nginx.conf 2>&1`, editable: true, saveCmdFn: (content: string) => { const safeContent = content.replace(/NOVASHELL_EOF/g, 'NOVASHELL_EOF_ESCAPED'); return `cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak 2>/dev/null; cat > /etc/nginx/nginx.conf << 'NOVASHELL_EOF'\n${safeContent}\nNOVASHELL_EOF\nnginx -t 2>&1 && echo '✓ Config valid' || echo '✗ Config invalid'`; } },
        { label: "Test config", icon: <Zap size={8} />, cmd: `nginx -t 2>&1` },
        { label: "Reload", icon: <RefreshCw size={8} />, cmd: `sudo nginx -s reload 2>&1 && echo '✓ Reloaded'` },
        { label: "Sites enabled", icon: <Globe size={8} />, cmd: `ls -la /etc/nginx/sites-enabled/ 2>/dev/null || ls -la /etc/nginx/conf.d/ 2>/dev/null` },
        { label: "Error log", icon: <AlertTriangle size={8} />, cmd: `tail -30 /var/log/nginx/error.log 2>/dev/null` },
        { label: "Access log", icon: <FileText size={8} />, cmd: `tail -30 /var/log/nginx/access.log 2>/dev/null` },
      );
    } else if (n.includes("apache") || n.includes("httpd")) {
      actions.push(
        { label: "Edit config", icon: <Edit3 size={8} />, cmd: `cat /etc/apache2/apache2.conf 2>/dev/null || cat /etc/httpd/conf/httpd.conf 2>/dev/null`, editable: true, saveCmdFn: (content: string) => { const safeContent = content.replace(/NOVASHELL_EOF/g, 'NOVASHELL_EOF_ESCAPED'); return `cp /etc/apache2/apache2.conf /etc/apache2/apache2.conf.bak 2>/dev/null; cat > /etc/apache2/apache2.conf << 'NOVASHELL_EOF'\n${safeContent}\nNOVASHELL_EOF\napache2ctl configtest 2>&1 && echo '✓ Config valid' || echo '✗ Config invalid'`; } },
        { label: "Test config", icon: <Zap size={8} />, cmd: `apache2ctl configtest 2>&1 || httpd -t 2>&1` },
        { label: "Reload", icon: <RefreshCw size={8} />, cmd: `sudo systemctl reload ${svc.name} 2>&1 && echo '✓ Reloaded'` },
        { label: "Error log", icon: <AlertTriangle size={8} />, cmd: `tail -30 /var/log/apache2/error.log 2>/dev/null || tail -30 /var/log/httpd/error_log 2>/dev/null` },
      );
    } else if (n.includes("postgres")) {
      actions.push(
        { label: "Databases", icon: <Database size={8} />, cmd: `sudo -u postgres psql -c '\\l' 2>&1 || psql -c '\\l' 2>&1` },
        { label: "Connections", icon: <Activity size={8} />, cmd: `sudo -u postgres psql -c "SELECT pid,usename,application_name,client_addr,state,query_start FROM pg_stat_activity WHERE state='active'" 2>&1` },
        { label: "Slow queries", icon: <Timer size={8} />, cmd: `sudo -u postgres psql -c "SELECT pid,now()-query_start AS duration,left(query,80) FROM pg_stat_activity WHERE state='active' AND query NOT LIKE '%pg_stat%' ORDER BY duration DESC LIMIT 10" 2>&1` },
        { label: "DB sizes", icon: <HardDrive size={8} />, cmd: `sudo -u postgres psql -c "SELECT datname,pg_size_pretty(pg_database_size(datname)) FROM pg_database ORDER BY pg_database_size(datname) DESC" 2>&1` },
      );
    } else if (n.includes("mysql") || n.includes("mariadb")) {
      actions.push(
        { label: "Databases", icon: <Database size={8} />, cmd: `mysql -e 'SHOW DATABASES' 2>&1` },
        { label: "Processlist", icon: <Activity size={8} />, cmd: `mysql -e 'SHOW PROCESSLIST' 2>&1` },
        { label: "Status", icon: <Zap size={8} />, cmd: `mysql -e 'SHOW GLOBAL STATUS' 2>&1 | head -40` },
      );
    } else if (n.includes("redis")) {
      actions.push(
        { label: "Info", icon: <Zap size={8} />, cmd: `redis-cli INFO server 2>&1 | head -20` },
        { label: "Memory", icon: <MemoryStick size={8} />, cmd: `redis-cli INFO memory 2>&1` },
        { label: "Clients", icon: <Activity size={8} />, cmd: `redis-cli CLIENT LIST 2>&1` },
        { label: "DB size", icon: <Database size={8} />, cmd: `redis-cli DBSIZE 2>&1` },
      );
    } else if (n.includes("mongo")) {
      actions.push(
        { label: "Status", icon: <Zap size={8} />, cmd: `mongosh --eval 'db.serverStatus().connections' 2>&1 || mongo --eval 'db.serverStatus().connections' 2>&1` },
        { label: "Databases", icon: <Database size={8} />, cmd: `mongosh --eval 'db.adminCommand("listDatabases")' 2>&1 || mongo --eval 'db.adminCommand("listDatabases")' 2>&1` },
      );
    }

    actions.push(
      { label: "Restart", icon: <RotateCcw size={8} />, cmd: `sudo systemctl restart ${svc.name} 2>&1 && systemctl is-active ${svc.name}` },
      { label: "Stop", icon: <Square size={8} />, cmd: `sudo systemctl stop ${svc.name} 2>&1 && echo '✓ Stopped'` },
    );
  } else {
    // Port-based
    actions.push(
      { label: "Who's listening", icon: <Eye size={8} />, cmd: `ss -tlnp 'sport = :${svc.port}' 2>/dev/null || netstat -tlnp 2>/dev/null | grep :${svc.port}` },
      { label: "Connections", icon: <Activity size={8} />, cmd: `ss -tnp 'sport = :${svc.port}' 2>/dev/null | head -20` },
    );
  }
  return actions;
}

// ── Helpers ──

const statusColor = (status: string): string => {
  const s = status.toLowerCase();
  if (s.includes("running") || s.includes("active") || s.includes("listening") || s.includes("up")) return "#10B981";
  if (s.includes("exited") || s.includes("dead") || s.includes("failed") || s.includes("stopped")) return "#EF4444";
  return "#F59E0B";
};

const serviceIcon = (kind: string, name: string) => {
  const n = name.toLowerCase();
  if (kind === "docker") return <Container size={13} style={{ color: "#2496ED" }} />;
  if (n.includes("postgres") || n.includes("mysql") || n.includes("mongo") || n.includes("redis") || n.includes("elastic"))
    return <Database size={13} style={{ color: "#F59E0B" }} />;
  if (n.includes("http") || n.includes("nginx") || n.includes("apache") || n.includes("grafana") || n.includes("prometheus"))
    return <Globe size={13} style={{ color: "#10B981" }} />;
  if (n.includes("ssh") || n.includes("firewall") || n.includes("ufw") || n.includes("fail2ban"))
    return <Shield size={13} style={{ color: "#8B5CF6" }} />;
  if (n.includes("node") || n.includes("python") || n.includes("java") || n.includes("go") || n.includes("php"))
    return <Cpu size={13} style={{ color: "#EC4899" }} />;
  return <Wifi size={13} style={{ color: "var(--text-muted)" }} />;
};

const alertLevel = (stats?: ServerQuickStats): "ok" | "warn" | "critical" | null => {
  if (!stats) return null;
  const cpu = parseFloat(stats.cpu_percent) || 0;
  const mem = parseFloat(stats.mem_percent) || 0;
  const disk = parseFloat(stats.disk_percent) || 0;
  if (cpu > 90 || mem > 95 || disk > 95) return "critical";
  if (cpu > 80 || mem > 85 || disk > 85) return "warn";
  return "ok";
};

const alertBadge = (level: "ok" | "warn" | "critical" | null) => {
  if (!level || level === "ok") return null;
  return (
    <span style={{
      fontSize: 7, padding: "1px 4px", borderRadius: 3, fontWeight: 700, animation: level === "critical" ? "pulse 1s infinite" : undefined,
      background: level === "critical" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
      color: level === "critical" ? "#EF4444" : "#F59E0B",
    }}>
      {level === "critical" ? "CRITICAL" : "WARN"}
    </span>
  );
};

const btnS: React.CSSProperties = {
  padding: "3px 6px", border: "none", borderRadius: "var(--radius-sm)",
  fontSize: 9, cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 3,
};

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  const barColor = value > 90 ? "#EF4444" : value > 80 ? "#F59E0B" : color;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "var(--text-muted)", marginBottom: 2 }}>
        <span>{label}</span><span style={{ color: barColor, fontWeight: value > 80 ? 700 : 400 }}>{value.toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, background: "var(--bg-active)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ── Main Component ──

export function ServerMapPanel() {
  const t = useT();
  const { sshConnections } = useAppStore();
  const [scans, setScans] = useState<Map<string, ServerScan>>(new Map());
  const [scanning, setScanning] = useState<string | null>(null);
  const [actionOutput, setActionOutput] = useState<{ title: string; content: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaveFn, setEditSaveFn] = useState<((content: string) => string) | null>(null);
  const [editConn, setEditConn] = useState<SSHConnection | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["docker", "systemd", "port"]));
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{ conn: SSHConnection; password: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{conn: SSHConnection, action: SmartAction} | null>(null);
  const credCacheRef = useRef<Map<string, { password: string | null; privateKey: string | null }>>(new Map());

  // Multi-exec state
  const [multiExecOpen, setMultiExecOpen] = useState(false);
  const [multiCmd, setMultiCmd] = useState("");
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [multiRunning, setMultiRunning] = useState(false);
  const [multiResults, setMultiResults] = useState<Array<{ server: string; output: string; error: boolean; duration: number }>>([]);
  const [multiCmdHistory, setMultiCmdHistory] = useState<string[]>([]);

  const getCredentials = useCallback(async (conn: SSHConnection): Promise<{ password: string | null; privateKey: string | null } | null> => {
    const cached = credCacheRef.current.get(conn.id);
    if (cached) return cached;
    if (conn.privateKey) { const c = { password: null, privateKey: conn.privateKey }; credCacheRef.current.set(conn.id, c); return c; }
    if (conn.sessionPassword) { const c = { password: conn.sessionPassword, privateKey: null }; credCacheRef.current.set(conn.id, c); return c; }
    try {
      const { invoke } = await getTauriCore();
      const keychainPass = await invoke<string | null>("keychain_get_password", { connectionId: conn.id });
      if (keychainPass) { const c = { password: keychainPass, privateKey: null }; credCacheRef.current.set(conn.id, c); return c; }
    } catch {}
    return null;
  }, []);

  const scanServer = useCallback(async (conn: SSHConnection, password?: string) => {
    setScanning(conn.id);
    try {
      const creds = password ? { password, privateKey: null } : await getCredentials(conn);
      if (!creds) { setPasswordPrompt({ conn, password: "" }); setScanning(null); return; }
      if (password) credCacheRef.current.set(conn.id, creds);
      const { invoke } = await getTauriCore();
      const connArgs = { host: conn.host, port: conn.port, username: conn.username, password: creds.password, privateKey: creds.privateKey };
      const [services, sysInfo, stats] = await Promise.allSettled([
        invoke<DetectedService[]>("server_map_scan", connArgs),
        invoke<ServerSystemInfo>("server_map_system_info", connArgs),
        invoke<ServerQuickStats>("server_map_quick_stats", connArgs),
      ]);
      setScans((prev) => {
        const next = new Map(prev);
        next.set(conn.id, {
          connectionId: conn.id, connectionName: conn.name,
          services: services.status === "fulfilled" ? services.value : [],
          scannedAt: Date.now(),
          systemInfo: sysInfo.status === "fulfilled" ? sysInfo.value : undefined,
          quickStats: stats.status === "fulfilled" ? stats.value : undefined,
        });
        return next;
      });
      setExpanded((prev) => new Set(prev).add(conn.id));
    } catch (e) {
      setActionOutput({ title: `Scan failed: ${conn.name}`, content: String(e) });
    }
    setScanning(null);
  }, [getCredentials]);

  // Auto-refresh with stable refs to avoid setInterval leak
  const scansRef = useRef(scans);
  scansRef.current = scans;
  const sshConnectionsRef = useRef(sshConnections);
  sshConnectionsRef.current = sshConnections;
  const scanServerRef = useRef(scanServer);
  scanServerRef.current = scanServer;
  const scanningRef = useRef(scanning);
  scanningRef.current = scanning;

  useEffect(() => {
    if (!autoRefresh) { setCountdown(30); return; }
    let count = 30;
    setCountdown(30);
    const timer = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        count = 30;
        setCountdown(30);
        scansRef.current.forEach((_s, connId) => {
          const conn = sshConnectionsRef.current.find((c) => c.id === connId);
          if (conn && !scanningRef.current) scanServerRef.current(conn);
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefresh]); // Only depends on the toggle — stable interval

  const refreshStats = async (conn: SSHConnection) => {
    const creds = await getCredentials(conn);
    if (!creds) return;
    try {
      const { invoke } = await getTauriCore();
      const stats = await invoke<ServerQuickStats>("server_map_quick_stats", {
        host: conn.host, port: conn.port, username: conn.username,
        password: creds.password, privateKey: creds.privateKey,
      });
      setScans((prev) => {
        const next = new Map(prev);
        const existing = next.get(conn.id);
        if (existing) next.set(conn.id, { ...existing, quickStats: stats });
        return next;
      });
    } catch {}
  };

  const submitPassword = () => { if (!passwordPrompt) return; scanServer(passwordPrompt.conn, passwordPrompt.password); setPasswordPrompt(null); };

  // Multi-server command execution
  const runMultiExec = async () => {
    if (!multiCmd.trim() || multiSelected.size === 0 || multiRunning) return;
    const cmd = multiCmd.trim();
    const serverCount = multiSelected.size;
    if (!window.confirm(`Execute "${cmd}" on ${serverCount} server(s)? This cannot be undone.`)) return;
    setMultiRunning(true);
    setMultiResults([]);
    setMultiCmdHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 20));

    const targets = sshConnections.filter((c) => multiSelected.has(c.id));
    const { invoke } = await getTauriCore();

    // Execute on all selected servers in parallel
    const promises = targets.map(async (conn) => {
      const start = Date.now();
      try {
        const creds = await getCredentials(conn);
        if (!creds) return { server: conn.name, output: "No credentials available", error: true, duration: 0 };
        const output = await invoke<string>("ssh_exec", {
          host: conn.host, port: conn.port, username: conn.username,
          password: creds.password, privateKey: creds.privateKey, command: cmd,
        });
        return { server: conn.name, output: output || "(no output)", error: false, duration: Date.now() - start };
      } catch (e) {
        return { server: conn.name, output: String(e), error: true, duration: Date.now() - start };
      }
    });

    const results = await Promise.all(promises);
    setMultiResults(results);
    setMultiRunning(false);
  };

  const toggleMultiSelect = (id: string) => {
    setMultiSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAllServers = () => {
    setMultiSelected(new Set(sshConnections.map((c) => c.id)));
  };

  const isDestructiveAction = (action: SmartAction): boolean => {
    const label = action.label.toLowerCase();
    return label.includes("restart") || label.includes("stop") || label.includes("kill");
  };

  const runAction = async (conn: SSHConnection, action: SmartAction) => {
    if (action.copyOnly) {
      navigator.clipboard.writeText(action.cmd).then(() => {
        setCopiedCmd(action.label);
        setTimeout(() => setCopiedCmd(null), 2000);
      });
      return;
    }
    // Require confirmation for destructive actions and config saves
    if ((isDestructiveAction(action) || (action.editable && action.saveCmdFn)) && !confirmAction) {
      setConfirmAction({ conn, action });
      return;
    }
    setConfirmAction(null);
    setActionLoading(true);
    setActionOutput({ title: action.label, content: t("common.loading") });
    setEditMode(false);
    try {
      const creds = await getCredentials(conn);
      if (!creds) { setActionOutput({ title: "Error", content: t("servermap.noCredentials") }); setActionLoading(false); return; }
      const { invoke } = await getTauriCore();
      const output = await invoke<string>("ssh_exec", {
        host: conn.host, port: conn.port, username: conn.username,
        password: creds.password, privateKey: creds.privateKey, command: action.cmd,
      });
      setActionOutput({ title: action.label, content: output || "(no output)" });
      // If editable, set up edit mode
      if (action.editable && action.saveCmdFn) {
        setEditContent(output || "");
        setEditSaveFn(() => action.saveCmdFn!);
        setEditConn(conn);
        setEditMode(true);
      }
    } catch (e) {
      setActionOutput({ title: `${action.label} failed`, content: String(e) });
    }
    setActionLoading(false);
  };

  const saveEditedConfig = async () => {
    if (!editSaveFn || !editConn) return;
    setSaving(true);
    try {
      // Save config version history before overwriting
      const configTitle = actionOutput?.title || "Config";
      useAppStore.getState().addConfigVersion({
        connectionId: editConn.id, serverName: editConn.name,
        filePath: configTitle, content: editContent,
      });

      const creds = await getCredentials(editConn);
      if (!creds) { setSaving(false); return; }
      const { invoke } = await getTauriCore();
      const saveCmd = editSaveFn(editContent);
      const output = await invoke<string>("ssh_exec", {
        host: editConn.host, port: editConn.port, username: editConn.username,
        password: creds.password, privateKey: creds.privateKey, command: saveCmd,
      });
      setActionOutput((prev) => prev ? { ...prev, content: output || "Saved successfully" } : null);
      setEditMode(false);
    } catch (e) {
      setActionOutput((prev) => prev ? { ...prev, content: `Save failed: ${e}` } : null);
    }
    setSaving(false);
  };

  const runSecurityAudit = async (conn: SSHConnection) => {
    const cmd = `echo "=== SSH Config ===" && grep -E 'PermitRootLogin|PasswordAuthentication|Port |AllowUsers|MaxAuthTries' /etc/ssh/sshd_config 2>/dev/null; echo "\\n=== Failed Logins (last 10) ===" && journalctl _SYSTEMD_UNIT=sshd.service --no-pager -n 10 -p warning 2>/dev/null || tail -10 /var/log/auth.log 2>/dev/null; echo "\\n=== Firewall ===" && sudo ufw status 2>/dev/null || sudo iptables -L -n --line-numbers 2>/dev/null | head -25; echo "\\n=== Listening Ports ===" && ss -tlnp 2>/dev/null | head -20; echo "\\n=== Last Logins ===" && last -10 2>/dev/null; echo "\\n=== Updates Available ===" && apt list --upgradable 2>/dev/null | head -10 || yum check-update 2>/dev/null | head -10`;
    runAction(conn, { label: "Security Audit", icon: <Shield size={8} />, cmd });
  };

  const toggleExpand = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (key: string) => setExpandedGroups((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleService = (key: string) => setExpandedService((p) => p === key ? null : key);

  // Filter services across all servers — memoized
  const searchLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);
  const filterServices = useCallback((svcs: DetectedService[]) => {
    if (!searchLower) return svcs;
    return svcs.filter((s) => s.name.toLowerCase().includes(searchLower) || s.kind.includes(searchLower) || s.detail.toLowerCase().includes(searchLower) || (s.port && String(s.port).includes(searchLower)));
  }, [searchLower]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {/* Confirmation dialog for destructive actions */}
      {confirmAction && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 16, maxWidth: 400, width: "90%" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
              <AlertTriangle size={14} style={{ color: "#F59E0B", marginRight: 6, verticalAlign: "middle" }} />
              Confirm Action
            </div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 12px 0" }}>
              Are you sure you want to <strong>{confirmAction.action.label}</strong> on <strong>{confirmAction.conn.name}</strong>?
            </p>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmAction(null)} style={{ ...btnS, padding: "4px 12px", background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={() => runAction(confirmAction.conn, confirmAction.action)} style={{ ...btnS, padding: "4px 12px", background: "rgba(239,68,68,0.2)", color: "#EF4444", fontWeight: 600 }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexShrink: 0 }}>
        <span className="sidebar-section-title" style={{ margin: 0 }}>{t("servermap.title")}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {copiedCmd && <span style={{ fontSize: 8, color: "var(--accent-secondary)" }}>{t("servermap.copied")}</span>}
          {autoRefresh && <span style={{ fontSize: 8, color: "var(--accent-primary)" }}>{countdown}s</span>}
          <button onClick={() => setMultiExecOpen(!multiExecOpen)} title="Multi-server command"
            style={{ ...btnS, padding: "3px 8px", background: multiExecOpen ? "var(--accent-secondary)" : "var(--bg-tertiary)", color: multiExecOpen ? "white" : "var(--text-secondary)" }}>
            <Terminal size={9} /> {t("servermap.multi")}
          </button>
          <button onClick={() => setAutoRefresh(!autoRefresh)} title={autoRefresh ? "Stop auto-refresh" : "Auto-refresh 30s"}
            style={{ ...btnS, padding: "3px 8px", background: autoRefresh ? "var(--accent-primary)" : "var(--bg-tertiary)", color: autoRefresh ? "white" : "var(--text-secondary)" }}>
            <Timer size={9} /> {autoRefresh ? t("servermap.live") : t("servermap.auto")}
          </button>
        </div>
      </div>

      {/* Multi-server exec panel */}
      {multiExecOpen && (
        <div style={{ flexShrink: 0, marginBottom: 6, padding: 8, background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent-secondary)" }}>
          {/* Command input */}
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Terminal size={10} style={{ position: "absolute", left: 6, top: 7, color: "var(--text-muted)" }} />
              <input value={multiCmd} onChange={(e) => setMultiCmd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) runMultiExec(); }}
                placeholder={t("servermap.multiServerCmd")}
                style={{ width: "100%", padding: "5px 8px 5px 22px", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", outline: "none" }}
              />
            </div>
            <button onClick={runMultiExec} disabled={multiRunning || multiSelected.size === 0 || !multiCmd.trim()}
              style={{ ...btnS, padding: "5px 12px", background: multiSelected.size > 0 && multiCmd.trim() ? "var(--accent-secondary)" : "var(--bg-active)", color: multiSelected.size > 0 && multiCmd.trim() ? "white" : "var(--text-muted)" }}>
              {multiRunning ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={10} />}
              Run ({multiSelected.size})
            </button>
          </div>

          {/* Quick command history */}
          {multiCmdHistory.length > 0 && (
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 6 }}>
              {multiCmdHistory.slice(0, 8).map((cmd, i) => (
                <button key={i} onClick={() => setMultiCmd(cmd)}
                  style={{ ...btnS, padding: "2px 6px", background: "var(--bg-active)", color: "var(--text-secondary)", fontSize: 8, fontFamily: "'JetBrains Mono', monospace", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cmd}
                </button>
              ))}
            </div>
          )}

          {/* Server selection */}
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={selectAllServers} style={{ ...btnS, padding: "2px 6px", background: "var(--bg-active)", color: "var(--accent-primary)", fontSize: 8 }}>
              {t("common.selectAll")}
            </button>
            <button onClick={() => setMultiSelected(new Set())} style={{ ...btnS, padding: "2px 6px", background: "var(--bg-active)", color: "var(--text-muted)", fontSize: 8 }}>
              {t("common.none")}
            </button>
            <span style={{ width: 1, height: 12, background: "var(--border-subtle)" }} />
            {sshConnections.map((conn) => (
              <label key={conn.id} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "var(--text-primary)", cursor: "pointer", padding: "2px 6px", borderRadius: "var(--radius-sm)", background: multiSelected.has(conn.id) ? "rgba(63,185,80,0.15)" : "var(--bg-active)" }}>
                <input type="checkbox" checked={multiSelected.has(conn.id)} onChange={() => toggleMultiSelect(conn.id)}
                  style={{ width: 10, height: 10, accentColor: "var(--accent-secondary)" }} />
                {conn.name}
              </label>
            ))}
          </div>

          {/* Results */}
          {multiResults.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 300, overflowY: "auto" }} className="hacking-log-container">
              {multiResults.map((r, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.error ? "#EF4444" : "#10B981" }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)" }}>{r.server}</span>
                    <span style={{ fontSize: 8, color: "var(--text-muted)" }}>{r.duration}ms</span>
                    <button onClick={() => navigator.clipboard.writeText(r.output)} title="Copy" style={{ ...btnS, background: "none", color: "var(--text-muted)", padding: "1px", marginLeft: "auto" }}><Copy size={8} /></button>
                  </div>
                  <pre style={{
                    margin: 0, padding: "6px 8px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                    background: r.error ? "rgba(239,68,68,0.05)" : "var(--bg-secondary)",
                    border: `1px solid ${r.error ? "rgba(239,68,68,0.2)" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-sm)", color: r.error ? "#EF4444" : "var(--text-primary)",
                    whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 120, overflow: "auto",
                  }}>
                    {r.output}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search bar */}
      {scans.size > 0 && (
        <div style={{ position: "relative", marginBottom: 6, flexShrink: 0 }}>
          <Search size={10} style={{ position: "absolute", left: 8, top: 7, color: "var(--text-muted)" }} />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("servermap.searchServices")}
            style={{ width: "100%", padding: "5px 8px 5px 24px", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 10, fontFamily: "inherit", outline: "none" }}
          />
        </div>
      )}

      {/* Password prompt */}
      {passwordPrompt && (
        <div style={{ padding: 10, background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", marginBottom: 8, border: "1px solid var(--accent-primary)", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>{t("servermap.passwordFor", { name: passwordPrompt.conn.name })}</div>
          <input type="password" value={passwordPrompt.password}
            onChange={(e) => setPasswordPrompt({ ...passwordPrompt, password: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") submitPassword(); }}
            placeholder={t("servermap.passwordPlaceholder")} autoFocus
            style={{ width: "100%", padding: "6px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 11, fontFamily: "inherit", outline: "none", marginBottom: 6 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={submitPassword} style={{ ...btnS, flex: 1, justifyContent: "center", background: "var(--accent-primary)", color: "white", padding: "6px" }}><Play size={10} /> {t("common.scan")}</button>
            <button onClick={() => setPasswordPrompt(null)} style={{ ...btnS, background: "var(--bg-active)", color: "var(--text-secondary)", padding: "6px" }}><X size={10} /></button>
          </div>
        </div>
      )}

      {/* Action output modal — editable for config actions */}
      {actionOutput && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", flexDirection: "column", padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
              {actionLoading && <Loader2 size={12} style={{ display: "inline", animation: "spin 1s linear infinite", marginRight: 6 }} />}
              {saving && <Loader2 size={12} style={{ display: "inline", animation: "spin 1s linear infinite", marginRight: 6 }} />}
              {actionOutput.title}
              {editMode && <span style={{ fontSize: 9, color: "#3fb950", marginLeft: 8, fontWeight: 400 }}>EDIT MODE</span>}
            </span>
            {editMode && (
              <button onClick={saveEditedConfig} disabled={saving}
                style={{ ...btnS, background: "#3fb950", color: "white", padding: "4px 10px", fontWeight: 600 }}>
                <Save size={10} /> Save
              </button>
            )}
            {editMode && (
              <button onClick={() => setEditMode(false)}
                style={{ ...btnS, background: "var(--bg-tertiary)", color: "var(--text-secondary)", padding: "4px 8px" }}>
                Cancel Edit
              </button>
            )}
            <button onClick={() => navigator.clipboard.writeText(editMode ? editContent : actionOutput.content)} title="Copy"
              style={{ ...btnS, background: "var(--bg-tertiary)", color: "var(--text-secondary)", padding: "4px 8px" }}><Copy size={10} /></button>
            <button onClick={() => { setActionOutput(null); setEditMode(false); }}
              style={{ ...btnS, background: "var(--bg-tertiary)", color: "var(--text-secondary)", padding: "4px 8px" }}><X size={12} /> {t("common.close")}</button>
          </div>
          {editMode ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, resize: "none", background: "#1e1e1e", borderRadius: "var(--radius-sm)",
                border: "1px solid #3fb950", padding: 10, fontSize: 12, color: "#d4d4d4",
                fontFamily: "'JetBrains Mono', monospace", outline: "none", lineHeight: 1.5,
              }}
            />
          ) : (
            <pre style={{
              flex: 1, overflow: "auto", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)", padding: 10, fontSize: 11, color: "var(--text-primary)",
              fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0,
            }}>
              {actionOutput.content}
            </pre>
          )}
        </div>
      )}

      {/* Server list */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }} className="hacking-log-container">
        {sshConnections.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 24, fontSize: 12 }}>
            <Server size={24} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
            <div>{t("servermap.noSshConnections")}</div>
            <div style={{ marginTop: 4 }}>{t("servermap.addFirst")}</div>
          </div>
        ) : (
          sshConnections.map((conn) => {
            const scan = scans.get(conn.id);
            const isExpanded = expanded.has(conn.id);
            const isScanning = scanning === conn.id;
            const alert = alertLevel(scan?.quickStats);
            const filteredServices = scan ? filterServices(scan.services) : [];
            const groups = scan ? {
              docker: filteredServices.filter((s) => s.kind === "docker"),
              systemd: filteredServices.filter((s) => s.kind === "systemd"),
              port: filteredServices.filter((s) => s.kind === "port"),
            } : null;

            return (
              <div key={conn.id} style={{ marginBottom: 10 }}>
                {/* Server header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 10px",
                  background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)",
                  border: `1px solid ${alert === "critical" ? "#EF4444" : alert === "warn" ? "#F59E0B" : scan ? "var(--accent-secondary)" : "var(--border-subtle)"}`,
                  cursor: "pointer",
                }} onClick={() => scan && toggleExpand(conn.id)}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: scan ? "#10B981" : "var(--text-muted)" }} />
                  <Server size={14} style={{ color: scan ? "var(--accent-secondary)" : "var(--accent-primary)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                      {conn.name} {alertBadge(alert)}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                      {conn.username}@{conn.host}:{conn.port}
                      {scan && ` \u2014 ${scan.services.length} services`}
                    </div>
                  </div>
                  {scan && (isExpanded ? <ChevronDown size={12} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={12} style={{ color: "var(--text-muted)" }} />)}
                  {scan && (
                    <button onClick={(e) => { e.stopPropagation(); runSecurityAudit(conn); }} title={t("servermap.securityAudit")}
                      style={{ ...btnS, background: "rgba(139,92,246,0.1)", color: "#8B5CF6", padding: "4px 6px" }}>
                      <Lock size={9} />
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); scanServer(conn); }} disabled={isScanning}
                    style={{ ...btnS, background: "var(--accent-primary)", color: "white", opacity: isScanning ? 0.5 : 1, padding: "4px 8px" }}>
                    {isScanning ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={10} />}
                    {scan ? t("infra.rescan") : t("common.scan")}
                  </button>
                </div>

                {/* Expanded content */}
                {scan && isExpanded && (
                  <div style={{ marginTop: 4, marginLeft: 8, borderLeft: "2px solid var(--border-subtle)", paddingLeft: 8 }}>
                    {/* System info */}
                    {scan.systemInfo && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "5px 8px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: 4, fontSize: 9, color: "var(--text-muted)" }}>
                        {scan.systemInfo.os && <span><Cpu size={8} style={{ verticalAlign: "middle" }} /> {scan.systemInfo.os}</span>}
                        {scan.systemInfo.uptime && <span><Timer size={8} style={{ verticalAlign: "middle" }} /> {scan.systemInfo.uptime}</span>}
                        {scan.systemInfo.cpu_count && <span>{scan.systemInfo.cpu_count} CPUs</span>}
                        {scan.systemInfo.ram_usage && <span><MemoryStick size={8} style={{ verticalAlign: "middle" }} /> {scan.systemInfo.ram_usage}</span>}
                        {scan.systemInfo.disk_usage && <span><HardDrive size={8} style={{ verticalAlign: "middle" }} /> {scan.systemInfo.disk_usage}</span>}
                      </div>
                    )}

                    {/* Stats bars */}
                    {scan.quickStats && (
                      <div style={{ display: "flex", gap: 8, padding: "5px 8px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: 4, alignItems: "center" }}>
                        <ProgressBar value={parseFloat(scan.quickStats.cpu_percent) || 0} color="#3B82F6" label="CPU" />
                        <ProgressBar value={parseFloat(scan.quickStats.mem_percent) || 0} color="#8B5CF6" label="RAM" />
                        <ProgressBar value={parseFloat(scan.quickStats.disk_percent) || 0} color="#F59E0B" label="Disk" />
                        {scan.quickStats.load_avg && <span style={{ fontSize: 7, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Load: {scan.quickStats.load_avg}</span>}
                        <button onClick={() => refreshStats(conn)} title="Refresh stats" style={{ ...btnS, background: "none", color: "var(--text-muted)", padding: "1px" }}><Activity size={8} /></button>
                      </div>
                    )}

                    {/* Service groups */}
                    {groups && (["docker", "systemd", "port"] as const).map((kind) => {
                      const svcs = groups[kind];
                      if (svcs.length === 0) return null;
                      const isGroupOpen = expandedGroups.has(kind);
                      const label = kind === "docker" ? t("servermap.dockerContainers") : kind === "systemd" ? t("servermap.systemdServices") : t("servermap.listeningPorts");
                      const runningCount = svcs.filter((s) => statusColor(s.status) === "#10B981").length;
                      const badgeColor = kind === "docker" ? "#2496ED" : kind === "systemd" ? "#10B981" : "#8B5CF6";

                      return (
                        <div key={kind} style={{ marginBottom: 3 }}>
                          <div onClick={() => toggleGroup(kind)} style={{
                            display: "flex", alignItems: "center", gap: 5, padding: "3px 6px",
                            cursor: "pointer", fontSize: 10, fontWeight: 600, color: badgeColor,
                          }}>
                            {isGroupOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                            {label}
                            <span style={{ fontSize: 8, fontWeight: 400, color: "var(--text-muted)" }}>{runningCount}/{svcs.length}</span>
                          </div>

                          {isGroupOpen && svcs.map((svc, i) => {
                            const svcKey = `${conn.id}-${svc.name}-${svc.port}-${i}`;
                            const isServiceExpanded = expandedService === svcKey;
                            const actions = getSmartActions(svc);

                            return (
                              <div key={svcKey} style={{ marginBottom: 2 }}>
                                <div onClick={() => toggleService(svcKey)} style={{
                                  display: "flex", alignItems: "center", gap: 5, padding: "4px 6px",
                                  background: isServiceExpanded ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                                  borderRadius: "var(--radius-sm)", fontSize: 11, cursor: "pointer",
                                  borderLeft: `3px solid ${statusColor(svc.status)}`,
                                }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: statusColor(svc.status) }} />
                                  {serviceIcon(svc.kind, svc.name)}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{svc.name}</span>
                                    {svc.port != null && <span style={{ color: "var(--text-muted)", marginLeft: 3 }}>:{svc.port}</span>}
                                    {svc.detail && <div style={{ fontSize: 8, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc.detail}</div>}
                                  </div>
                                  {isServiceExpanded ? <ChevronDown size={9} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={9} style={{ color: "var(--text-muted)" }} />}
                                </div>

                                {/* Expanded smart actions */}
                                {isServiceExpanded && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "4px 6px 4px 14px", background: "var(--bg-tertiary)", borderRadius: "0 0 var(--radius-sm) var(--radius-sm)" }}>
                                    {actions.map((action, j) => {
                                      const isDanger = action.label === "Stop" || action.label === "Restart";
                                      const isCopy = action.copyOnly;
                                      return (
                                        <button key={j} onClick={() => runAction(conn, action)} title={isCopy ? `Copy: ${action.cmd}` : action.label}
                                          style={{
                                            ...btnS, padding: "3px 7px",
                                            background: isDanger ? (action.label === "Stop" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)")
                                              : isCopy ? "rgba(139,92,246,0.1)" : "var(--bg-active)",
                                            color: isDanger ? (action.label === "Stop" ? "#EF4444" : "#F59E0B")
                                              : isCopy ? "#8B5CF6" : "var(--text-secondary)",
                                          }}>
                                          {action.icon} {action.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {/* Top processes */}
                    {scan.quickStats && scan.quickStats.top_processes.length > 0 && (
                      <div style={{ marginTop: 3, padding: "3px 6px", fontSize: 8, color: "var(--text-muted)" }}>
                        <span style={{ fontWeight: 600 }}>{t("servermap.topProcesses")} </span>
                        {scan.quickStats.top_processes.map((p, i) => <span key={i} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p}{i < scan.quickStats!.top_processes.length - 1 ? " | " : ""}</span>)}
                      </div>
                    )}

                    <div style={{ fontSize: 7, color: "var(--text-muted)", paddingTop: 3 }}>
                      Scanned {new Date(scan.scannedAt).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
