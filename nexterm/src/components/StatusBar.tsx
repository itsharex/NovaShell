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
  const navigationStacks = useAppStore((s) => s.navigationStacks);
  const sshConnections = useAppStore((s) => s.sshConnections);
  const infraAlertCount = useAppStore((s) => s.infraAlerts.filter((a) => !a.acknowledged).length);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const t = useT();

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
          const stack = navigationStacks[activeTabId];
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
