import { useState, useCallback, useMemo } from "react";
import {
  HardDrive, Play, Plus, Trash2, Edit3, Check, X, Clock,
  Database, Server, FileArchive, Download,
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
  { id: "pg", name: "PostgreSQL", category: "database" as const, engine: "postgresql", command: "pg_dump -U {USER} {DB_NAME} | gzip > {OUTPUT_PATH}", description: "PostgreSQL database dump with gzip compression" },
  { id: "mysql", name: "MySQL", category: "database" as const, engine: "mysql", command: "mysqldump -u {USER} -p{PASSWORD} {DB_NAME} | gzip > {OUTPUT_PATH}", description: "MySQL full database dump with gzip" },
  { id: "mongo", name: "MongoDB", category: "database" as const, engine: "mongodb", command: "mongodump --db {DB_NAME} --archive={OUTPUT_PATH} --gzip", description: "MongoDB database archive with gzip" },
  { id: "sqlite", name: "SQLite", category: "database" as const, engine: "sqlite", command: "sqlite3 {DB_PATH} \".backup '{OUTPUT_PATH}'\"", description: "SQLite online backup copy" },
  { id: "tar", name: "System Tar", category: "system" as const, engine: "tar", command: "tar czf {OUTPUT_PATH} {SOURCE_PATHS}", description: "Compressed tar archive of directories" },
  { id: "rsync", name: "Rsync", category: "system" as const, engine: "rsync", command: "rsync -avz {SOURCE_PATHS} {OUTPUT_PATH}", description: "Rsync file synchronization" },
  { id: "custom", name: "Custom Command", category: "custom" as const, engine: "custom", command: "{COMMAND}", description: "Write your own backup command" },
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

// ──── Status Badge ────
function StatusBadge({ status }: { status: string | null }) {
  if (status === "success") return <span className="backup-status success"><CheckCircle size={12} /> Success</span>;
  if (status === "failed") return <span className="backup-status failed"><XCircle size={12} /> Failed</span>;
  if (status === "running") return <span className="backup-status running"><Loader2 size={12} /> Running</span>;
  return <span className="backup-status never">Never run</span>;
}

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
  name: "", connectionId: "", templateId: "", command: "",
  remotePath: "/tmp/backup-{DATE}.tar.gz", downloadLocal: false, localPath: "", schedule: "",
};

