import { useEffect, useState } from "react";
import {
  GitBranch,
  Clock,
  Zap,
  Terminal,
  Palette,
  Columns,
  Rows3,
  Square,
  Server,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useT } from "../i18n";

export function StatusBar() {
  const activeTabId = useAppStore((s) => s.activeTabId);
  const tabs = useAppStore((s) => s.tabs);
  const theme = useAppStore((s) => s.theme);
  const setSystemStats = useAppStore((s) => s.setSystemStats);
  const gitBranch = useAppStore((s) => s.gitBranch);
  const setGitBranch = useAppStore((s) => s.setGitBranch);
  const splitMode = useAppStore((s) => s.splitMode);
  const setSplitMode = useAppStore((s) => s.setSplitMode);
  const addTab = useAppStore((s) => s.addTab);
  const hackingMode = useAppStore((s) => s.hackingMode);
  const hackingAlertCount = useAppStore((s) => s.hackingAlerts.length);
  const activeNavStack = useAppStore((s) => s.navigationStacks[s.activeTabId]);
  const sshConnections = useAppStore((s) => s.sshConnections);
  const infraAlertCount = useAppStore((s) => {
    let count = 0;
    for (const a of s.infraAlerts) { if (!a.acknowledged) count++; }
    return count;
  });
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const executeSnippet = useAppStore((s) => s.executeSnippet);
  // Access full arrays only on-demand via getState() to avoid re-renders on every alert change
  const getInfraAlerts = () => useAppStore.getState().infraAlerts;
  const getHackingAlerts = () => useAppStore.getState().hackingAlerts;
  const t = useT();
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Unified notification count
  const totalAlerts = infraAlertCount + hackingAlertCount;

  const [time, setTime] = useState(new Date());

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Clock - update every 30 seconds (HH:MM is enough for a status bar)
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Git branch + system stats - single effect
  useEffect(() => {
    let invokeCache: typeof import("@tauri-apps/api/core")["invoke"] | null = null;
    const getInvoke = async () => {
      if (!invokeCache) invokeCache = (await import("@tauri-apps/api/core")).invoke;
      return invokeCache;
    };

    const fetchBranch = async () => {
      try {
        const invoke = await getInvoke();
        const branch = await invoke<string>("get_git_branch", { path: null });
        setGitBranch(branch);
      } catch {
        setGitBranch("");
      }
    };
    fetchBranch();
    const branchInterval = setInterval(fetchBranch, 60000);

    const fetchStats = async () => {
      try {
        const invoke = await getInvoke();
        const stats = await invoke<{
          cpu_usage: number;
          memory_used: number;
          memory_total: number;
          memory_percent: number;
          processes_count: number;
        }>("get_system_info");
        setSystemStats({
          cpu: stats.cpu_usage,
          memoryUsed: stats.memory_used,
          memoryTotal: stats.memory_total,
          memoryPercent: stats.memory_percent,
          processes: stats.processes_count,
        });
      } catch {
        setSystemStats({
          cpu: 15 + Math.random() * 30,
          memoryUsed: 8_000_000_000 + Math.random() * 2_000_000_000,
          memoryTotal: 16_000_000_000,
          memoryPercent: 50 + Math.random() * 15,
          processes: 130 + Math.floor(Math.random() * 30),
        });
      }
    };
    fetchStats();
    const statsInterval = setInterval(fetchStats, 60000);
    return () => { clearInterval(branchInterval); clearInterval(statsInterval); };
  }, [setGitBranch, setSystemStats]);

  const getShellLabel = (shellType: string) => {
    const lower = shellType.toLowerCase();
    if (lower.includes("powershell")) return "PowerShell";
    if (lower.includes("cmd")) return "CMD";
    if (lower.includes("zsh")) return "Zsh";
    if (lower.includes("fish")) return "Fish";
    if (lower.includes("wsl")) return "WSL";
    if (lower.includes("bash")) return "Bash";
    // Extract filename from path as fallback
    const name = shellType.split(/[/\\]/).pop()?.replace(/\.exe$/i, "") || "Shell";
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const cycleSplit = () => {
    const modes: Array<"none" | "horizontal" | "vertical"> = ["none", "vertical", "horizontal"];
    const current = modes.indexOf(splitMode);
    const next = modes[(current + 1) % modes.length];
    if (next !== "none" && tabs.length < 2) {
      addTab(activeTab?.shellType);
    }
    setSplitMode(next);
  };

  const SplitIcon = splitMode === "vertical" ? Columns : splitMode === "horizontal" ? Rows3 : Square;

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <div className="statusbar-item">
          <span className="statusbar-indicator" />
          <span>{t("statusbar.ready")}</span>
        </div>
        <div className="statusbar-item">
          <Terminal size={12} />
          <span>{getShellLabel(activeTab?.shellType || "shell")}</span>
        </div>
        {gitBranch && (
          <div className="statusbar-item">
            <GitBranch size={12} />
            <span>{gitBranch}</span>
          </div>
        )}
        {(() => {
          const stack = activeNavStack;
          if (stack && stack.length > 0) {
            const current = stack[stack.length - 1];
            const conn = current.connectionId
              ? sshConnections.find((c) => c.id === current.connectionId)
              : null;
            const isRemote = current.type === "ssh";
            const serverLabel = conn ? conn.name : current.serverName;
            const hostLabel = conn ? conn.host : "";

            // Build breadcrumb from stack (already includes local at bottom if present)
            const breadcrumb = stack.map((s) => s.serverName);

            return (
              <div className="statusbar-item" style={{ color: isRemote ? "#58a6ff" : "#3fb950", gap: 6 }}>
                <Server size={12} />
                <span style={{ fontWeight: 600 }}>{serverLabel}</span>
                {hostLabel && (
                  <span style={{ color: "var(--text-muted)", fontSize: 9 }}>{hostLabel}</span>
                )}
                {stack.length > 1 && (
                  <span style={{
                    color: "var(--text-muted)",
                    fontSize: 9,
                    background: "var(--bg-tertiary)",
                    padding: "1px 6px",
                    borderRadius: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                  }}>
                    {breadcrumb.map((name, i) => (
                      <span key={i}>
                        {i > 0 && <span style={{ opacity: 0.5 }}> → </span>}
                        <span style={i === breadcrumb.length - 1 ? { color: "#58a6ff", fontWeight: 600 } : undefined}>
                          {name}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          }
          return null;
        })()}
        {infraAlertCount > 0 && (
          <div className="statusbar-item" style={{ color: "#ff7b72" }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#ff7b72", display: "inline-block",
              boxShadow: "0 0 6px #ff7b72",
              animation: "pulse 2s infinite",
            }} />
            <span>{t("statusbar.infra")} {infraAlertCount}</span>
          </div>
        )}
        {hackingMode && (
          <div className="statusbar-item hacking-indicator" style={{ color: "#00ff41", fontWeight: 700, fontSize: 10 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#00ff41", display: "inline-block",
              boxShadow: "0 0 6px #00ff41",
            }} />
            <span>{t("statusbar.hackingMode")}</span>
            {hackingAlertCount > 0 && (
              <span style={{
                background: "#ff0040", color: "#fff", borderRadius: 8,
                padding: "0 5px", fontSize: 9, fontWeight: 700, marginLeft: 4,
              }}>
                {hackingAlertCount}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="statusbar-right">
        {/* Notification Center */}
        {totalAlerts > 0 && (
          <div style={{ position: "relative" }}>
            <button className="statusbar-btn" onClick={() => setNotifOpen(!notifOpen)} title="Notifications"
              style={{ position: "relative", color: "#ff7b72" }}>
              <span style={{ fontSize: 12 }}>&#128276;</span>
              <span style={{
                position: "absolute", top: 0, right: 0, width: 14, height: 14,
                background: "#ff7b72", color: "#fff", borderRadius: "50%",
                fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{totalAlerts > 9 ? "9+" : totalAlerts}</span>
            </button>
            {notifOpen && (
              <div style={{
                position: "absolute", bottom: 28, right: 0, width: 300,
                background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)", boxShadow: "0 -4px 16px rgba(0,0,0,0.4)",
                maxHeight: 300, overflow: "auto", zIndex: 200,
              }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
                  Notifications ({totalAlerts})
                </div>
                {getInfraAlerts().filter((a) => !a.acknowledged).slice(0, 10).map((a) => (
                  <div key={a.id} style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 10 }}>
                    <div style={{ color: a.severity === "critical" ? "#ff7b72" : "#d29922", fontWeight: 600 }}>
                      {a.serverName}: {a.message}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 9 }}>
                      {new Date(a.timestamp).toLocaleTimeString()} — Infra {a.metric}
                    </div>
                  </div>
                ))}
                {getHackingAlerts().slice(0, 5).map((a) => (
                  <div key={a.id} style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 10 }}>
                    <div style={{ color: a.severity === "critical" ? "#ff7b72" : "#d29922", fontWeight: 600 }}>
                      {a.title}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 9 }}>
                      {new Date(a.timestamp).toLocaleTimeString()} — Security
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Quick Connect */}
        {sshConnections.length > 0 && (
          <div style={{ position: "relative" }}>
            <button className="statusbar-btn" onClick={() => setQuickConnectOpen(!quickConnectOpen)} title="Quick Connect">
              <Server size={12} />
              <span style={{ fontSize: 10 }}>{sshConnections.filter((c) => c.status === "connected").length}/{sshConnections.length}</span>
            </button>
            {quickConnectOpen && (
              <div style={{
                position: "absolute", bottom: 28, right: 0, width: 220,
                background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)", boxShadow: "0 -4px 16px rgba(0,0,0,0.4)",
                padding: 4, zIndex: 200,
              }}>
                {sshConnections.map((conn) => (
                  <button key={conn.id}
                    onClick={() => {
                      if (executeSnippet) executeSnippet(`cd ${conn.name}:~`);
                      setQuickConnectOpen(false);
                    }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 10px", border: "none", background: "transparent",
                      color: "var(--text-primary)", fontSize: 11, fontFamily: "inherit",
                      cursor: "pointer", borderRadius: "var(--radius-sm)", textAlign: "left",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: conn.status === "connected" ? "#3fb950" : conn.status === "connecting" ? "#d29922" : "#484f58",
                    }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conn.name}</span>
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{conn.host}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="statusbar-btn" onClick={cycleSplit} title={`Split: ${splitMode}`}>
          <SplitIcon size={12} />
          <span style={{ textTransform: "capitalize" }}>{splitMode === "none" ? t("statusbar.noSplit") : splitMode === "vertical" ? t("statusbar.splitVertical") : t("statusbar.splitHorizontal")}</span>
        </button>
        <div className="statusbar-item">
          <Palette size={12} />
          <span style={{ textTransform: "capitalize" }}>{theme}</span>
        </div>
        <div className="statusbar-item">
          <Zap size={12} />
          <span>{t("statusbar.utf8")}</span>
        </div>
        <button
          className="statusbar-btn"
          onClick={() => setLanguage(language === "en" ? "es" : "en")}
          title={t("lang.language")}
          style={{ fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {language === "en" ? "EN" : "ES"}
        </button>
        <div className="statusbar-item">
          <Clock size={12} />
          <span>{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
    </div>
  );
}
