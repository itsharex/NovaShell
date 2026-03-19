import { useState, useEffect, useCallback, memo } from "react";
import {
  Play,
  Square,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  ArrowUpDown,
  RefreshCw,
  Terminal,
  LayoutList,
  LayoutGrid,
  Clock,
  Trash2,
  Skull,
  FolderOpen,
  Eraser,
  HardDrive,
  Package,
  FileArchive,
  Database,
  Box,
  Shield,
  Search,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useT } from "../i18n";
import type { SSHConnection, ServerMetrics, InfraAlert, InfraTimelineEvent, DiskPartition, DiskCategory, DiskAnalysis, DiskLargestDir } from "../store/appStore";

let tauriCore: { invoke: typeof import("@tauri-apps/api/core")["invoke"] } | null = null;
let tauriEvent: { listen: typeof import("@tauri-apps/api/event")["listen"] } | null = null;

async function getTauriCore() {
  if (!tauriCore) tauriCore = await import("@tauri-apps/api/core");
  return tauriCore;
}
async function getTauriEvent() {
  if (!tauriEvent) tauriEvent = await import("@tauri-apps/api/event");
  return tauriEvent;
}

// ──── SVG Sparkline (zero dependencies) ────
const SparklineSVG = memo(function SparklineSVG({
  data,
  width = 120,
  height = 20,
  color = "#3fb950",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`
    )
    .join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
});

// ──── Metric Bar ────
const MetricBar = memo(function MetricBar({
  value,
  label,
  warningThreshold = 80,
  criticalThreshold = 95,
}: {
  value: number;
  label: string;
  warningThreshold?: number;
  criticalThreshold?: number;
}) {
  const color =
    value >= criticalThreshold
      ? "#ff7b72"
      : value >= warningThreshold
        ? "#d29922"
        : "#3fb950";
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
      <span style={{ width: 32, color: "var(--text-muted)", textAlign: "right" }}>{label}</span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--bg-tertiary)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ width: 36, color, fontWeight: 600, textAlign: "right" }}>
        {value.toFixed(0)}%
      </span>
    </div>
  );
});

// ──── Health Score ────
function healthScore(m: ServerMetrics): number {
  return Math.max(0, Math.min(100, Math.round(100 - (0.4 * m.cpu + 0.35 * m.memPercent + 0.25 * m.diskPercent))));
}

function healthColor(score: number): string {
  if (score > 70) return "#3fb950";
  if (score > 40) return "#d29922";
  return "#ff7b72";
}

// ──── Format bytes ────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(1)}GB`;
}

// ──── Server Card ────
function ServerCard({
  conn,
  metrics,
  latestMetric,
  thresholds,
  monitoring,
  onStart,
  onStop,
  onRemediation,
  compact,
}: {
  conn: SSHConnection;
  metrics: ServerMetrics[];
  latestMetric: ServerMetrics | null;
  thresholds: { cpuWarning: number; cpuCritical: number; memWarning: number; memCritical: number; diskWarning: number; diskCritical: number };
  monitoring: boolean;
  onStart: () => void;
  onStop: () => void;
  onRemediation: (action: string) => void;
  compact: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [killPidInput, setKillPidInput] = useState("");
  const [killConfirm, setKillConfirm] = useState<{ pid: string; signal: "SIGTERM" | "SIGKILL" } | null>(null);
  const [diskScanMode, setDiskScanMode] = useState(false);
  const m = latestMetric;
  const score = m ? healthScore(m) : 0;
  const scoreColor = healthColor(score);

  // Network rate calculation
  let netRxRate = 0;
  let netTxRate = 0;
  if (metrics.length >= 2) {
    const prev = metrics[metrics.length - 2];
    const curr = metrics[metrics.length - 1];
    const dt = (curr.timestamp - prev.timestamp) / 1000;
    if (dt > 0) {
      netRxRate = Math.max(0, (curr.netRxBytes - prev.netRxBytes) / dt);
      netTxRate = Math.max(0, (curr.netTxBytes - prev.netTxBytes) / dt);
    }
  }

  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-sm)",
          borderLeft: `3px solid ${m ? scoreColor : "var(--border-subtle)"}`,
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{conn.name}</span>
        {m ? (
          <>
            <span style={{ color: scoreColor, fontWeight: 700, fontSize: 11 }}>{score}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <MiniBar value={m.cpu} color={m.cpu >= thresholds.cpuCritical ? "#ff7b72" : m.cpu >= thresholds.cpuWarning ? "#d29922" : "#3fb950"} />
              <MiniBar value={m.memPercent} color={m.memPercent >= thresholds.memCritical ? "#ff7b72" : m.memPercent >= thresholds.memWarning ? "#d29922" : "#3fb950"} />
              <MiniBar value={m.diskPercent} color={m.diskPercent >= thresholds.diskCritical ? "#ff7b72" : m.diskPercent >= thresholds.diskWarning ? "#d29922" : "#3fb950"} />
            </div>
          </>
        ) : (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {monitoring ? "Loading..." : "Stopped"}
          </span>
        )}
        {!monitoring ? (
          <button onClick={(e) => { e.stopPropagation(); onStart(); }} style={btnStyle} title="Start monitoring">
            <Play size={12} />
          </button>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onStop(); }} style={btnStyle} title="Stop monitoring">
            <Square size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-subtle)",
        borderLeft: `3px solid ${m ? scoreColor : "var(--border-subtle)"}`,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          cursor: "pointer",
          gap: 8,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
          {conn.name}
          <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 10, marginLeft: 6 }}>
            {conn.host}
          </span>
        </span>
        {m && (
          <span style={{ color: scoreColor, fontWeight: 700, fontSize: 12 }}>
            {t("infra.score")}: {score}
          </span>
        )}
        {!monitoring ? (
          <button onClick={(e) => { e.stopPropagation(); onStart(); }} style={btnStyle} title="Start">
            <Play size={12} />
          </button>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onStop(); }} style={btnStyle} title="Stop">
            <Square size={12} />
          </button>
        )}
      </div>

      {/* Metrics */}
      {m && (
        <div style={{ padding: "0 12px 10px" }}>
          <MetricBar value={m.cpu} label="CPU" warningThreshold={thresholds.cpuWarning} criticalThreshold={thresholds.cpuCritical} />
          <MetricBar value={m.memPercent} label="MEM" warningThreshold={thresholds.memWarning} criticalThreshold={thresholds.memCritical} />
          <MetricBar value={m.diskPercent} label="DSK" warningThreshold={thresholds.diskWarning} criticalThreshold={thresholds.diskCritical} />

          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, color: "var(--text-muted)" }}>
            <span>
              <ArrowUpDown size={10} style={{ verticalAlign: "middle" }} />{" "}
              ↑{formatBytes(netTxRate)}/s ↓{formatBytes(netRxRate)}/s
            </span>
            <span>Load: {m.loadAvg.map((l) => l.toFixed(1)).join(" ")}</span>
          </div>

          {/* Sparklines */}
          {metrics.length > 2 && (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>CPU</div>
                <SparklineSVG
                  data={metrics.map((s) => s.cpu)}
                  width={100}
                  height={18}
                  color={m.cpu >= thresholds.cpuCritical ? "#ff7b72" : "#3fb950"}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>MEM</div>
                <SparklineSVG
                  data={metrics.map((s) => s.memPercent)}
                  width={100}
                  height={18}
                  color={m.memPercent >= thresholds.memCritical ? "#ff7b72" : "#58a6ff"}
                />
              </div>
            </div>
          )}

          {/* Top Processes */}
          {m.topProcesses.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-muted)" }}>
              Top: {m.topProcesses.slice(0, 3).map((p) => `${p.name.split("/").pop()} ${p.cpu}%`).join(" | ")}
            </div>
          )}

          {/* Failed services warning */}
          {m.failedServices.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 10, color: "#ff7b72", display: "flex", alignItems: "center", gap: 4 }}>
              <AlertTriangle size={10} />
              Failed: {m.failedServices.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Expanded: Control Center actions */}
      {expanded && m && (
        <div style={{ padding: "8px 12px 10px", borderTop: "1px solid var(--border-subtle)" }}>
          {/* CPU Actions */}
          {m.cpu >= thresholds.cpuWarning && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#ff7b72", fontWeight: 600, marginBottom: 4 }}>CPU High ({m.cpu.toFixed(1)}%)</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                <ActionBtn label={t("infra.showProcesses")} icon={<Activity size={10} />} onClick={() => onRemediation("top")} />
                <ActionBtn label={t("infra.openTerminal")} icon={<Terminal size={10} />} onClick={() => onRemediation("terminal")} />
                {/* Kill PID — two-step: enter PID → confirm signal */}
                {!killConfirm ? (
                  <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="PID"
                      value={killPidInput}
                      onChange={(e) => setKillPidInput(e.target.value.replace(/\D/g, ""))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ ...inputStyle, width: 52, padding: "2px 6px", fontSize: 10 }}
                    />
                    <ActionBtn
                      label={t("infra.killPid") + "..."}
                      icon={<Skull size={10} />}
                      danger
                      onClick={() => {
                        if (killPidInput) {
                          setKillConfirm({ pid: killPidInput, signal: "SIGTERM" });
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div style={{
                    display: "flex", gap: 4, alignItems: "center",
                    background: "rgba(255,123,114,0.08)",
                    border: "1px solid rgba(255,123,114,0.25)",
                    borderRadius: "var(--radius-sm)",
                    padding: "3px 8px",
                  }}>
                    <span style={{ fontSize: 10, color: "#ff7b72", fontWeight: 600 }}>
                      Kill PID {killConfirm.pid}?
                    </span>
                    <ActionBtn
                      label="SIGTERM"
                      onClick={() => {
                        onRemediation(`kill_term:${killConfirm.pid}`);
                        setKillConfirm(null);
                        setKillPidInput("");
                      }}
                    />
                    <ActionBtn
                      label="SIGKILL"
                      danger
                      onClick={() => {
                        onRemediation(`kill_force:${killConfirm.pid}`);
                        setKillConfirm(null);
                        setKillPidInput("");
                      }}
                    />
                    <ActionBtn
                      label="Cancel"
                      onClick={() => setKillConfirm(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Memory Actions */}
          {m.memPercent >= thresholds.memWarning && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#d29922", fontWeight: 600, marginBottom: 4 }}>Memory High ({m.memPercent.toFixed(1)}%)</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <ActionBtn label={t("infra.memoryMap")} icon={<Activity size={10} />} onClick={() => onRemediation("memory")} />
                <ActionBtn label={t("infra.cacheBuffers")} icon={<Eraser size={10} />} onClick={() => onRemediation("drop_caches")} />
                <ActionBtn label={t("infra.openTerminal")} icon={<Terminal size={10} />} onClick={() => onRemediation("terminal")} />
              </div>
            </div>
          )}

          {/* Disk Actions — safe scan-first approach */}
          {m.diskPercent >= thresholds.diskWarning && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#d29922", fontWeight: 600, marginBottom: 4 }}>Disk High ({m.diskPercent.toFixed(0)}%)</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <ActionBtn label={t("infra.analyzeDisk")} icon={<HardDrive size={10} />} onClick={() => onRemediation("analyze_disk")} />
                <ActionBtn label={t("infra.scanLargeFiles")} icon={<FolderOpen size={10} />} onClick={() => onRemediation("disk_scan")} />
                <ActionBtn label={t("infra.scanOldLogs")} icon={<Eraser size={10} />} onClick={() => onRemediation("log_scan")} />
                <ActionBtn label={t("infra.openTerminal")} icon={<Terminal size={10} />} onClick={() => onRemediation("terminal")} />
              </div>
            </div>
          )}

          {/* Service Actions */}
          {m.failedServices.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#ff7b72", fontWeight: 600, marginBottom: 4 }}>Failed Services</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {m.failedServices.map((svc) => (
                  <ActionBtn key={svc} label={`Restart ${svc}`} onClick={() => onRemediation(`restart:${svc}`)} />
                ))}
                <ActionBtn label={t("infra.showAllFailed")} onClick={() => onRemediation("show_failed")} />
              </div>
            </div>
          )}

          {/* Always available actions */}
          {m.cpu < thresholds.cpuWarning && m.memPercent < thresholds.memWarning && m.diskPercent < thresholds.diskWarning && m.failedServices.length === 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <ActionBtn label={t("infra.showProcesses")} icon={<Activity size={10} />} onClick={() => onRemediation("top")} />
              <ActionBtn label={t("infra.openTerminal")} icon={<Terminal size={10} />} onClick={() => onRemediation("terminal")} />
              <ActionBtn label="Disk Usage" icon={<FolderOpen size={10} />} onClick={() => onRemediation("disk")} />
            </div>
          )}
        </div>
      )}

      {!m && monitoring && (
        <div style={{ padding: "12px", textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ marginTop: 4 }}>{t("infra.collectingMetrics")}</div>
        </div>
      )}
    </div>
  );
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ width: 24, height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

