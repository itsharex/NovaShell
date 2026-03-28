import { useState, useCallback, useMemo } from "react";
import {
  HardDrive, Play, Plus, Trash2, Edit3, Check, X, Clock,
  Database, Server, FileArchive, RefreshCw, Download,
  CheckCircle, XCircle, Activity, Calendar, Loader2,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { BackupJob, BackupRecord } from "../store/appStore";

let invokeCache: typeof import("@tauri-apps/api/core").invoke | null = null;
async function getInvoke() {
  if (!invokeCache) invokeCache = (await import("@tauri-apps/api/core")).invoke;
  return invokeCache;
}

type BackupView = "dashboard" | "jobs" | "history" | "templates";

const DEFAULT_TEMPLATES = [
  { id: "pg", name: "PostgreSQL", category: "database" as const, engine: "postgresql", command: "pg_dump -U {USER} {DB_NAME} | gzip > {OUTPUT_PATH}", description: "PostgreSQL database dump" },
  { id: "mysql", name: "MySQL", category: "database" as const, engine: "mysql", command: "mysqldump -u {USER} -p{PASSWORD} {DB_NAME} | gzip > {OUTPUT_PATH}", description: "MySQL database dump" },
  { id: "mongo", name: "MongoDB", category: "database" as const, engine: "mongodb", command: "mongodump --db {DB_NAME} --archive={OUTPUT_PATH} --gzip", description: "MongoDB database archive" },
  { id: "sqlite", name: "SQLite", category: "database" as const, engine: "sqlite", command: "sqlite3 {DB_PATH} \".backup '{OUTPUT_PATH}'\"", description: "SQLite database backup" },
  { id: "tar", name: "System Tar", category: "system" as const, engine: "tar", command: "tar czf {OUTPUT_PATH} {SOURCE_PATHS}", description: "Compressed tar archive" },
  { id: "rsync", name: "Rsync", category: "system" as const, engine: "rsync", command: "rsync -avz {SOURCE_PATHS} {OUTPUT_PATH}", description: "Rsync file synchronization" },
  { id: "custom", name: "Custom Command", category: "custom" as const, engine: "custom", command: "{COMMAND}", description: "Custom backup command" },
] as const;

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-primary)",
  border: "1px solid var(--border-primary)",
  borderRadius: 6,
  padding: "6px 10px",
  color: "var(--text-primary)",
  fontSize: 13,
  width: "100%",
  outline: "none",
};

const selectStyle: React.CSSProperties = { ...inputStyle };

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  marginBottom: 4,
  display: "block",
};

const categoryColor: Record<string, string> = {
  database: "blue",
  system: "green",
  custom: "yellow",
};

// ──── Job Form ────

interface JobFormData {
  name: string;
  connectionId: string;
  templateId: string;
  command: string;
  remotePath: string;
  downloadLocal: boolean;
  localPath: string;
  schedule: string;
}

const emptyForm: JobFormData = {
  name: "",
  connectionId: "",
  templateId: "",
  command: "",
  remotePath: "/tmp/backup-{DATE}.tar.gz",
  downloadLocal: false,
  localPath: "",
  schedule: "",
};

function JobForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: JobFormData;
  onSave: (d: JobFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<JobFormData>(initial);
  const sshConnections = useAppStore((s) => s.sshConnections);

  const set = useCallback(
    <K extends keyof JobFormData>(k: K, v: JobFormData[K]) =>
      setForm((f) => ({ ...f, [k]: v })),
    [],
  );

  const handleTemplateChange = useCallback((tid: string) => {
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === tid);
    setForm((f) => ({
      ...f,
      templateId: tid,
      command: tpl ? (tpl.command as string) : f.command,
    }));
  }, []);

  return (
    <div style={{ background: "var(--bg-secondary)", borderRadius: 8, padding: 16, border: "1px solid var(--border-primary)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Job Name</label>
          <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Daily DB backup" />
        </div>
        <div>
          <label style={labelStyle}>Server</label>
          <select style={selectStyle} value={form.connectionId} onChange={(e) => set("connectionId", e.target.value)}>
            <option value="">Select server...</option>
            {sshConnections.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.host})</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Template</label>
          <select style={selectStyle} value={form.templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
            <option value="">Select template...</option>
            {DEFAULT_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Remote Output Path</label>
          <input style={inputStyle} value={form.remotePath} onChange={(e) => set("remotePath", e.target.value)} placeholder="/tmp/backup.tar.gz" />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Command</label>
        <textarea
          style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          value={form.command}
          onChange={(e) => set("command", e.target.value)}
          placeholder="Enter backup command..."
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Schedule (cron, empty = manual)</label>
          <input style={inputStyle} value={form.schedule} onChange={(e) => set("schedule", e.target.value)} placeholder="0 2 * * *" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={form.downloadLocal} onChange={(e) => set("downloadLocal", e.target.checked)} />
            Download to local after backup
          </label>
          {form.downloadLocal && (
            <input style={inputStyle} value={form.localPath} onChange={(e) => set("localPath", e.target.value)} placeholder="C:\\Backups\\" />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="infra-action-btn" onClick={onCancel}><X size={14} /> Cancel</button>
        <button className="infra-action-btn primary" onClick={() => onSave(form)} disabled={!form.name || !form.connectionId || !form.command}>
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

// ──── Main Component ────

export function BackupPanel() {
  const [view, setView] = useState<BackupView>("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<BackupJob | null>(null);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [historyFilter, setHistoryFilter] = useState<"all" | "success" | "failed">("all");
  const [historyServerFilter, setHistoryServerFilter] = useState("");

  const backupJobs = useAppStore((s) => s.backupJobs);
  const backupHistory = useAppStore((s) => s.backupHistory);
  const sshConnections = useAppStore((s) => s.sshConnections);
  const addBackupJob = useAppStore((s) => s.addBackupJob);
  const updateBackupJob = useAppStore((s) => s.updateBackupJob);
  const removeBackupJob = useAppStore((s) => s.removeBackupJob);
  const addBackupRecord = useAppStore((s) => s.addBackupRecord);
  const clearBackupHistory = useAppStore((s) => s.clearBackupHistory);

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = backupHistory.length;
    const successes = backupHistory.filter((r) => r.status === "success").length;
    const rate = total > 0 ? Math.round((successes / total) * 100) : 0;
    const lastTs = backupHistory.reduce((max, r) => Math.max(max, r.timestamp), 0);
    const totalSize = backupHistory.reduce((sum, r) => sum + r.sizeMB, 0);
    return { total, rate, lastTs, totalSize, activeJobs: backupJobs.length };
  }, [backupHistory, backupJobs]);

  // ── Execute backup ──
  const executeBackup = useCallback(async (job: BackupJob) => {
    const conn = sshConnections.find((c) => c.id === job.connectionId);
    if (!conn) return;

    setRunningJobs((s) => new Set(s).add(job.id));
    const invoke = await getInvoke();
    const startTime = Date.now();

    let password = conn.sessionPassword || null;
    if (!password && !conn.privateKey) {
      try { password = await invoke("keychain_get_password", { connectionId: conn.id }) as string; } catch { /* noop */ }
    }

    try {
      const output = await invoke("ssh_exec", {
        host: conn.host, port: conn.port, username: conn.username,
        password, privateKey: conn.privateKey || null,
        command: job.command,
      }) as string;

      let sizeMB = 0;
      try {
        const sizeOutput = await invoke("ssh_exec", {
          host: conn.host, port: conn.port, username: conn.username,
          password, privateKey: conn.privateKey || null,
          command: `stat -c%s "${job.remotePath}" 2>/dev/null || echo 0`,
        }) as string;
        sizeMB = parseFloat(sizeOutput) / (1024 * 1024);
      } catch { /* noop */ }

      const duration = Math.round((Date.now() - startTime) / 1000);
      addBackupRecord({
        jobId: job.id, jobName: job.name, serverName: conn.name,
        timestamp: Date.now(), status: "success", duration, sizeMB,
        output: (output || "").slice(0, 2000), error: null, downloaded: false,
      });
      updateBackupJob(job.id, { lastRun: Date.now(), lastStatus: "success" });
    } catch (e) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      addBackupRecord({
        jobId: job.id, jobName: job.name, serverName: conn.name,
        timestamp: Date.now(), status: "failed", duration, sizeMB: 0,
        output: "", error: String(e), downloaded: false,
      });
      updateBackupJob(job.id, { lastRun: Date.now(), lastStatus: "failed" });
    } finally {
      setRunningJobs((s) => { const n = new Set(s); n.delete(job.id); return n; });
    }
  }, [sshConnections, addBackupRecord, updateBackupJob]);

  // ── Save job (create or update) ──
  const handleSaveJob = useCallback((data: JobFormData) => {
    if (editingJob) {
      updateBackupJob(editingJob.id, {
        name: data.name,
        connectionId: data.connectionId,
        templateId: data.templateId || null,
        command: data.command,
        remotePath: data.remotePath,
        downloadLocal: data.downloadLocal,
        localPath: data.localPath,
        schedule: data.schedule || null,
      });
    } else {
      addBackupJob({
        name: data.name,
        connectionId: data.connectionId,
        templateId: data.templateId || null,
        command: data.command,
        remotePath: data.remotePath,
        downloadLocal: data.downloadLocal,
        localPath: data.localPath,
        schedule: data.schedule || null,
        enabled: true,
      });
    }
    setShowForm(false);
    setEditingJob(null);
  }, [editingJob, addBackupJob, updateBackupJob]);

  // ── Filtered history ──
  const filteredHistory = useMemo(() => {
    let h = backupHistory;
    if (historyFilter !== "all") h = h.filter((r) => r.status === historyFilter);
    if (historyServerFilter) h = h.filter((r) => r.serverName === historyServerFilter);
    return [...h].sort((a, b) => b.timestamp - a.timestamp);
  }, [backupHistory, historyFilter, historyServerFilter]);

  const recentHistory = useMemo(
    () => [...backupHistory].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10),
    [backupHistory],
  );

  const serverNames = useMemo(
    () => [...new Set(backupHistory.map((r) => r.serverName))],
    [backupHistory],
  );

  // ── Render helpers ──
  function statusBadge(status: string | null) {
    if (status === "success") return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent-secondary)", fontSize: 12 }}><CheckCircle size={13} /> Success</span>;
    if (status === "failed") return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent-error)", fontSize: 12 }}><XCircle size={13} /> Failed</span>;
    if (status === "running") return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent-warning)", fontSize: 12 }}><Loader2 size={13} className="spin" /> Running</span>;
    return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Never run</span>;
  }

  // ────────────────────── VIEWS ──────────────────────

  function renderDashboard() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* KPI Row */}
        <div className="infra-kpi-row">
          <div className="infra-kpi-card blue">
            <div className="infra-kpi-header">
              <div className="infra-kpi-icon blue"><Database size={16} /></div>
            </div>
            <div className="infra-kpi-value">{kpis.total}</div>
            <div className="infra-kpi-label">Total Backups</div>
          </div>
          <div className={`infra-kpi-card ${kpis.rate >= 80 ? "green" : kpis.rate >= 50 ? "yellow" : "red"}`}>
            <div className="infra-kpi-header">
              <div className={`infra-kpi-icon ${kpis.rate >= 80 ? "green" : kpis.rate >= 50 ? "yellow" : "red"}`}><Activity size={16} /></div>
            </div>
            <div className="infra-kpi-value">{kpis.rate}%</div>
            <div className="infra-kpi-label">Success Rate</div>
          </div>
          <div className="infra-kpi-card">
            <div className="infra-kpi-header">
              <div className="infra-kpi-icon"><Clock size={16} /></div>
            </div>
            <div className="infra-kpi-value" style={{ fontSize: 18 }}>{kpis.lastTs ? formatRelativeTime(kpis.lastTs) : "N/A"}</div>
            <div className="infra-kpi-label">Last Backup</div>
          </div>
          <div className="infra-kpi-card green">
            <div className="infra-kpi-header">
              <div className="infra-kpi-icon green"><HardDrive size={16} /></div>
            </div>
            <div className="infra-kpi-value">{kpis.totalSize < 1024 ? `${kpis.totalSize.toFixed(1)} MB` : `${(kpis.totalSize / 1024).toFixed(2)} GB`}</div>
            <div className="infra-kpi-label">Total Storage</div>
          </div>
          <div className="infra-kpi-card blue">
            <div className="infra-kpi-header">
              <div className="infra-kpi-icon blue"><Calendar size={16} /></div>
            </div>
            <div className="infra-kpi-value">{kpis.activeJobs}</div>
            <div className="infra-kpi-label">Active Jobs</div>
          </div>
        </div>

        {/* Recent History */}
        <div>
          <h3 style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 10 }}>Recent Backup History</h3>
          {recentHistory.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
              <FileArchive size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div>No backups executed yet. Create a job and run your first backup.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Time</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Job</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Server</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Status</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Duration</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                      <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{formatRelativeTime(r.timestamp)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-primary)" }}>{r.jobName}</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{r.serverName}</td>
                      <td style={{ padding: "6px 8px" }}>{statusBadge(r.status)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{formatDuration(r.duration)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{r.sizeMB > 0 ? `${r.sizeMB.toFixed(2)} MB` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderJobs() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 14, color: "var(--text-primary)", margin: 0 }}>Backup Jobs</h3>
          {!showForm && (
            <button className="infra-action-btn primary" onClick={() => { setEditingJob(null); setShowForm(true); }}>
              <Plus size={14} /> New Job
            </button>
          )}
        </div>

        {showForm && (
          <JobForm
            initial={editingJob ? {
              name: editingJob.name,
              connectionId: editingJob.connectionId,
              templateId: editingJob.templateId || "",
              command: editingJob.command,
              remotePath: editingJob.remotePath,
              downloadLocal: editingJob.downloadLocal,
              localPath: editingJob.localPath,
              schedule: editingJob.schedule || "",
            } : emptyForm}
            onSave={handleSaveJob}
            onCancel={() => { setShowForm(false); setEditingJob(null); }}
          />
        )}

        {backupJobs.length === 0 && !showForm && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
            <Server size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div>No backup jobs configured yet.</div>
            <div style={{ marginTop: 4 }}>Click "New Job" to create your first backup job.</div>
          </div>
        )}

        {backupJobs.map((job) => {
          const conn = sshConnections.find((c) => c.id === job.connectionId);
          const isRunning = runningJobs.has(job.id);
          return (
            <div key={job.id} style={{ background: "var(--bg-secondary)", borderRadius: 8, padding: 14, border: "1px solid var(--border-primary)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 14 }}>{job.name}</span>
                  {statusBadge(job.lastStatus)}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Server size={12} /> {conn?.name || "Unknown"}</span>
                  {job.schedule && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Calendar size={12} /> {job.schedule}</span>}
                  {job.lastRun && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {formatRelativeTime(job.lastRun)}</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job.command}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="infra-action-btn primary" onClick={() => executeBackup(job)} disabled={isRunning} title="Run Now">
                  {isRunning ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                </button>
                <button className="infra-action-btn" onClick={() => { setEditingJob(job); setShowForm(true); }} title="Edit">
                  <Edit3 size={14} />
                </button>
                <button className="infra-action-btn danger" onClick={() => removeBackupJob(job.id)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderHistory() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ fontSize: 14, color: "var(--text-primary)", margin: 0 }}>Backup History</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select style={{ ...selectStyle, width: "auto" }} value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)}>
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
            <select style={{ ...selectStyle, width: "auto" }} value={historyServerFilter} onChange={(e) => setHistoryServerFilter(e.target.value)}>
              <option value="">All Servers</option>
              {serverNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {backupHistory.length > 0 && (
              <button className="infra-action-btn danger" onClick={clearBackupHistory} title="Clear History">
                <Trash2 size={14} /> Clear
              </button>
            )}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
            <Clock size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div>No backup history found.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Time</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Job</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Server</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Status</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Duration</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Size</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Output</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{new Date(r.timestamp).toLocaleString()}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-primary)" }}>{r.jobName}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{r.serverName}</td>
                    <td style={{ padding: "6px 8px" }}>{statusBadge(r.status)}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{formatDuration(r.duration)}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{r.sizeMB > 0 ? `${r.sizeMB.toFixed(2)} MB` : "—"}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}>
                      {r.error || r.output || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderTemplates() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ fontSize: 14, color: "var(--text-primary)", margin: 0 }}>Backup Templates</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {DEFAULT_TEMPLATES.map((tpl) => (
            <div key={tpl.id} style={{ background: "var(--bg-secondary)", borderRadius: 8, padding: 14, border: "1px solid var(--border-primary)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 14 }}>{tpl.name}</span>
                <span style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: categoryColor[tpl.category] === "blue" ? "rgba(88,166,255,0.12)" : categoryColor[tpl.category] === "green" ? "rgba(63,185,80,0.12)" : "rgba(210,153,34,0.12)",
                  color: categoryColor[tpl.category] === "blue" ? "var(--accent-primary)" : categoryColor[tpl.category] === "green" ? "var(--accent-secondary)" : "var(--accent-warning)",
                }}>
                  {tpl.category}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{tpl.description}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                <HardDrive size={11} /> Engine: {tpl.engine}
              </div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", background: "var(--bg-primary)", borderRadius: 4, padding: "6px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tpl.command}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ──── Main Render ────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Tab bar */}
      <div className="infra-tab-bar">
        {([
          { key: "dashboard" as const, label: "Dashboard", icon: <Activity size={14} /> },
          { key: "jobs" as const, label: "Jobs", icon: <Server size={14} /> },
          { key: "history" as const, label: "History", icon: <Clock size={14} /> },
          { key: "templates" as const, label: "Templates", icon: <FileArchive size={14} /> },
        ]).map((tab) => (
          <button key={tab.key} className={`infra-tab${view === tab.key ? " active" : ""}`} onClick={() => setView(tab.key)}>
            {tab.icon} {tab.label}
            {tab.key === "jobs" && backupJobs.length > 0 && <span className="infra-tab-badge">{backupJobs.length}</span>}
            {tab.key === "history" && backupHistory.length > 0 && <span className="infra-tab-badge">{backupHistory.length}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {view === "dashboard" && renderDashboard()}
        {view === "jobs" && renderJobs()}
        {view === "history" && renderHistory()}
        {view === "templates" && renderTemplates()}
      </div>
    </div>
  );
}