function JobForm({ initial, onSave, onCancel }: {
  initial: JobFormData;
  onSave: (d: JobFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<JobFormData>(initial);
  const sshConnections = useAppStore((s) => s.sshConnections);

  const set = useCallback(
    <K extends keyof JobFormData>(k: K, v: JobFormData[K]) => setForm((f) => ({ ...f, [k]: v })),
    [],
  );

  const handleTemplateChange = useCallback((tid: string) => {
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === tid);
    setForm((f) => ({ ...f, templateId: tid, command: tpl ? (tpl.command as string) : f.command }));
  }, []);

  return (
    <div className="backup-form">
      <div className="backup-form-grid">
        <div>
          <label className="backup-form-label">Job Name</label>
          <input className="backup-form-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Daily DB backup" />
        </div>
        <div>
          <label className="backup-form-label">Server</label>
          <select className="backup-form-input" value={form.connectionId} onChange={(e) => set("connectionId", e.target.value)}>
            <option value="">Select server...</option>
            {sshConnections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.host})</option>)}
          </select>
        </div>
      </div>

      <div className="backup-form-grid">
        <div>
          <label className="backup-form-label">Template</label>
          <select className="backup-form-input" value={form.templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
            <option value="">Select template...</option>
            {DEFAULT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="backup-form-label">Remote Output Path</label>
          <input className="backup-form-input" value={form.remotePath} onChange={(e) => set("remotePath", e.target.value)} placeholder="/tmp/backup.tar.gz" />
        </div>
      </div>

      <div>
        <label className="backup-form-label">Command</label>
        <textarea className="backup-form-textarea" value={form.command} onChange={(e) => set("command", e.target.value)} placeholder="Enter backup command..." />
      </div>

      <div className="backup-form-grid">
        <div>
          <label className="backup-form-label">Schedule (cron, empty = manual)</label>
          <input className="backup-form-input" value={form.schedule} onChange={(e) => set("schedule", e.target.value)} placeholder="0 2 * * *" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="backup-form-checkbox">
            <input type="checkbox" checked={form.downloadLocal} onChange={(e) => set("downloadLocal", e.target.checked)} style={{ accentColor: "var(--accent-primary)" }} />
            Download to local after backup
          </label>
          {form.downloadLocal && (
            <input className="backup-form-input" value={form.localPath} onChange={(e) => set("localPath", e.target.value)} placeholder="C:\Backups\" />
          )}
        </div>
      </div>

      <div className="backup-form-actions">
        <button className="infra-action-btn" onClick={onCancel}><X size={14} /> Cancel</button>
        <button className="infra-action-btn primary" onClick={() => onSave(form)} disabled={!form.name || !form.connectionId || !form.command}>
          <Check size={14} /> Save Job
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

  const kpis = useMemo(() => {
    const total = backupHistory.length;
    const successes = backupHistory.filter((r) => r.status === "success").length;
    const rate = total > 0 ? Math.round((successes / total) * 100) : 0;
    const lastTs = backupHistory.reduce((max, r) => Math.max(max, r.timestamp), 0);
    const totalSize = backupHistory.reduce((sum, r) => sum + r.sizeMB, 0);
    return { total, rate, lastTs, totalSize, activeJobs: backupJobs.length };
  }, [backupHistory, backupJobs]);

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
        password, privateKey: conn.privateKey || null, command: job.command,
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
      addBackupRecord({ jobId: job.id, jobName: job.name, serverName: conn.name, timestamp: Date.now(), status: "success", duration, sizeMB, output: (output || "").slice(0, 2000), error: null, downloaded: false });
      updateBackupJob(job.id, { lastRun: Date.now(), lastStatus: "success" });
    } catch (e) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      addBackupRecord({ jobId: job.id, jobName: job.name, serverName: conn.name, timestamp: Date.now(), status: "failed", duration, sizeMB: 0, output: "", error: String(e), downloaded: false });
      updateBackupJob(job.id, { lastRun: Date.now(), lastStatus: "failed" });
    } finally {
      setRunningJobs((s) => { const n = new Set(s); n.delete(job.id); return n; });
    }
  }, [sshConnections, addBackupRecord, updateBackupJob]);

  const handleSaveJob = useCallback((data: JobFormData) => {
    if (editingJob) {
      updateBackupJob(editingJob.id, { name: data.name, connectionId: data.connectionId, templateId: data.templateId || null, command: data.command, remotePath: data.remotePath, downloadLocal: data.downloadLocal, localPath: data.localPath, schedule: data.schedule || null });
    } else {
      addBackupJob({ name: data.name, connectionId: data.connectionId, templateId: data.templateId || null, command: data.command, remotePath: data.remotePath, downloadLocal: data.downloadLocal, localPath: data.localPath, schedule: data.schedule || null, enabled: true });
    }
    setShowForm(false);
    setEditingJob(null);
  }, [editingJob, addBackupJob, updateBackupJob]);

  const filteredHistory = useMemo(() => {
    let h = backupHistory;
    if (historyFilter !== "all") h = h.filter((r) => r.status === historyFilter);
    if (historyServerFilter) h = h.filter((r) => r.serverName === historyServerFilter);
    return [...h].sort((a, b) => b.timestamp - a.timestamp);
  }, [backupHistory, historyFilter, historyServerFilter]);

  const recentHistory = useMemo(() => [...backupHistory].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10), [backupHistory]);
  const serverNames = useMemo(() => [...new Set(backupHistory.map((r) => r.serverName))], [backupHistory]);

  return (
    <div className="backup-panel">
      {/* Header */}
      <div className="backup-header">
        <div className="backup-header-icon"><HardDrive size={16} /></div>
        <div className="backup-header-title">Backup Manager</div>
        <div style={{ flex: 1 }} />
        <div className="infra-tab-bar" style={{ flex: "none" }}>
          {([
            { key: "dashboard" as const, label: "Dashboard", icon: <Activity size={13} /> },
            { key: "jobs" as const, label: "Jobs", icon: <Server size={13} />, badge: backupJobs.length },
            { key: "history" as const, label: "History", icon: <Clock size={13} />, badge: backupHistory.length },
            { key: "templates" as const, label: "Templates", icon: <FileArchive size={13} /> },
          ] as const).map((tab) => (
            <button key={tab.key} className={`infra-tab${view === tab.key ? " active" : ""}`} onClick={() => setView(tab.key)}>
              {tab.icon} {tab.label}
              {"badge" in tab && tab.badge > 0 && <span className="infra-tab-badge">{tab.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="backup-view">
        {view === "dashboard" && (
          <>
            <div className="infra-kpi-row infra-fade-in">
              <div className="infra-kpi-card blue">
                <div className="infra-kpi-header"><div className="infra-kpi-icon blue"><Database size={16} /></div></div>
                <div className="infra-kpi-value">{kpis.total}</div>
                <div className="infra-kpi-label">Total Backups</div>
              </div>
              <div className={`infra-kpi-card ${kpis.rate >= 80 ? "green" : kpis.rate >= 50 ? "yellow" : "red"}`}>
                <div className="infra-kpi-header"><div className={`infra-kpi-icon ${kpis.rate >= 80 ? "green" : kpis.rate >= 50 ? "yellow" : "red"}`}><Activity size={16} /></div></div>
                <div className="infra-kpi-value">{kpis.rate}%</div>
                <div className="infra-kpi-label">Success Rate</div>
              </div>
              <div className="infra-kpi-card">
                <div className="infra-kpi-header"><div className="infra-kpi-icon"><Clock size={16} /></div></div>
                <div className="infra-kpi-value" style={{ fontSize: 18 }}>{kpis.lastTs ? formatRelativeTime(kpis.lastTs) : "N/A"}</div>
                <div className="infra-kpi-label">Last Backup</div>
              </div>
              <div className="infra-kpi-card green">
                <div className="infra-kpi-header"><div className="infra-kpi-icon green"><HardDrive size={16} /></div></div>
                <div className="infra-kpi-value">{kpis.totalSize < 1024 ? `${kpis.totalSize.toFixed(1)} MB` : `${(kpis.totalSize / 1024).toFixed(2)} GB`}</div>
                <div className="infra-kpi-label">Total Storage</div>
              </div>
              <div className="infra-kpi-card blue">
                <div className="infra-kpi-header"><div className="infra-kpi-icon blue"><Calendar size={16} /></div></div>
                <div className="infra-kpi-value">{kpis.activeJobs}</div>
                <div className="infra-kpi-label">Active Jobs</div>
              </div>
            </div>

            <div className="backup-section-title" style={{ marginTop: 20 }}>Recent Backup History</div>
            {recentHistory.length === 0 ? (
              <div className="backup-empty">
                <FileArchive size={36} className="backup-empty-icon" />
                <div className="backup-empty-text">No backups executed yet.<br />Create a job and run your first backup.</div>
              </div>
            ) : (
              <table className="backup-table">
                <thead><tr><th>Time</th><th>Job</th><th>Server</th><th>Status</th><th>Duration</th><th>Size</th></tr></thead>
                <tbody>
                  {recentHistory.map((r) => (
                    <tr key={r.id}>
                      <td className="col-mono">{formatRelativeTime(r.timestamp)}</td>
                      <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.jobName}</td>
                      <td>{r.serverName}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="col-mono">{formatDuration(r.duration)}</td>
                      <td className="col-mono">{r.sizeMB > 0 ? `${r.sizeMB.toFixed(2)} MB` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {view === "jobs" && (
          <>
            <div className="backup-toolbar">
              <div className="backup-section-title" style={{ margin: 0 }}>Backup Jobs</div>
              {!showForm && (
                <button className="infra-action-btn primary" onClick={() => { setEditingJob(null); setShowForm(true); }}>
                  <Plus size={14} /> New Job
                </button>
              )}
            </div>

            {showForm && (
              <div style={{ marginBottom: 14 }}>
                <JobForm
                  initial={editingJob ? { name: editingJob.name, connectionId: editingJob.connectionId, templateId: editingJob.templateId || "", command: editingJob.command, remotePath: editingJob.remotePath, downloadLocal: editingJob.downloadLocal, localPath: editingJob.localPath, schedule: editingJob.schedule || "" } : emptyForm}
                  onSave={handleSaveJob}
                  onCancel={() => { setShowForm(false); setEditingJob(null); }}
                />
              </div>
            )}

            {backupJobs.length === 0 && !showForm ? (
              <div className="backup-empty">
                <Server size={36} className="backup-empty-icon" />
                <div className="backup-empty-text">No backup jobs configured yet.<br />Click "New Job" to create your first backup job.</div>
              </div>
            ) : (
              <div className="backup-job-list">
                {backupJobs.map((job) => {
                  const conn = sshConnections.find((c) => c.id === job.connectionId);
                  const isRunning = runningJobs.has(job.id);
                  return (
                    <div key={job.id} className="backup-job-card">
                      <div className={`backup-job-status-dot ${isRunning ? "running" : job.lastStatus || "never"}`} />
                      <div className="backup-job-info">
                        <div className="backup-job-name">{job.name}</div>
                        <div className="backup-job-meta">
                          <span className="backup-job-meta-item"><Server size={11} /> {conn?.name || "Unknown"}</span>
                          {job.schedule && <span className="backup-job-meta-item"><Calendar size={11} /> {job.schedule}</span>}
                          {job.lastRun && <span className="backup-job-meta-item"><Clock size={11} /> {formatRelativeTime(job.lastRun)}</span>}
                          {job.downloadLocal && <span className="backup-job-meta-item"><Download size={11} /> Local</span>}
                        </div>
                        <div className="backup-job-command">{job.command}</div>
                      </div>
                      <div className="backup-job-actions">
                        <button className="infra-action-btn primary" onClick={() => executeBackup(job)} disabled={isRunning} title="Run Now">
                          {isRunning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={14} />}
                        </button>
                        <button className="infra-action-btn" onClick={() => { setEditingJob(job); setShowForm(true); }} title="Edit"><Edit3 size={14} /></button>
                        <button className="infra-action-btn danger" onClick={() => removeBackupJob(job.id)} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {view === "history" && (
          <>
            <div className="backup-toolbar">
              <div className="backup-section-title" style={{ margin: 0 }}>Backup History</div>
              <div className="backup-filters">
                <select className="backup-filter-select" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)}>
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>
                <select className="backup-filter-select" value={historyServerFilter} onChange={(e) => setHistoryServerFilter(e.target.value)}>
                  <option value="">All Servers</option>
                  {serverNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {backupHistory.length > 0 && (
                  <button className="infra-action-btn danger" onClick={clearBackupHistory}><Trash2 size={12} /> Clear</button>
                )}
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="backup-empty">
                <Clock size={36} className="backup-empty-icon" />
                <div className="backup-empty-text">No backup history found.</div>
              </div>
            ) : (
              <table className="backup-table">
                <thead><tr><th>Time</th><th>Job</th><th>Server</th><th>Status</th><th>Duration</th><th>Size</th><th>Output</th></tr></thead>
                <tbody>
                  {filteredHistory.map((r) => (
                    <tr key={r.id}>
                      <td className="col-mono" style={{ whiteSpace: "nowrap" }}>{new Date(r.timestamp).toLocaleString()}</td>
                      <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.jobName}</td>
                      <td>{r.serverName}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="col-mono">{formatDuration(r.duration)}</td>
                      <td className="col-mono">{r.sizeMB > 0 ? `${r.sizeMB.toFixed(2)} MB` : "—"}</td>
                      <td className="col-output">{r.error || r.output || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {view === "templates" && (
          <>
            <div className="backup-section-title">Backup Templates</div>
            <div className="backup-template-grid">
              {DEFAULT_TEMPLATES.map((tpl) => (
                <div key={tpl.id} className={`backup-template-card ${tpl.category}`}>
                  <div className="backup-template-header">
                    <span className="backup-template-name">{tpl.name}</span>
                    <span className={`backup-template-badge ${tpl.category}`}>{tpl.category}</span>
                  </div>
                  <div className="backup-template-desc">{tpl.description}</div>
                  <div className="backup-template-engine"><HardDrive size={10} /> {tpl.engine}</div>
                  <div className="backup-template-command">{tpl.command}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
