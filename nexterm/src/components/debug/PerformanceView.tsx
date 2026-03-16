import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Cpu,
  MemoryStick,
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { useT } from "../../i18n";

let tauriCoreCache: typeof import("@tauri-apps/api/core") | null = null;
async function getTauriCore() {
  if (!tauriCoreCache) tauriCoreCache = await import("@tauri-apps/api/core");
  return tauriCoreCache;
}

interface ProcessInfo {
  pid: number;
  name: string;
  cpu_usage: number;
  memory_bytes: number;
}

// Unicode sparkline characters (8 levels)
const SPARK_CHARS = "▁▂▃▄▅▆▇█";

function sparkline(data: number[], maxVal = 100): string {
  if (data.length === 0) return "";
  const max = maxVal > 0 ? maxVal : Math.max(...data, 1);
  return data.map((v) => {
    const idx = Math.min(Math.floor((v / max) * 7), 7);
    return SPARK_CHARS[idx < 0 ? 0 : idx];
  }).join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function PerformanceView() {
  const t = useT();
  const systemStats = useAppStore((s) => s.systemStats);
  const metricsHistory = useAppStore((s) => s.metricsHistory);
  const sessionStartTime = useAppStore((s) => s.sessionStartTime);
  const commandCount = useAppStore((s) => s.commandCount);
  const errorCount = useAppStore((s) => s.errorCount);

  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processesLoading, setProcessesLoading] = useState(false);
  const [showProcesses, setShowProcesses] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchProcesses = useCallback(async () => {
    setProcessesLoading(true);
    try {
      const { invoke } = await getTauriCore();
      const procs = await invoke<ProcessInfo[]>("get_process_list");
      setProcesses(procs);
    } catch {
      // Backend command might not be available yet
      setProcesses([]);
    }
    setProcessesLoading(false);
  }, []);

  // Auto-refresh processes every 10s
  useEffect(() => {
    fetchProcesses();
    if (!autoRefresh) return;
    const interval = setInterval(fetchProcesses, 10000);
    return () => clearInterval(interval);
  }, [fetchProcesses, autoRefresh]);

  // Session duration
  const sessionDuration = useMemo(() => {
    return Math.floor((Date.now() - sessionStartTime) / 1000);
  }, [sessionStartTime]);

  // Refresh duration every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const cpuColor = (val: number) => {
    if (val > 80) return "#ff4444";
    if (val > 50) return "#d29922";
    return "var(--accent-secondary)";
  };

  const memColor = (val: number) => {
    if (val > 85) return "#ff4444";
    if (val > 60) return "#d29922";
    return "var(--accent-primary)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Activity size={13} style={{ color: "var(--accent-primary)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
          {t("perfMonitor.title")}
        </span>
      </div>

      {/* Session stats bar */}
      <div style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
      }}>
        <StatPill icon={<Clock size={9} />} label={t("perfMonitor.session")} value={formatUptime(sessionDuration)} />
        <StatPill icon={<Activity size={9} />} label={t("perfMonitor.cmds")} value={String(commandCount)} />
        <StatPill
          icon={<Activity size={9} />}
          label={t("perfMonitor.errors")}
          value={String(errorCount)}
          color={errorCount > 0 ? "var(--accent-error)" : undefined}
        />
      </div>

      {/* CPU Chart */}
      <MetricCard
        icon={<Cpu size={12} />}
        label={t("perfMonitor.cpuUsage")}
        value={systemStats ? `${systemStats.cpu.toFixed(1)}%` : "--"}
        color={systemStats ? cpuColor(systemStats.cpu) : "var(--text-muted)"}
        sparkData={metricsHistory.cpu}
        sparkMax={100}
        sparkColor={systemStats ? cpuColor(systemStats.cpu) : "var(--text-muted)"}
      />

      {/* Memory Chart */}
      <MetricCard
        icon={<MemoryStick size={12} />}
        label={t("perfMonitor.memory")}
        value={systemStats ? `${systemStats.memoryPercent.toFixed(1)}%` : "--"}
        subtitle={systemStats ? `${formatBytes(systemStats.memoryUsed)} / ${formatBytes(systemStats.memoryTotal)}` : ""}
        color={systemStats ? memColor(systemStats.memoryPercent) : "var(--text-muted)"}
        sparkData={metricsHistory.memory}
        sparkMax={100}
        sparkColor={systemStats ? memColor(systemStats.memoryPercent) : "var(--text-muted)"}
      />

      {/* Process List */}
      <div style={{
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-subtle)",
        background: "var(--bg-tertiary)",
        overflow: "hidden",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}>
        {/* Process header */}
        <div
          onClick={() => setShowProcesses(!showProcesses)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            cursor: "pointer",
            borderBottom: showProcesses ? "1px solid var(--border-subtle)" : "none",
          }}
        >
          {showProcesses
            ? <ChevronDown size={10} style={{ color: "var(--text-muted)" }} />
            : <ChevronRight size={10} style={{ color: "var(--text-muted)" }} />
          }
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
            {t("perfMonitor.topProcesses")}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchProcesses();
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
            }}
            title={t("common.refresh")}
          >
            <RefreshCw size={10} className={processesLoading ? "animate-pulse" : ""} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setAutoRefresh(!autoRefresh);
            }}
            style={{
              background: autoRefresh ? "var(--accent-primary)" : "var(--bg-active)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: autoRefresh ? "white" : "var(--text-muted)",
              cursor: "pointer",
              padding: "1px 5px",
              fontSize: 8,
              fontFamily: "inherit",
            }}
            title={autoRefresh ? t("perfMonitor.autoRefreshOn") : t("perfMonitor.autoRefreshOff")}
          >
            {t("perfMonitor.auto")}
          </button>
        </div>

        {/* Process table */}
        {showProcesses && (
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {/* Table header */}
            <div style={{
              display: "flex",
              padding: "3px 10px",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              borderBottom: "1px solid var(--border-subtle)",
              background: "var(--bg-primary)",
              position: "sticky",
              top: 0,
            }}>
              <span style={{ flex: 2, minWidth: 0 }}>{t("perfMonitor.nameCol")}</span>
              <span style={{ width: 40, textAlign: "right" }}>{t("perfMonitor.pidCol")}</span>
              <span style={{ width: 48, textAlign: "right" }}>{t("perfMonitor.cpuCol")}</span>
              <span style={{ width: 56, textAlign: "right" }}>{t("perfMonitor.memCol")}</span>
            </div>

            {processes.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", fontSize: 10, color: "var(--text-muted)" }}>
                {processesLoading ? t("common.loading") : t("perfMonitor.noProcessData")}
              </div>
            ) : (
              processes.map((proc, idx) => (
                <div
                  key={`${proc.pid}-${idx}`}
                  style={{
                    display: "flex",
                    padding: "3px 10px",
                    fontSize: 10,
                    borderBottom: "1px solid var(--border-subtle)",
                    alignItems: "center",
                    transition: "var(--transition-fast)",
                  }}
                  className="debug-log-entry"
                >
                  <span style={{
                    flex: 2,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--text-primary)",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                  }}>
                    {proc.name}
                  </span>
                  <span style={{
                    width: 40,
                    textAlign: "right",
                    color: "var(--text-muted)",
                    fontSize: 9,
                    fontFamily: "monospace",
                  }}>
                    {proc.pid}
                  </span>
                  <span style={{
                    width: 48,
                    textAlign: "right",
                    fontFamily: "monospace",
                    fontSize: 9,
                    color: cpuColor(proc.cpu_usage),
                    fontWeight: proc.cpu_usage > 10 ? 700 : 400,
                  }}>
                    {proc.cpu_usage.toFixed(1)}
                  </span>
                  <span style={{
                    width: 56,
                    textAlign: "right",
                    fontFamily: "monospace",
                    fontSize: 9,
                    color: "var(--text-secondary)",
                  }}>
                    {formatBytes(proc.memory_bytes)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 8px",
      borderRadius: 10,
      background: "var(--bg-tertiary)",
      border: "1px solid var(--border-subtle)",
      fontSize: 9,
    }}>
      <span style={{ color: "var(--text-muted)", display: "flex" }}>{icon}</span>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || "var(--text-primary)", fontFamily: "monospace" }}>
        {value}
      </span>
    </div>
  );
}

function MetricCard({ icon, label, value, subtitle, color, sparkData, sparkMax, sparkColor }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
  sparkData: number[];
  sparkMax: number;
  sparkColor: string;
}) {
  const t = useT();
  const spark = sparkline(sparkData, sparkMax);
  const hasData = sparkData.length > 0;

  // Min/max/avg
  const min = hasData ? Math.min(...sparkData).toFixed(1) : "--";
  const max = hasData ? Math.max(...sparkData).toFixed(1) : "--";
  const avg = hasData ? (sparkData.reduce((a, b) => a + b, 0) / sparkData.length).toFixed(1) : "--";

  return (
    <div style={{
      padding: "8px 10px",
      borderRadius: "var(--radius-sm)",
      border: "1px solid var(--border-subtle)",
      background: "var(--bg-tertiary)",
    }}>
      {/* Label + value row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
          {label}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "monospace" }}>
          {value}
        </span>
      </div>

      {subtitle && (
        <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4, textAlign: "right" }}>
          {subtitle}
        </div>
      )}

      {/* Sparkline */}
      <div style={{
        fontFamily: "monospace",
        fontSize: 12,
        letterSpacing: "0.5px",
        color: sparkColor,
        lineHeight: 1,
        overflow: "hidden",
        whiteSpace: "nowrap",
        marginBottom: 4,
        opacity: hasData ? 1 : 0.3,
      }}>
        {hasData ? spark : SPARK_CHARS.repeat(4)}
      </div>

      {/* Min/Avg/Max */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)" }}>
        <span>{t("perfMonitor.min")} {min}%</span>
        <span>{t("perfMonitor.avg")} {avg}%</span>
        <span>{t("perfMonitor.max")} {max}%</span>
      </div>
    </div>
  );
}