function ActionBtn({ label, onClick, icon, danger }: { label: string; onClick: () => void; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        padding: "3px 8px",
        fontSize: 10,
        background: danger ? "rgba(255,123,114,0.15)" : "var(--bg-tertiary)",
        border: `1px solid ${danger ? "rgba(255,123,114,0.3)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-sm)",
        color: danger ? "#ff7b72" : "var(--text-secondary)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: 4,
  display: "flex",
  alignItems: "center",
};

type InfraView = "overview" | "timeline" | "alerts" | "disk" | "compare" | "settings";

export function InfraMonitorPanel() {
  const t = useT();
  const sshConnections = useAppStore((s) => s.sshConnections);
  const infraMonitors = useAppStore((s) => s.infraMonitors);
  const infraAlerts = useAppStore((s) => s.infraAlerts);
  const infraThresholds = useAppStore((s) => s.infraThresholds);
  const infraPollingInterval = useAppStore((s) => s.infraPollingInterval);
  const infraCompactMode = useAppStore((s) => s.infraCompactMode);
  const infraTimeline = useAppStore((s) => s.infraTimeline);
  const addInfraMetrics = useAppStore((s) => s.addInfraMetrics);
  const addInfraTimelineEvent = useAppStore((s) => s.addInfraTimelineEvent);
  const acknowledgeInfraAlert = useAppStore((s) => s.acknowledgeInfraAlert);
  const setInfraThresholds = useAppStore((s) => s.setInfraThresholds);
  const setInfraPollingInterval = useAppStore((s) => s.setInfraPollingInterval);
  const toggleInfraCompactMode = useAppStore((s) => s.toggleInfraCompactMode);
  const clearInfraMonitor = useAppStore((s) => s.clearInfraMonitor);
  const clearInfraTimeline = useAppStore((s) => s.clearInfraTimeline);
  const diskAnalyses = useAppStore((s) => s.diskAnalyses);
  const setDiskAnalysis = useAppStore((s) => s.setDiskAnalysis);
  const activeMonitors = useAppStore((s) => s.infraActiveMonitors);
  const addActiveMonitor = useAppStore((s) => s.addInfraActiveMonitor);
  const removeActiveMonitor = useAppStore((s) => s.removeInfraActiveMonitor);
  const performanceBaselines = useAppStore((s) => s.performanceBaselines);

  const [view, setView] = useState<InfraView>("overview");
  const [remediationOutput, setRemediationOutput] = useState<string | null>(null);

  const connectedServers = sshConnections.filter((c) => c.status === "connected");
  const unacknowledgedAlerts = infraAlerts.filter((a) => !a.acknowledged);

  // Listen for metrics events — use cancellation flag to prevent listener leaks
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    let cancelled = false;

    const setupListeners = async () => {
      const { listen } = await getTauriEvent();

      for (const connId of activeMonitors) {
        if (cancelled) return; // Effect was cleaned up while we were awaiting
        const unlistenData = await listen<any>(`infra-metrics-${connId}`, (event) => {
          const raw = event.payload;
          const snapshot: ServerMetrics = {
            timestamp: raw.timestamp || Date.now(),
            cpu: raw.cpu || 0,
            memPercent: raw.mem_percent || 0,
            memUsedMB: raw.mem_used_mb || 0,
            memTotalMB: raw.mem_total_mb || 0,
            diskPercent: raw.disk_percent || 0,
            netRxBytes: raw.net_rx_bytes || 0,
            netTxBytes: raw.net_tx_bytes || 0,
            loadAvg: raw.load_avg || [0, 0, 0],
            topProcesses: (raw.top_processes || []).map((p: any) => ({
              name: p.name || "",
              cpu: p.cpu || 0,
              mem: p.mem || 0,
            })),
            failedServices: raw.failed_services || [],
          };
          addInfraMetrics(connId, snapshot);
          // Update performance baseline every 10th sample
          const monitorData = useAppStore.getState().infraMonitors[connId];
          if (monitorData && monitorData.metrics.length % 10 === 0) {
            useAppStore.getState().updateBaseline(connId, snapshot.cpu, snapshot.memPercent, snapshot.diskPercent);
          }
        });
        cleanups.push(unlistenData);
        if (cancelled) { unlistenData(); return; }

        const unlistenError = await listen<string>(`infra-error-${connId}`, (event) => {
          const conn = useAppStore.getState().sshConnections.find((c) => c.id === connId);
          addInfraTimelineEvent({
            connectionId: connId,
            serverName: conn?.name || connId,
            type: "alert",
            severity: "warning",
            message: `Monitor error: ${event.payload}`,
          });
        });
        cleanups.push(unlistenError);
        if (cancelled) { unlistenError(); return; }
      }
    };

    if (activeMonitors.size > 0) {
      setupListeners();
    }

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [activeMonitors, addInfraMetrics, addInfraTimelineEvent]);

  const startMonitor = useCallback(async (conn: SSHConnection) => {
    try {
      const { invoke } = await getTauriCore();

      let password = conn.sessionPassword || null;
      if (!password && !conn.privateKey) {
        try {
          password = await invoke<string>("keychain_get_password", { connectionId: conn.id });
        } catch { /* no keychain */ }
      }

      await invoke("infra_monitor_start", {
        connectionId: conn.id,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: password,
        privateKey: conn.privateKey || null,
        interval: infraPollingInterval,
      });

      addActiveMonitor(conn.id);
      addInfraTimelineEvent({
        connectionId: conn.id,
        serverName: conn.name,
        type: "connection",
        severity: "info",
        message: `Started monitoring ${conn.name} (${conn.host})`,
      });
    } catch (e) {
      console.error("Failed to start monitor:", e);
    }
  }, [infraPollingInterval, addInfraTimelineEvent, addActiveMonitor]);

  const stopMonitor = useCallback(async (connId: string) => {
    try {
      const { invoke } = await getTauriCore();
      await invoke("infra_monitor_stop", { connectionId: connId });
      const conn = sshConnections.find((c) => c.id === connId);
      removeActiveMonitor(connId);
      clearInfraMonitor(connId);
      addInfraTimelineEvent({
        connectionId: connId,
        serverName: conn?.name || connId,
        type: "connection",
        severity: "info",
        message: `Stopped monitoring ${conn?.name || connId}`,
      });
    } catch (e) {
      console.error("Failed to stop monitor:", e);
    }
  }, [clearInfraMonitor, sshConnections, addInfraTimelineEvent, removeActiveMonitor]);

  const handleRemediation = useCallback(async (conn: SSHConnection, action: string) => {
    try {
      const { invoke } = await getTauriCore();
      let cmd = "";

      // Build command based on action type
      if (action === "top") cmd = "ps aux --sort=-%cpu | head -20";
      else if (action === "disk") cmd = "du -sh /* 2>/dev/null | sort -rh | head -15";
      else if (action === "disk_scan") cmd = "echo '=== Top 15 largest directories ===' && du -sh /* 2>/dev/null | sort -rh | head -15 && echo '' && echo '=== Files > 100MB ===' && find / -type f -size +100M -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}' | sort -rh | head -20";
      else if (action === "log_scan") cmd = "echo '=== /var/log size ===' && du -sh /var/log 2>/dev/null && echo '' && echo '=== Largest log files ===' && find /var/log -type f -size +10M -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}' | sort -rh | head -20 && echo '' && echo '=== Rotated logs (*.gz, *.old, *.1) ===' && find /var/log -type f \\( -name '*.gz' -o -name '*.old' -o -name '*.1' -o -name '*.bz2' \\) -exec ls -lh {} \\; 2>/dev/null | awk '{sum+=$5} END {printf \"Total: %d files\\n\", NR}' && echo '' && echo 'Use terminal to clean: find /var/log -name \"*.gz\" -mtime +7 -delete'";
      else if (action === "memory") cmd = "ps aux --sort=-%mem | head -15";
      else if (action === "clean_journals") cmd = "journalctl --vacuum-time=7d 2>&1 || echo 'journalctl not available'";
      else if (action === "drop_caches") cmd = "echo 'Cache info:' && free -m | head -3 && echo '---' && cat /proc/meminfo | grep -E 'Cached|Buffers|SwapCached'";
      else if (action === "show_failed") cmd = "systemctl list-units --state=failed --no-pager 2>/dev/null || echo 'systemctl not available'";
      else if (action.startsWith("restart:")) {
        const svc = action.split(":")[1];
        if (!/^[a-zA-Z0-9._@-]+$/.test(svc)) return; // reject invalid service names
        cmd = `systemctl restart ${svc} 2>&1 && echo 'Restarted ${svc} successfully' || echo 'Failed to restart ${svc}'`;
      } else if (action.startsWith("kill_term:")) {
        const pid = action.split(":")[1];
        if (!/^\d+$/.test(pid)) return; // reject non-numeric PIDs
        // SIGTERM — graceful, process can catch and clean up
        cmd = `ps -p ${pid} -o pid,user,comm,%cpu,%mem --no-headers 2>/dev/null && kill -15 ${pid} 2>&1 && echo 'Sent SIGTERM (graceful) to PID ${pid}' || echo 'Failed — PID ${pid} not found or permission denied'`;
      } else if (action.startsWith("kill_force:")) {
        const pid = action.split(":")[1];
        if (!/^\d+$/.test(pid)) return; // reject non-numeric PIDs
        // SIGKILL — immediate, cannot be caught
        cmd = `ps -p ${pid} -o pid,user,comm,%cpu,%mem --no-headers 2>/dev/null && kill -9 ${pid} 2>&1 && echo 'Sent SIGKILL (force) to PID ${pid} — process terminated immediately' || echo 'Failed — PID ${pid} not found or permission denied'`;
      } else if (action === "analyze_disk") {
        // Switch to disk view for this server
        setView("disk");
        return;
      } else if (action === "terminal") {
        const store = useAppStore.getState();
        const executeSnippet = store.executeSnippet;
        if (executeSnippet) {
          executeSnippet(`cd ${conn.name}:~`);
        }
        addInfraTimelineEvent({
          connectionId: conn.id,
          serverName: conn.name,
          type: "action",
          severity: "info",
          message: `Opened terminal to ${conn.name}`,
        });
        return;
      }

      if (!cmd) return;

      let password = conn.sessionPassword || null;
      if (!password && !conn.privateKey) {
        try { password = await invoke<string>("keychain_get_password", { connectionId: conn.id }); } catch {}
      }

      // Log action to timeline
      addInfraTimelineEvent({
        connectionId: conn.id,
        serverName: conn.name,
        type: "action",
        severity: "info",
        message: `Executed: ${action} on ${conn.name}`,
      });

      const result = await invoke<string>("ssh_exec", {
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password,
        privateKey: conn.privateKey || null,
        command: cmd,
      });
      setRemediationOutput(result);
    } catch (e) {
      setRemediationOutput(`Error: ${e}`);
    }
  }, [addInfraTimelineEvent]);

  // Detect cross-server correlations
  const correlatedAlerts = (() => {
    const recent = unacknowledgedAlerts.filter((a) => Date.now() - a.timestamp < 30000);
    const servers = new Set(recent.map((a) => a.connectionId));
    return servers.size >= 2;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Activity size={14} style={{ color: "var(--accent-primary)" }} />
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{t("infra.title")}</span>
        <button
          onClick={toggleInfraCompactMode}
          style={btnStyle}
          title={infraCompactMode ? "Grid view" : "Compact view"}
        >
          {infraCompactMode ? <LayoutGrid size={14} /> : <LayoutList size={14} />}
        </button>
      </div>

      {/* Tab Selector — 5 tabs */}
      <div style={{ display: "flex", gap: 3 }}>
        {(["overview", "timeline", "alerts", "disk", "compare", "settings"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              flex: 1,
              padding: "4px 6px",
              fontSize: 10,
              fontWeight: view === v ? 600 : 400,
              background: view === v ? "var(--accent-primary)" : "var(--bg-tertiary)",
              color: view === v ? "#fff" : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              textTransform: "capitalize",
              position: "relative",
            }}
          >
            {v === "timeline" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Clock size={10} />
                {t("infra.timeline")}
              </span>
            ) : v === "disk" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <HardDrive size={10} />
                {t("infra.disk")}
              </span>
            ) : v === "compare" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <ArrowUpDown size={10} />
                {t("infra.compare")}
              </span>
            ) : t(`infra.${v}`)}
            {v === "alerts" && unacknowledgedAlerts.length > 0 && (
              <span style={{
                marginLeft: 3,
                background: "#ff7b72",
                color: "#fff",
                borderRadius: 8,
                padding: "0 4px",
                fontSize: 8,
              }}>
                {unacknowledgedAlerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status line */}
      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
        {activeMonitors.size} {t("infra.monitored")} | {t("infra.polling")}: {infraPollingInterval}s
        {correlatedAlerts && (
          <span style={{ color: "#ff7b72", fontWeight: 600, marginLeft: 8 }}>
            {t("infra.correlatedEvents")}
          </span>
        )}
      </div>

      {/* Views */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {view === "overview" && (
          <OverviewView
            connectedServers={connectedServers}
            allConnections={sshConnections}
            infraMonitors={infraMonitors}
            thresholds={infraThresholds}
            activeMonitors={activeMonitors}
            compact={infraCompactMode}
            onStart={startMonitor}
            onStop={stopMonitor}
            onRemediation={handleRemediation}
          />
        )}

        {view === "timeline" && (
          <TimelineView
            timeline={infraTimeline}
            onClear={clearInfraTimeline}
          />
        )}

        {view === "alerts" && (
          <AlertsView
            alerts={infraAlerts}
            onAcknowledge={acknowledgeInfraAlert}
          />
        )}

        {view === "disk" && (
          <DiskAnalyzerView
            connections={sshConnections}
            diskAnalyses={diskAnalyses}
            onSetAnalysis={setDiskAnalysis}
            onTimelineEvent={addInfraTimelineEvent}
          />
        )}

        {view === "compare" && (
          <CompareView
            connections={sshConnections}
            infraMonitors={infraMonitors}
            baselines={performanceBaselines}
          />
        )}

        {view === "settings" && (
          <SettingsView
            thresholds={infraThresholds}
            pollingInterval={infraPollingInterval}
            onSetThresholds={setInfraThresholds}
            onSetInterval={setInfraPollingInterval}
          />
        )}
      </div>

      {/* Remediation Output Modal */}
      {remediationOutput !== null && (
        <div style={{
          position: "absolute",
          bottom: 40,
          left: 10,
          right: 10,
          background: "var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: 10,
          maxHeight: 200,
          overflow: "auto",
          zIndex: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Command Output</span>
            <button onClick={() => setRemediationOutput(null)} style={btnStyle}><XCircle size={14} /></button>
          </div>
          <pre style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: "pre-wrap",
            color: "var(--text-secondary)",
            margin: 0,
          }}>
            {remediationOutput}
          </pre>
        </div>
      )}
    </div>
  );
}

// ──── Overview View ────
function OverviewView({
  connectedServers,
  allConnections,
  infraMonitors,
  thresholds,
  activeMonitors,
  compact,
  onStart,
  onStop,
  onRemediation,
}: {
  connectedServers: SSHConnection[];
  allConnections: SSHConnection[];
  infraMonitors: Record<string, { metrics: ServerMetrics[]; status: string }>;
  thresholds: any;
  activeMonitors: Set<string>;
  compact: boolean;
  onStart: (conn: SSHConnection) => void;
  onStop: (connId: string) => void;
  onRemediation: (conn: SSHConnection, action: string) => void;
}) {
  const t = useT();
  const relevantConnections = allConnections.filter(
    (c) => c.status === "connected" || infraMonitors[c.id]
  );

  if (relevantConnections.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 12 }}>
        <Activity size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div>{t("infra.noServers")}</div>
        <div style={{ fontSize: 10, marginTop: 4 }}>{t("infra.connectFirst")}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 4 : 8 }}>
      {relevantConnections.map((conn) => {
        const monitorData = infraMonitors[conn.id];
        const metrics = monitorData?.metrics || [];
        const latestMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;
        return (
          <ServerCard
            key={conn.id}
            conn={conn}
            metrics={metrics}
            latestMetric={latestMetric}
            thresholds={thresholds}
            monitoring={activeMonitors.has(conn.id)}
            onStart={() => onStart(conn)}
            onStop={() => onStop(conn.id)}
            onRemediation={(action) => onRemediation(conn, action)}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

// ──── Timeline View ────
function TimelineView({
  timeline,
  onClear,
}: {
  timeline: InfraTimelineEvent[];
  onClear: () => void;
}) {
  const t = useT();
  if (timeline.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 12 }}>
        <Clock size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div>{t("infra.noEvents")}</div>
        <div style={{ fontSize: 10, marginTop: 4 }}>{t("infra.startMonitoringTimeline")}</div>
      </div>
    );
  }

  // Group events by date
  const grouped: Record<string, InfraTimelineEvent[]> = {};
  for (const event of timeline) {
    const dateKey = new Date(event.timestamp).toLocaleDateString();
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(event);
  }

  const typeColors: Record<string, string> = {
    alert: "#ff7b72",
    action: "#58a6ff",
    connection: "#3fb950",
    metric: "#d29922",
  };

  const severityIcons: Record<string, React.ReactNode> = {
    critical: <XCircle size={10} style={{ color: "#ff7b72" }} />,
    warning: <AlertTriangle size={10} style={{ color: "#d29922" }} />,
    info: <Activity size={10} style={{ color: "#58a6ff" }} />,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <button onClick={onClear} style={{ ...btnStyle, fontSize: 10 }} title="Clear timeline">
          <Trash2 size={10} />
          <span style={{ marginLeft: 4 }}>Clear</span>
        </button>
      </div>

      {Object.entries(grouped).map(([date, events]) => (
        <div key={date}>
          <div style={{
            fontSize: 9,
            color: "var(--text-muted)",
            padding: "4px 0",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}>
            {date}
          </div>

          {events.map((event) => (
            <div
              key={event.id}
              style={{
                display: "flex",
                gap: 8,
                padding: "4px 0",
                borderLeft: `2px solid ${typeColors[event.type] || "var(--border-subtle)"}`,
                paddingLeft: 10,
                marginLeft: 4,
              }}
            >
              <span style={{ fontSize: 10, color: "var(--text-muted)", width: 40, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                {severityIcons[event.severity || "info"]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 500 }}>
                  <span style={{ color: typeColors[event.type] || "var(--text-secondary)" }}>
                    {event.serverName}
                  </span>
                  {" "}
                  <span style={{ color: "var(--text-secondary)" }}>{event.message}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ──── Alerts View ────
function AlertsView({
  alerts,
  onAcknowledge,
}: {
  alerts: InfraAlert[];
  onAcknowledge: (id: string) => void;
}) {
  const t = useT();
  if (alerts.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 12 }}>
        <CheckCircle size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div>{t("infra.allClear")}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {alerts.slice(0, 50).map((alert) => (
        <div
          key={alert.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "6px 10px",
            background: alert.acknowledged ? "transparent" : "var(--bg-secondary)",
            borderRadius: "var(--radius-sm)",
            opacity: alert.acknowledged ? 0.5 : 1,
            borderLeft: `3px solid ${alert.severity === "critical" ? "#ff7b72" : "#d29922"}`,
          }}
        >
          {alert.severity === "critical" ? (
            <XCircle size={12} style={{ color: "#ff7b72", marginTop: 2, flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={12} style={{ color: "#d29922", marginTop: 2, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 500 }}>
              {alert.serverName}: {alert.message}
            </div>
            <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
              {new Date(alert.timestamp).toLocaleTimeString()} — {alert.metric}
            </div>
          </div>
          {!alert.acknowledged && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              style={btnStyle}
              title="Acknowledge"
            >
              <CheckCircle size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ──── Disk Analyzer View (CCleaner-style) ────

// Safe scan: -xdev prevents crossing filesystem boundaries, timeout prevents hangs on huge dirs
const DISK_SCAN_SCRIPT = [
  "echo '===PARTITIONS===' && df -hT 2>/dev/null | grep -E '^/dev/'",
  "echo '===LARGEST===' && timeout 10s du -xmd1 / 2>/dev/null | sort -rn | head -15",
  "echo '===LOGS===' && du -sm /var/log 2>/dev/null | awk '{print $1}'",
  "echo '===CACHE===' && du -sm /var/cache 2>/dev/null | awk '{print $1}'",
  "echo '===TMP===' && du -sm /tmp /var/tmp 2>/dev/null | awk '{s+=$1} END {print s+0}'",
  "echo '===JOURNAL===' && journalctl --disk-usage 2>/dev/null | grep -oP '[\\\\d.]+[GMKT]' | head -1",
  "echo '===PKGCACHE===' && (du -sm /var/cache/apt/archives 2>/dev/null || du -sm /var/cache/yum 2>/dev/null || du -sm /var/cache/dnf 2>/dev/null || echo '0') | awk '{print $1}'",
  "echo '===DOCKER===' && (docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo '0')",
  "echo '===OLDKERNELS===' && (dpkg -l 'linux-image-*' 2>/dev/null | grep '^ii' | wc -l || rpm -q kernel 2>/dev/null | wc -l || echo '0')",
  "echo '===SNAPS===' && (du -sm /var/lib/snapd/snaps 2>/dev/null | awk '{print $1}' || echo '0')",
  "echo '===COREDUMPS===' && (du -sm /var/lib/systemd/coredump 2>/dev/null | awk '{print $1}' || echo '0')",
  "echo '===LOGFILES===' && timeout 5s find /var/log -xdev -type f \\\\( -name '*.gz' -o -name '*.old' -o -name '*.1' -o -name '*.bz2' -o -name '*.xz' \\\\) 2>/dev/null | wc -l",
  "echo '===TMPFILES===' && timeout 5s find /tmp -xdev -type f -mtime +7 2>/dev/null | wc -l",
  // New categories
  "echo '===NPMCACHE===' && (du -sm ~/.npm 2>/dev/null | awk '{print $1}' || echo '0')",
  "echo '===PIPCACHE===' && (du -sm ~/.cache/pip 2>/dev/null | awk '{print $1}' || echo '0')",
  "echo '===THUMBNAILS===' && (du -sm ~/.cache/thumbnails 2>/dev/null | awk '{print $1}' || echo '0')",
  "echo '===TRASH===' && (du -sm ~/.local/share/Trash 2>/dev/null | awk '{print $1}' || echo '0')",
  "echo '===YARNCACHE===' && (du -sm ~/.cache/yarn 2>/dev/null | awk '{print $1}' || echo '0')",
].join(" && ");

function parseSizeToMB(s: string): number {
  if (!s) return 0;
  const trimmed = s.trim();
  const num = parseFloat(trimmed);
  if (isNaN(num)) return 0;
  if (trimmed.endsWith("G")) return num * 1024;
  if (trimmed.endsWith("T")) return num * 1024 * 1024;
  if (trimmed.endsWith("K")) return num / 1024;
  return num; // Already MB or plain number
}

function parseDiskScanOutput(output: string, connectionId: string): DiskAnalysis {
  const partitions: DiskPartition[] = [];
  const categories: DiskCategory[] = [];
  const largestDirs: { path: string; sizeMB: number }[] = [];
  let section = "";
  const values: Record<string, string> = {};

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("===") && trimmed.endsWith("===")) {
      section = trimmed;
      continue;
    }
    if (!trimmed) continue;

    if (section === "===PARTITIONS===") {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 7) {
        const toGB = (s: string) => {
          const n = parseFloat(s);
          if (s.endsWith("T")) return n * 1024;
          if (s.endsWith("G")) return n;
          if (s.endsWith("M")) return n / 1024;
          if (s.endsWith("K")) return n / (1024 * 1024);
          return n;
        };
        partitions.push({
          mount: parts[6], device: parts[0], fsType: parts[1],
          totalGB: toGB(parts[2]), usedGB: toGB(parts[3]),
          freeGB: toGB(parts[4]), usedPercent: parseInt(parts[5]) || 0,
        });
      }
    } else if (section === "===LARGEST===") {
      // du output: SIZE_MB\tPATH
      const match = trimmed.match(/^(\d+)\s+(.+)$/);
      if (match && match[2] !== "/") {
        largestDirs.push({ path: match[2], sizeMB: parseInt(match[1]) || 0 });
      }
    } else {
      if (!values[section]) values[section] = trimmed;
    }
  }

  const logsMB = parseFloat(values["===LOGS==="] || "0") || 0;
  const cacheMB = parseFloat(values["===CACHE==="] || "0") || 0;
  const tmpMB = parseFloat(values["===TMP==="] || "0") || 0;
  const journalMB = parseSizeToMB(values["===JOURNAL==="] || "0");
  const pkgCacheMB = parseFloat(values["===PKGCACHE==="] || "0") || 0;
  const dockerStr = values["===DOCKER==="] || "0";
  const dockerMB = parseSizeToMB(dockerStr);
  const oldKernels = parseInt(values["===OLDKERNELS==="] || "0") || 0;
  const snapsMB = parseFloat(values["===SNAPS==="] || "0") || 0;
  const coredumpMB = parseFloat(values["===COREDUMPS==="] || "0") || 0;
  const rotatedLogFiles = parseInt(values["===LOGFILES==="] || "0") || 0;
  const oldTmpFiles = parseInt(values["===TMPFILES==="] || "0") || 0;
  const npmCacheMB = parseFloat(values["===NPMCACHE==="] || "0") || 0;
  const pipCacheMB = parseFloat(values["===PIPCACHE==="] || "0") || 0;
  const thumbnailsMB = parseFloat(values["===THUMBNAILS==="] || "0") || 0;
  const trashMB = parseFloat(values["===TRASH==="] || "0") || 0;
  const yarnCacheMB = parseFloat(values["===YARNCACHE==="] || "0") || 0;

  // Build cleanup categories with preview and per-category actions
  if (logsMB > 10) {
    categories.push({
      id: "logs", name: "System Logs", icon: "file", sizeMB: logsMB,
      items: rotatedLogFiles, reclaimable: rotatedLogFiles > 0,
      cleanCmd: "find /var/log -xdev -type f \\( -name '*.gz' -o -name '*.old' -o -name '*.1' -o -name '*.bz2' -o -name '*.xz' \\) -mtime +7 -delete && echo 'Cleaned rotated logs older than 7 days'",
      previewCmd: "find /var/log -xdev -type f \\( -name '*.gz' -o -name '*.old' -o -name '*.1' -o -name '*.bz2' -o -name '*.xz' \\) -mtime +7 -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}' | sort -rh | head -30",
      actions: [
        { label: "View files", cmd: "ls -lhS /var/log/ | head -20" },
        { label: "Tail syslog", cmd: "tail -20 /var/log/syslog 2>/dev/null || tail -20 /var/log/messages 2>/dev/null || echo 'No syslog found'" },
      ],
      description: `${rotatedLogFiles} rotated log files (older than 7 days)`,
    });
  }
  if (journalMB > 50) {
    categories.push({
      id: "journal", name: "Systemd Journal", icon: "database", sizeMB: journalMB,
      items: 1, reclaimable: true,
      cleanCmd: "journalctl --vacuum-time=7d 2>&1",
      previewCmd: "journalctl --disk-usage 2>/dev/null && echo '---' && ls -lhS /var/log/journal/*/ 2>/dev/null | head -15",
      actions: [
        { label: "Show errors", cmd: "journalctl -p err --since '24 hours ago' --no-pager | tail -30" },
      ],
      description: "Journal logs older than 7 days",
    });
  }
  if (cacheMB > 50) {
    categories.push({
      id: "cache", name: "System Cache", icon: "box", sizeMB: cacheMB,
      items: 0, reclaimable: false,
      previewCmd: "du -sh /var/cache/*/ 2>/dev/null | sort -rh | head -15",
      description: "System-managed cache (/var/cache) — inspect before cleaning",
    });
  }
  if (pkgCacheMB > 50) {
    categories.push({
      id: "pkgcache", name: "Package Cache", icon: "package", sizeMB: pkgCacheMB,
      items: 0, reclaimable: true,
      cleanCmd: "apt-get clean 2>/dev/null || yum clean all 2>/dev/null || dnf clean all 2>/dev/null && echo 'Package cache cleaned'",
      previewCmd: "ls -lhS /var/cache/apt/archives/*.deb 2>/dev/null | head -20 || ls -lhS /var/cache/yum/*/ 2>/dev/null | head -20 || echo 'No cached packages found'",
      description: "Downloaded package files no longer needed",
    });
  }
  if (tmpMB > 10) {
    categories.push({
      id: "tmp", name: "Temporary Files", icon: "trash", sizeMB: tmpMB,
      items: oldTmpFiles, reclaimable: oldTmpFiles > 0,
      cleanCmd: "find /tmp -xdev -type f -mtime +7 -delete 2>/dev/null && find /var/tmp -xdev -type f -mtime +7 -delete 2>/dev/null && echo 'Cleaned temp files older than 7 days'",
      previewCmd: "timeout 5s find /tmp -xdev -type f -mtime +7 -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}' | sort -rh | head -20",
      actions: [
        { label: "Show all", cmd: "ls -lhS /tmp/ | head -20" },
      ],
      description: `${oldTmpFiles} temp files older than 7 days`,
    });
  }
  if (dockerMB > 100) {
    categories.push({
      id: "docker", name: "Docker", icon: "box", sizeMB: dockerMB,
      items: 0, reclaimable: true,
      cleanCmd: "docker system prune -f 2>&1",
      previewCmd: "docker system df -v 2>/dev/null | head -30",
      actions: [
        { label: "Images", cmd: "docker images --format 'table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}' 2>/dev/null" },
        { label: "Volumes", cmd: "docker volume ls 2>/dev/null" },
        { label: "Prune volumes", cmd: "docker volume prune -f 2>&1", danger: true },
      ],
      description: "Unused containers, networks, and dangling images",
    });
  }
  if (coredumpMB > 10) {
    categories.push({
      id: "coredumps", name: "Core Dumps", icon: "shield", sizeMB: coredumpMB,
      items: 0, reclaimable: true,
      cleanCmd: "find /var/lib/systemd/coredump -type f -delete 2>/dev/null && echo 'Core dumps cleaned'",
      previewCmd: "ls -lhS /var/lib/systemd/coredump/ 2>/dev/null | head -15",
      description: "Crash dump files from failed processes",
    });
  }
  if (snapsMB > 100) {
    categories.push({
      id: "snaps", name: "Snap Packages", icon: "package", sizeMB: snapsMB,
      items: 0, reclaimable: false,
      previewCmd: "snap list 2>/dev/null",
      actions: [
        { label: "List revisions", cmd: "snap list --all 2>/dev/null | awk '/disabled/{print $1, $3}'" },
      ],
      description: "Snap package data — remove unused snaps manually",
    });
  }
  // Dev caches (npm, yarn, pip)
  const devCacheMB = npmCacheMB + pipCacheMB + yarnCacheMB;
  if (devCacheMB > 50) {
    const parts = [];
    if (npmCacheMB > 0) parts.push(`npm ${Math.round(npmCacheMB)}MB`);
    if (yarnCacheMB > 0) parts.push(`yarn ${Math.round(yarnCacheMB)}MB`);
    if (pipCacheMB > 0) parts.push(`pip ${Math.round(pipCacheMB)}MB`);
    categories.push({
      id: "devcache", name: "Dev Caches", icon: "code", sizeMB: devCacheMB,
      items: parts.length, reclaimable: true,
      cleanCmd: "npm cache clean --force 2>/dev/null; rm -rf ~/.cache/yarn 2>/dev/null; rm -rf ~/.cache/pip 2>/dev/null && echo 'Dev caches cleaned'",
      previewCmd: "echo '=== npm ===' && du -sh ~/.npm 2>/dev/null && echo '=== yarn ===' && du -sh ~/.cache/yarn 2>/dev/null && echo '=== pip ===' && du -sh ~/.cache/pip 2>/dev/null",
      actions: [
        { label: "npm cache", cmd: "npm cache ls 2>/dev/null | wc -l && echo 'cached packages' && du -sh ~/.npm 2>/dev/null" },
        { label: "pip cache", cmd: "pip cache info 2>/dev/null || du -sh ~/.cache/pip 2>/dev/null" },
      ],
      description: parts.join(", "),
    });
  }
  // User Trash
  if (trashMB > 20) {
    categories.push({
      id: "trash", name: "User Trash", icon: "trash", sizeMB: trashMB,
      items: 0, reclaimable: true,
      cleanCmd: "rm -rf ~/.local/share/Trash/files/* ~/.local/share/Trash/info/* 2>/dev/null && echo 'Trash emptied'",
      previewCmd: "ls -lhS ~/.local/share/Trash/files/ 2>/dev/null | head -20",
      description: "Files in user trash bin",
    });
  }
  // Thumbnail cache
  if (thumbnailsMB > 30) {
    categories.push({
      id: "thumbnails", name: "Thumbnail Cache", icon: "image", sizeMB: thumbnailsMB,
      items: 0, reclaimable: true,
      cleanCmd: "rm -rf ~/.cache/thumbnails/* 2>/dev/null && echo 'Thumbnails cleared'",
      previewCmd: "du -sh ~/.cache/thumbnails/*/ 2>/dev/null",
      description: "Cached image thumbnails — will regenerate on demand",
    });
  }
  // Old kernels (make reclaimable on Debian-based)
  if (oldKernels > 2) {
    categories.push({
      id: "oldkernels", name: "Old Kernels", icon: "cpu", sizeMB: 0,
      items: oldKernels - 1, reclaimable: oldKernels > 2,
      cleanCmd: "apt-get autoremove --purge -y 2>/dev/null || dnf remove --oldinstallonly -y 2>/dev/null && echo 'Old kernels removed'",
      previewCmd: "dpkg -l 'linux-image-*' 2>/dev/null | grep '^ii' || rpm -q kernel 2>/dev/null",
      actions: [
        { label: "Current kernel", cmd: "uname -r" },
        { label: "All installed", cmd: "dpkg -l 'linux-image-*' 2>/dev/null | grep '^ii' | awk '{print $2, $3}' || rpm -q kernel 2>/dev/null" },
      ],
      description: `${oldKernels - 1} old kernel(s) can be removed (keeping current)`,
    });
  }

  const totalReclaimableMB = categories
    .filter((c) => c.reclaimable)
    .reduce((sum, c) => sum + c.sizeMB, 0);

  return { connectionId, timestamp: Date.now(), partitions, categories, largestDirs, totalReclaimableMB };
}

// ──── Donut Chart (SVG) ────
const DonutChart = memo(function DonutChart({ usedPercent, size = 56, color }: { usedPercent: number; size?: number; color: string }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - usedPercent / 100);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fill="var(--text-primary)" fontSize={size > 48 ? 12 : 10} fontWeight={700}
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {usedPercent}%
      </text>
    </svg>
  );
});

function formatSize(mb: number): string {
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatGB(gb: number): string {
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}

const categoryIcons: Record<string, React.ReactNode> = {
  file: <FileArchive size={14} />,
  database: <Database size={14} />,
  box: <Box size={14} />,
  package: <Package size={14} />,
  trash: <Trash2 size={14} />,
  shield: <Shield size={14} />,
};

function DiskAnalyzerView({
  connections,
  diskAnalyses,
  onSetAnalysis,
  onTimelineEvent,
}: {
  connections: SSHConnection[];
  diskAnalyses: Record<string, DiskAnalysis>;
  onSetAnalysis: (id: string, analysis: DiskAnalysis) => void;
  onTimelineEvent: (event: Omit<InfraTimelineEvent, "id" | "timestamp">) => void;
}) {
  const t = useT();
  const [scanning, setScanning] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [cleaningId, setCleaningId] = useState<string | null>(null);
  const [cleanConfirm, setCleanConfirm] = useState<{ catId: string; cmd: string; name: string; warning?: string } | null>(null);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [cmdOutput, setCmdOutput] = useState<{ title: string; text: string } | null>(null);
  const [selectedClean, setSelectedClean] = useState<Set<string>>(new Set());
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const diskPreviousScans = useAppStore((s) => s.diskPreviousScans);

  const connectedServers = connections.filter((c) => c.status === "connected");

  const sshExec = useCallback(async (conn: SSHConnection, cmd: string) => {
    const { invoke } = await getTauriCore();
    let password = conn.sessionPassword || null;
    if (!password && !conn.privateKey) {
      try { password = await invoke<string>("keychain_get_password", { connectionId: conn.id }); } catch {}
    }
    return invoke<string>("ssh_exec", {
      host: conn.host, port: conn.port, username: conn.username,
      password, privateKey: conn.privateKey || null, command: cmd,
    });
  }, []);

  const runScan = useCallback(async (conn: SSHConnection) => {
    setScanning(conn.id);
    try {
      const result = await sshExec(conn, DISK_SCAN_SCRIPT);
      const analysis = parseDiskScanOutput(result, conn.id);
      onSetAnalysis(conn.id, analysis);
      setSelectedServer(conn.id);
      onTimelineEvent({
        connectionId: conn.id, serverName: conn.name,
        type: "action", severity: "info",
        message: `Disk scan: ${analysis.partitions.length} partitions, ${formatSize(analysis.totalReclaimableMB)} reclaimable`,
      });
    } catch (e) {
      setCmdOutput({ title: "Scan Error", text: `${e}` });
    } finally {
      setScanning(null);
    }
  }, [sshExec, onSetAnalysis, onTimelineEvent]);

  const runAction = useCallback(async (conn: SSHConnection, cmd: string, title: string) => {
    try {
      const result = await sshExec(conn, cmd);
      setCmdOutput({ title, text: result || "No output" });
    } catch (e) {
      setCmdOutput({ title, text: `Error: ${e}` });
    }
  }, [sshExec]);

  const runClean = useCallback(async (conn: SSHConnection, catId: string, cmd: string, name: string) => {
    setCleaningId(catId);
    setCleanConfirm(null);
    try {
      const result = await sshExec(conn, cmd);
      setCmdOutput({ title: `Cleanup: ${name}`, text: result || `${name} cleanup completed.` });
      onTimelineEvent({
        connectionId: conn.id, serverName: conn.name,
        type: "action", severity: "info",
        message: `Cleaned: ${name}`,
      });
      setTimeout(() => runScan(conn), 1000);
    } catch (e) {
      setCmdOutput({ title: `Cleanup Error`, text: `${e}` });
    } finally {
      setCleaningId(null);
    }
  }, [sshExec, onTimelineEvent, runScan]);

  const runCleanSelected = useCallback(async (conn: SSHConnection, analysis: DiskAnalysis) => {
    const cats = analysis.categories.filter((c) => selectedClean.has(c.id) && c.reclaimable && c.cleanCmd);
    if (cats.length === 0) return;
    const combinedCmd = cats.map((c) => c.cleanCmd).join(" && echo '---' && ");
    setCleaningId("__batch__");
    try {
      const result = await sshExec(conn, combinedCmd);
      const totalMB = cats.reduce((s, c) => s + c.sizeMB, 0);
      setCmdOutput({ title: `Batch Cleanup (${cats.length} categories)`, text: result || "Done" });
      onTimelineEvent({
        connectionId: conn.id, serverName: conn.name,
        type: "action", severity: "info",
        message: `Batch cleanup: ${cats.map((c) => c.name).join(", ")} (~${formatSize(totalMB)} freed)`,
      });
      setSelectedClean(new Set());
      setTimeout(() => runScan(conn), 1000);
    } catch (e) {
      setCmdOutput({ title: "Batch Cleanup Error", text: `${e}` });
    } finally {
      setCleaningId(null);
    }
  }, [sshExec, selectedClean, onTimelineEvent, runScan]);

  if (connectedServers.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 12 }}>
        <HardDrive size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div>{t("disk.noServersConnected")}</div>
        <div style={{ fontSize: 10, marginTop: 4 }}>{t("disk.connectToAnalyze")}</div>
      </div>
    );
  }

  const activeAnalysis = selectedServer ? diskAnalyses[selectedServer] : null;
  const activeConn = selectedServer ? connections.find((c) => c.id === selectedServer) : null;
  const prevScan = selectedServer ? diskPreviousScans[selectedServer] : null;

  // Calculate disk growth deltas
  const growthAlerts: { path: string; deltaMB: number }[] = [];
  if (activeAnalysis && prevScan) {
    for (const dir of activeAnalysis.largestDirs) {
      const prev = prevScan.dirs[dir.path];
      if (prev !== undefined) {
        const delta = dir.sizeMB - prev;
        if (delta > 500) { // Only show >500MB growth
          growthAlerts.push({ path: dir.path, deltaMB: delta });
        }
      }
    }
  }

  const selectedTotal = activeAnalysis
    ? activeAnalysis.categories.filter((c) => selectedClean.has(c.id) && c.reclaimable).reduce((s, c) => s + c.sizeMB, 0)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Server selector */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {connectedServers.map((conn) => (
          <button
            key={conn.id}
            onClick={() => diskAnalyses[conn.id] ? setSelectedServer(conn.id) : runScan(conn)}
            disabled={scanning === conn.id}
            style={{
              padding: "5px 10px", fontSize: 10,
              fontWeight: selectedServer === conn.id ? 600 : 400,
              background: selectedServer === conn.id ? "var(--accent-primary)" : "var(--bg-tertiary)",
              color: selectedServer === conn.id ? "#fff" : "var(--text-secondary)",
              border: "none", borderRadius: "var(--radius-sm)",
              cursor: scanning === conn.id ? "wait" : "pointer",
              opacity: scanning === conn.id ? 0.7 : 1,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {scanning === conn.id ? <RefreshCw size={10} style={{ animation: "spin 1s linear infinite" }} /> : <HardDrive size={10} />}
            {conn.name}
          </button>
        ))}
      </div>

      {!activeAnalysis && !scanning && (
        <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: 11 }}>
          <Search size={20} style={{ marginBottom: 6, opacity: 0.3 }} />
          <div>{t("disk.clickToScan")}</div>
        </div>
      )}
      {scanning && !activeAnalysis && (
        <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: 11 }}>
          <RefreshCw size={18} style={{ animation: "spin 1s linear infinite", marginBottom: 6 }} />
          <div>{t("disk.scanningDisk")}</div>
        </div>
      )}

      {activeAnalysis && activeConn && (
        <>
          {/* Disk Growth Alerts */}
          {growthAlerts.length > 0 && (
            <div style={{
              background: "rgba(255,123,114,0.08)", border: "1px solid rgba(255,123,114,0.2)",
              borderRadius: "var(--radius-md)", padding: "8px 12px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#ff7b72", marginBottom: 4 }}>
                <AlertTriangle size={10} style={{ verticalAlign: "middle" }} /> {t("disk.growthDetected")}
              </div>
              {growthAlerts.map((g) => (
                <div key={g.path} style={{ fontSize: 10, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{g.path}</span>
                  <span style={{ color: "#ff7b72", fontWeight: 600 }}>+{formatSize(g.deltaMB)}</span>
                </div>
              ))}
              {prevScan && (
                <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>
                  vs scan at {new Date(prevScan.timestamp).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}

          {/* Disk Summary Bar */}
          {(() => {
            const totalGB = activeAnalysis.partitions.reduce((s, p) => s + p.totalGB, 0);
            const usedGB = activeAnalysis.partitions.reduce((s, p) => s + p.usedGB, 0);
            const freeGB = totalGB - usedGB;
            const usedPct = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
            const reclaimGB = activeAnalysis.totalReclaimableMB / 1024;
            const barColor = usedPct >= 90 ? "#ff7b72" : usedPct >= 75 ? "#d29922" : "#3fb950";
            return (
              <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>Total: {totalGB.toFixed(1)} GB</span>
                  <span>Used: <span style={{ color: barColor, fontWeight: 600 }}>{usedGB.toFixed(1)} GB ({usedPct.toFixed(0)}%)</span></span>
                  <span>Free: <span style={{ color: "#3fb950", fontWeight: 600 }}>{freeGB.toFixed(1)} GB</span></span>
                  {reclaimGB > 0.01 && <span>Reclaimable: <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{reclaimGB.toFixed(1)} GB</span></span>}
                </div>
                <div style={{ height: 8, background: "var(--bg-tertiary)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${usedPct}%`, height: "100%", background: barColor, borderRadius: 4, transition: "width 0.5s ease" }} />
                  {reclaimGB > 0.01 && (
                    <div style={{ width: `${(reclaimGB / totalGB) * 100}%`, height: "100%", background: "var(--accent-primary)", opacity: 0.5 }} />
                  )}
                </div>
              </div>
            );
          })()}

          {/* Partitions */}
          <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{t("disk.partitions")}</span>
              <button onClick={() => runScan(activeConn)} disabled={scanning !== null}
                style={{ ...btnStyle, fontSize: 10, opacity: scanning ? 0.5 : 1 }}>
                <RefreshCw size={10} /><span style={{ marginLeft: 3 }}>{t("infra.rescan")}</span>
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeAnalysis.partitions.map((p) => {
                const color = p.usedPercent >= 90 ? "#ff7b72" : p.usedPercent >= 75 ? "#d29922" : "#3fb950";
                return (
                  <div key={p.mount} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <DonutChart usedPercent={p.usedPercent} size={48} color={color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{p.mount}</span>
                        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{p.device} ({p.fsType})</span>
                      </div>
                      <div style={{ height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
                        <div style={{ width: `${p.usedPercent}%`, height: "100%", background: `linear-gradient(90deg, ${color}cc, ${color})`, borderRadius: 3, transition: "width 0.5s ease" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>
                        <span>Used: {formatGB(p.usedGB)}</span>
                        <span>Free: {formatGB(p.freeGB)}</span>
                        <span>Total: {formatGB(p.totalGB)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Largest Directories — treemap-style bars */}
          {activeAnalysis.largestDirs.length > 0 && (
            <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", padding: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{t("disk.largestDirs")}</span>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {activeAnalysis.largestDirs.slice(0, 10).map((d) => {
                  const maxSize = activeAnalysis.largestDirs[0]?.sizeMB || 1;
                  const pct = Math.min(100, (d.sizeMB / maxSize) * 100);
                  const growth = prevScan?.dirs[d.path] !== undefined ? d.sizeMB - prevScan.dirs[d.path] : 0;
                  return (
                    <div key={d.path} style={{ position: "relative", padding: "3px 8px", borderRadius: 3, overflow: "hidden", cursor: "pointer" }}
                      onClick={() => {
                        const executeSnippet = useAppStore.getState().executeSnippet;
                        if (executeSnippet) executeSnippet(`cd ${activeConn.name}:${d.path}`);
                      }}
                      title={`Open terminal at ${d.path}`}
                    >
                      <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${pct}%`, background: "var(--accent-primary)", opacity: 0.1,
                        borderRadius: 3, transition: "width 0.3s ease",
                      }} />
                      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-secondary)" }}>{d.path}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)", display: "flex", gap: 6 }}>
                          {growth > 100 && (
                            <span style={{ color: "#ff7b72", fontSize: 9 }}>+{formatSize(growth)}</span>
                          )}
                          {formatSize(d.sizeMB)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 4 }}>
                {t("disk.clickDirTerminal")}
              </div>
            </div>
          )}

          {/* Cleanup Categories — with preview, actions, and multi-select */}
          {activeAnalysis.categories.length > 0 && (
            <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{t("disk.cleanup")}</span>
                {activeAnalysis.totalReclaimableMB > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#3fb950", background: "rgba(63,185,80,0.1)", padding: "2px 8px", borderRadius: 8 }}>
                    ~{formatSize(activeAnalysis.totalReclaimableMB)} {t("disk.reclaimable")}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {activeAnalysis.categories.map((cat) => {
                  const isExpanded = expandedCat === cat.id;
                  return (
                    <div key={cat.id} style={{ background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                      {/* Category row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer" }}
                        onClick={() => setExpandedCat(isExpanded ? null : cat.id)}>
                        {/* Checkbox for multi-select */}
                        {cat.reclaimable && cat.cleanCmd && (
                          <input
                            type="checkbox"
                            checked={selectedClean.has(cat.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedClean((prev) => {
                                const next = new Set(prev);
                                if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
                                return next;
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ accentColor: "#3fb950", cursor: "pointer" }}
                          />
                        )}
                        <span style={{ color: cat.reclaimable ? "#3fb950" : "var(--text-muted)", flexShrink: 0 }}>
                          {categoryIcons[cat.icon] || <HardDrive size={14} />}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, fontWeight: 500 }}>{cat.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: cat.sizeMB > 500 ? "#d29922" : "var(--text-secondary)" }}>
                              {formatSize(cat.sizeMB)}
                            </span>
                          </div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{cat.description}</div>
                        </div>
                      </div>

                      {/* Expanded: Preview + Actions */}
                      {isExpanded && (
                        <div style={{ padding: "6px 8px 8px", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 4 }}>
                          {/* Action buttons row */}
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                            {cat.previewCmd && (
                              <ActionBtn label={t("disk.inspect")} icon={<Search size={10} />}
                                onClick={() => runAction(activeConn, cat.previewCmd!, `Preview: ${cat.name}`)} />
                            )}
                            {(cat.actions || []).map((a, i) => (
                              <ActionBtn key={i} label={a.label} danger={a.danger}
                                onClick={() => runAction(activeConn, a.cmd, a.label)} />
                            ))}
                            <ActionBtn label={t("disk.terminal")} icon={<Terminal size={10} />}
                              onClick={() => {
                                const path = cat.id === "logs" ? "/var/log" : cat.id === "tmp" ? "/tmp" : cat.id === "cache" ? "/var/cache" : "~";
                                const executeSnippet = useAppStore.getState().executeSnippet;
                                if (executeSnippet) executeSnippet(`cd ${activeConn.name}:${path}`);
                              }} />
                            {cat.reclaimable && cat.cleanCmd && (
                              cleanConfirm?.catId === cat.id ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                                  {cleanConfirm.warning && (
                                    <div style={{ fontSize: 9, color: "#ffb347", background: "rgba(255,179,71,0.1)", padding: "4px 6px", borderRadius: 3, display: "flex", alignItems: "center", gap: 4 }}>
                                      <AlertTriangle size={10} style={{ flexShrink: 0 }} />
                                      <span>{cleanConfirm.warning}</span>
                                    </div>
                                  )}
                                  <div style={{ display: "flex", gap: 3 }}>
                                    <ActionBtn label={t("disk.confirmClean")} danger onClick={() => runClean(activeConn, cat.id, cat.cleanCmd!, cat.name)} />
                                    <ActionBtn label="Cancel" onClick={() => setCleanConfirm(null)} />
                                  </div>
                                </div>
                              ) : (
                                <ActionBtn label={t("disk.clean")} icon={<Eraser size={10} />}
                                  onClick={() => {
                                    const warnings: Record<string, string> = {
                                      docker: "This will remove ALL unused containers, networks, and dangling images. Running containers are safe.",
                                      oldkernels: "This will permanently remove old kernel packages. Current running kernel is always kept.",
                                      trash: "This will permanently empty the trash. Files cannot be recovered after this.",
                                      devcache: "This will clear npm, yarn, and pip download caches. Packages will re-download on next install.",
                                      journal: "This will delete system logs older than 7 days. Recent logs are preserved.",
                                    };
                                    setCleanConfirm({ catId: cat.id, cmd: cat.cleanCmd!, name: cat.name, warning: warnings[cat.id] });
                                  }} />
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Clean Selected summary */}
              {selectedTotal > 0 && (
                <div style={{
                  marginTop: 8, padding: "8px 10px",
                  background: "rgba(63,185,80,0.08)", border: "1px solid rgba(63,185,80,0.2)",
                  borderRadius: "var(--radius-sm)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#3fb950" }}>
                        {selectedClean.size} {t("disk.selected")} — ~{formatSize(selectedTotal)}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                        {activeAnalysis.categories.filter((c) => selectedClean.has(c.id)).map((c) => c.name).join(", ")}
                      </div>
                    </div>
                    {!batchConfirm ? (
                      <ActionBtn
                        label={t("disk.cleanSelected")}
                        icon={<Eraser size={10} />}
                        onClick={() => setBatchConfirm(true)}
                      />
                    ) : (
                      <div style={{ display: "flex", gap: 3 }}>
                        <ActionBtn
                          label={cleaningId === "__batch__" ? "Cleaning..." : t("disk.confirmClean")}
                          danger
                          icon={cleaningId === "__batch__" ? <RefreshCw size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Eraser size={10} />}
                          onClick={() => { setBatchConfirm(false); runCleanSelected(activeConn, activeAnalysis); }}
                        />
                        <ActionBtn label="Cancel" onClick={() => setBatchConfirm(false)} />
                      </div>
                    )}
                  </div>
                  {batchConfirm && (
                    <div style={{ fontSize: 9, color: "#ffb347", background: "rgba(255,179,71,0.1)", padding: "4px 6px", borderRadius: 3, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      <AlertTriangle size={10} style={{ flexShrink: 0 }} />
                      <span>This will permanently delete files from {selectedClean.size} categories (~{formatSize(selectedTotal)}). This action cannot be undone.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Scan timestamp */}
          <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "right" }}>
            {t("disk.lastScan")}: {new Date(activeAnalysis.timestamp).toLocaleTimeString()}
            {prevScan && <span> | {t("disk.previous")}: {new Date(prevScan.timestamp).toLocaleTimeString()}</span>}
          </div>
        </>
      )}

      {/* Command output modal */}
      {cmdOutput !== null && (
        <div style={{
          background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)", padding: 10, marginTop: 4,
          maxHeight: 220, overflow: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 11 }}>{cmdOutput.title}</span>
            <button onClick={() => setCmdOutput(null)} style={btnStyle}><XCircle size={12} /></button>
          </div>
          <pre style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre-wrap", color: "var(--text-secondary)", margin: 0 }}>
            {cmdOutput.text}
          </pre>
        </div>
      )}
    </div>
  );
}

// ──── Compare View (Cross-Server Correlation) ────
function CompareView({
  connections,
  infraMonitors,
  baselines,
}: {
  connections: SSHConnection[];
  infraMonitors: Record<string, { metrics: ServerMetrics[]; status: string }>;
  baselines: Record<string, { cpuAvg: number; memAvg: number; diskAvg: number; sampleCount: number }>;
}) {
  const t = useT();
  const monitoredConns = connections.filter((c) => infraMonitors[c.id] && infraMonitors[c.id].metrics.length > 0);

  if (monitoredConns.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 12 }}>
        <Activity size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div>{t("infra.startMonitoring")}</div>
        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}>{t("infra.connectFirst")}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Header row */}
      <div style={{ display: "flex", gap: 4, fontSize: 9, fontWeight: 600, color: "var(--text-muted)", padding: "0 4px" }}>
        <span style={{ width: 80 }}>Server</span>
        <span style={{ flex: 1, textAlign: "center" }}>CPU %</span>
        <span style={{ flex: 1, textAlign: "center" }}>MEM %</span>
        <span style={{ flex: 1, textAlign: "center" }}>DISK %</span>
        <span style={{ flex: 1, textAlign: "center" }}>Load</span>
        <span style={{ width: 40, textAlign: "center" }}>Score</span>
      </div>

      {/* Server rows */}
      {monitoredConns.map((conn) => {
        const data = infraMonitors[conn.id];
        const m = data.metrics[data.metrics.length - 1];
        const baseline = baselines[conn.id];
        const score = healthScore(m);
        const scoreCol = healthColor(score);

        const cpuDelta = baseline ? m.cpu - baseline.cpuAvg : 0;
        const memDelta = baseline ? m.memPercent - baseline.memAvg : 0;
        const diskDelta = baseline ? m.diskPercent - baseline.diskAvg : 0;

        const deltaColor = (d: number) => d > 15 ? "#ff7b72" : d > 5 ? "#d29922" : d < -5 ? "#3fb950" : "var(--text-muted)";
        const deltaText = (d: number) => d > 0 ? `+${d.toFixed(0)}` : d.toFixed(0);

        return (
          <div key={conn.id} style={{
            display: "flex", gap: 4, alignItems: "center", padding: "6px 4px",
            background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)",
            borderLeft: `3px solid ${scoreCol}`,
          }}>
            <span style={{ width: 80, fontSize: 10, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {conn.name}
            </span>

            {/* CPU */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: m.cpu >= 90 ? "#ff7b72" : m.cpu >= 70 ? "#d29922" : "var(--text-primary)" }}>
                {m.cpu.toFixed(0)}%
              </div>
              {baseline && <div style={{ fontSize: 8, color: deltaColor(cpuDelta) }}>{deltaText(cpuDelta)}</div>}
              <SparklineSVG data={data.metrics.slice(-20).map((s) => s.cpu)} width={50} height={12} color={m.cpu >= 90 ? "#ff7b72" : "#3fb950"} />
            </div>

            {/* MEM */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: m.memPercent >= 90 ? "#ff7b72" : m.memPercent >= 70 ? "#d29922" : "var(--text-primary)" }}>
                {m.memPercent.toFixed(0)}%
              </div>
              {baseline && <div style={{ fontSize: 8, color: deltaColor(memDelta) }}>{deltaText(memDelta)}</div>}
              <SparklineSVG data={data.metrics.slice(-20).map((s) => s.memPercent)} width={50} height={12} color="#58a6ff" />
            </div>

            {/* DISK */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: m.diskPercent >= 90 ? "#ff7b72" : m.diskPercent >= 70 ? "#d29922" : "var(--text-primary)" }}>
                {m.diskPercent.toFixed(0)}%
              </div>
              {baseline && <div style={{ fontSize: 8, color: deltaColor(diskDelta) }}>{deltaText(diskDelta)}</div>}
            </div>

            {/* Load */}
            <div style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--text-secondary)" }}>
              {m.loadAvg[0].toFixed(1)}
            </div>

            {/* Score */}
            <div style={{ width: 40, textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: scoreCol }}>{score}</span>
            </div>
          </div>
        );
      })}

      {/* Baseline info */}
      {Object.keys(baselines).length > 0 && (
        <div style={{ fontSize: 8, color: "var(--text-muted)", textAlign: "right", marginTop: 4 }}>
          Deltas shown vs baseline average ({Object.values(baselines)[0]?.sampleCount || 0} samples)
        </div>
      )}
    </div>
  );
}

// ──── Settings View ────
function SettingsView({
  thresholds,
  pollingInterval,
  onSetThresholds,
  onSetInterval,
}: {
  thresholds: any;
  pollingInterval: number;
  onSetThresholds: (t: any) => void;
  onSetInterval: (n: number) => void;
}) {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("infra.pollingInterval")}</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[5, 10, 15, 30, 60].map((n) => (
            <button
              key={n}
              onClick={() => onSetInterval(n)}
              style={{
                padding: "4px 8px",
                fontSize: 10,
                background: pollingInterval === n ? "var(--accent-primary)" : "var(--bg-tertiary)",
                color: pollingInterval === n ? "#fff" : "var(--text-secondary)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              {n}s
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("infra.alertThresholds")}</div>
        {(["cpu", "mem", "disk"] as const).map((metric) => {
          const wKey = `${metric}Warning` as keyof typeof thresholds;
          const cKey = `${metric}Critical` as keyof typeof thresholds;
          return (
            <div key={metric} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ width: 40, textTransform: "uppercase", fontSize: 10, color: "var(--text-muted)" }}>
                {metric}
              </span>
              <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, color: "var(--accent-warning)" }}>
                {t("infra.warn")}:
                <input
                  type="number"
                  value={thresholds[wKey]}
                  onChange={(e) => onSetThresholds({ [wKey]: Number(e.target.value) })}
                  style={inputStyle}
                  min={0}
                  max={100}
                />
                <span style={{ color: "var(--text-muted)", fontSize: 9 }}>%</span>
              </label>
              <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, color: "var(--accent-error)" }}>
                {t("infra.crit")}:
                <input
                  type="number"
                  value={thresholds[cKey]}
                  onChange={(e) => onSetThresholds({ [cKey]: Number(e.target.value) })}
                  style={inputStyle}
                  min={0}
                  max={100}
                />
                <span style={{ color: "var(--text-muted)", fontSize: 9 }}>%</span>
              </label>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 4, padding: "6px 8px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)" }}>
        <strong>{t("infra.overview")}:</strong> {t("infra.anomalyDesc")}
        <br /><br />
        <strong>{t("infra.alerts")}:</strong> {t("infra.correlationDesc")}
        <br /><br />
        <strong>{t("infra.timeline")}:</strong> {t("infra.timelineDesc")}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: 48,
  padding: "3px 6px",
  fontSize: 11,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
};
