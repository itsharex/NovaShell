import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  HardDrive, Play, Plus, Trash2, Edit3, Check, X, Clock,
  Database, Server, FileArchive, Download,
  CheckCircle, XCircle, Activity, Calendar, Loader2,
  Mail, Cloud, Settings, Bell, Upload, Send,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { BackupJob, BackupRecord, BackupSmtpConfig, BackupTelegramConfig } from "../store/appStore";

let invokeCache: typeof import("@tauri-apps/api/core").invoke | null = null;
async function getInvoke() {
  if (!invokeCache) invokeCache = (await import("@tauri-apps/api/core")).invoke;
  return invokeCache;
}

type BackupView = "dashboard" | "jobs" | "history" | "templates" | "settings";

const DEFAULT_TEMPLATES = [
  { id: "pg", name: "PostgreSQL", category: "database" as const, engine: "postgresql", command: "pg_dump -U {USER} {DB_NAME} | gzip > {OUTPUT_PATH}", description: "PostgreSQL database dump with gzip compression" },
  { id: "mysql", name: "MySQL", category: "database" as const, engine: "mysql", command: "mysqldump -u {USER} -p{PASSWORD} {DB_NAME} | gzip > {OUTPUT_PATH}", description: "MySQL full database dump with gzip" },
  { id: "mongo", name: "MongoDB", category: "database" as const, engine: "mongodb", command: "mongodump --db {DB_NAME} --archive={OUTPUT_PATH} --gzip", description: "MongoDB database archive with gzip" },
  { id: "sqlite", name: "SQLite", category: "database" as const, engine: "sqlite", command: "sqlite3 {DB_PATH} \".backup '{OUTPUT_PATH}'\"", description: "SQLite online backup copy" },
  { id: "tar", name: "System Tar", category: "system" as const, engine: "tar", command: "tar czf {OUTPUT_PATH} {SOURCE_PATHS}", description: "Compressed tar archive of directories" },
  { id: "rsync", name: "Rsync", category: "system" as const, engine: "rsync", command: "rsync -avz {SOURCE_PATHS} {OUTPUT_PATH}", description: "Rsync file synchronization" },
  { id: "custom", name: "Custom Command", category: "custom" as const, engine: "custom", command: "{COMMAND}", description: "Write your own backup command" },
] as const;

const CLOUD_TEMPLATES = [
  { id: "rclone_gdrive", name: "Google Drive (rclone)", command: "rclone copy {FILE} gdrive:Backups/{SERVER}/", description: "Upload via rclone to Google Drive" },
  { id: "rclone_s3", name: "AWS S3 (rclone)", command: "rclone copy {FILE} s3:my-bucket/backups/{SERVER}/", description: "Upload via rclone to S3" },
  { id: "aws_s3", name: "AWS S3 (cli)", command: "aws s3 cp {FILE} s3://my-bucket/backups/", description: "Upload via AWS CLI" },
  { id: "gcloud", name: "Google Cloud Storage", command: "gsutil cp {FILE} gs://my-bucket/backups/", description: "Upload via gsutil" },
  { id: "scp", name: "SCP to another server", command: "scp {FILE} user@remote:/backups/", description: "Copy to another server via SCP" },
  { id: "custom", name: "Custom command", command: "", description: "Write your own upload command" },
];

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

// Simple cron matcher: "MIN HOUR DOM MON DOW" — checks if now matches
function cronMatches(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const now = new Date();
  const checks = [now.getMinutes(), now.getHours(), now.getDate(), now.getMonth() + 1, now.getDay()];
  return parts.every((p, i) => {
    if (p === "*") return true;
    if (p.includes("/")) { const step = parseInt(p.split("/")[1]); return checks[i] % step === 0; }
    if (p.includes(",")) return p.split(",").some((v) => parseInt(v) === checks[i]);
    if (p.includes("-")) { const [a, b] = p.split("-").map(Number); return checks[i] >= a && checks[i] <= b; }
    return parseInt(p) === checks[i];
  });
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "success") return <span className="backup-status success"><CheckCircle size={12} /> Success</span>;
  if (status === "failed") return <span className="backup-status failed"><XCircle size={12} /> Failed</span>;
  if (status === "running") return <span className="backup-status running"><Loader2 size={12} /> Running</span>;
  return <span className="backup-status never">Never run</span>;
}

// ──── Job Form ────
interface JobFormData {
  name: string; connectionId: string; templateId: string; command: string;
  remotePath: string; downloadLocal: boolean; localPath: string; schedule: string;
  notifyEmail: boolean; notifyTelegram: boolean; notifyOn: "always" | "failure" | "success";
  cloudEnabled: boolean; cloudCommand: string;
}

const emptyForm: JobFormData = {
  name: "", connectionId: "", templateId: "", command: "",
  remotePath: "/tmp/backup-$(date +%Y%m%d_%H%M%S).tar.gz",
  downloadLocal: false, localPath: "", schedule: "",
  notifyEmail: false, notifyTelegram: false, notifyOn: "always",
  cloudEnabled: false, cloudCommand: "",
};

function JobForm({ initial, onSave, onCancel }: { initial: JobFormData; onSave: (d: JobFormData) => void; onCancel: () => void }) {
  const [form, setForm] = useState<JobFormData>(initial);
  const sshConnections = useAppStore((s) => s.sshConnections);
  const set = useCallback(<K extends keyof JobFormData>(k: K, v: JobFormData[K]) => setForm((f) => ({ ...f, [k]: v })), []);

  const handleTemplateChange = useCallback((tid: string) => {
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === tid);
    setForm((f) => ({ ...f, templateId: tid, command: tpl ? (tpl.command as string) : f.command }));
  }, []);

  const handleCloudTemplate = useCallback((tid: string) => {
    const tpl = CLOUD_TEMPLATES.find((t) => t.id === tid);
    if (tpl) setForm((f) => ({ ...f, cloudCommand: tpl.command, cloudEnabled: true }));
  }, []);

  return (
    <div className="backup-form">
      {/* Basic info */}
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
          <label className="backup-form-label">Backup Template</label>
          <select className="backup-form-input" value={form.templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
            <option value="">Select template...</option>
            {DEFAULT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
          </select>
        </div>
        <div>
          <label className="backup-form-label">Remote Output Path</label>
          <input className="backup-form-input" value={form.remotePath} onChange={(e) => set("remotePath", e.target.value)} placeholder="/tmp/backup.tar.gz" />
        </div>
      </div>

      <div>
        <label className="backup-form-label">Backup Command</label>
        <textarea className="backup-form-textarea" value={form.command} onChange={(e) => set("command", e.target.value)} placeholder="Enter backup command..." />
      </div>

      {/* Schedule */}
      <div className="backup-form-grid">
        <div>
          <label className="backup-form-label"><Calendar size={11} /> Schedule (cron, empty = manual)</label>
          <input className="backup-form-input" value={form.schedule} onChange={(e) => set("schedule", e.target.value)} placeholder="0 2 * * *  (2:00 AM daily)" />
          {form.schedule && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Format: MIN HOUR DAY MONTH WEEKDAY</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="backup-form-checkbox">
            <input type="checkbox" checked={form.downloadLocal} onChange={(e) => set("downloadLocal", e.target.checked)} style={{ accentColor: "var(--accent-primary)" }} />
            <Download size={12} /> Download to local after backup
          </label>
          {form.downloadLocal && <input className="backup-form-input" value={form.localPath} onChange={(e) => set("localPath", e.target.value)} placeholder="C:\Backups\" />}
        </div>
      </div>

      {/* Notifications */}
      <div style={{ padding: "12px 14px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <Bell size={11} /> Notifications
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label className="backup-form-checkbox">
            <input type="checkbox" checked={form.notifyEmail} onChange={(e) => set("notifyEmail", e.target.checked)} style={{ accentColor: "var(--accent-primary)" }} />
            <Mail size={12} /> Email
          </label>
          <label className="backup-form-checkbox">
            <input type="checkbox" checked={form.notifyTelegram} onChange={(e) => set("notifyTelegram", e.target.checked)} style={{ accentColor: "var(--accent-primary)" }} />
            <Send size={12} /> Telegram
          </label>
        </div>
        {(form.notifyEmail || form.notifyTelegram) && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="backup-form-input" style={{ width: "auto" }} value={form.notifyOn} onChange={(e) => set("notifyOn", e.target.value as JobFormData["notifyOn"])}>
              <option value="always">Notify always</option>
              <option value="failure">On failure only</option>
              <option value="success">On success only</option>
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Configure in Settings tab</div>
          </div>
        )}
      </div>

      {/* Cloud Upload */}
      <div style={{ padding: "12px 14px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
        <label className="backup-form-checkbox" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={form.cloudEnabled} onChange={(e) => set("cloudEnabled", e.target.checked)} style={{ accentColor: "var(--accent-primary)" }} />
          <Cloud size={12} /> Upload to cloud after backup
        </label>
        {form.cloudEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            <select className="backup-form-input" onChange={(e) => handleCloudTemplate(e.target.value)} defaultValue="">
              <option value="">Choose cloud provider...</option>
              {CLOUD_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <textarea className="backup-form-textarea" style={{ minHeight: 48 }} value={form.cloudCommand} onChange={(e) => set("cloudCommand", e.target.value)} placeholder="rclone copy {FILE} remote:backups/" />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{"{FILE}"} = backup file path, {"{SERVER}"} = server name</div>
          </div>
        )}
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
  const [cronLog, setCronLog] = useState<string[]>([]);
  const [prefilledTemplate, setPrefilledTemplate] = useState<string | null>(null);

  const backupJobs = useAppStore((s) => s.backupJobs);
  const backupHistory = useAppStore((s) => s.backupHistory);
  const backupSmtp = useAppStore((s) => s.backupSmtp);
  const sshConnections = useAppStore((s) => s.sshConnections);
  const { addBackupJob, updateBackupJob, removeBackupJob, addBackupRecord, clearBackupHistory, setBackupSmtp } = useAppStore.getState();

  const runningJobsRef = useRef(runningJobs);
  runningJobsRef.current = runningJobs;

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
    const sshArgs = { host: conn.host, port: conn.port, username: conn.username, password, privateKey: conn.privateKey || null };

    let status: "success" | "failed" = "success";
    let output = "";
    let sizeMB = 0;
    let error: string | null = null;

    try {
      output = await invoke("ssh_exec", { ...sshArgs, command: job.command }) as string;
      try {
        const sizeOut = await invoke("ssh_exec", { ...sshArgs, command: `stat -c%s "${job.remotePath}" 2>/dev/null || echo 0` }) as string;
        sizeMB = parseFloat(sizeOut) / (1024 * 1024);
      } catch { /* noop */ }
    } catch (e) {
      status = "failed";
      error = String(e);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    addBackupRecord({ jobId: job.id, jobName: job.name, serverName: conn.name, timestamp: Date.now(), status, duration, sizeMB: status === "success" ? sizeMB : 0, output: (output || "").slice(0, 2000), error, downloaded: false });
    updateBackupJob(job.id, { lastRun: Date.now(), lastStatus: status });

    // Post-backup: cloud upload
    if (status === "success" && job.cloudEnabled && job.cloudCommand) {
      try {
        const cloudCmd = job.cloudCommand.replace(/\{FILE\}/g, job.remotePath).replace(/\{SERVER\}/g, conn.name);
        await invoke("ssh_exec", { ...sshArgs, command: cloudCmd });
      } catch { /* cloud upload failed, non-blocking */ }
    }

    // Post-backup: email notification
    const smtp = useAppStore.getState().backupSmtp;
    if (smtp.enabled && job.notifyEmail) {
      const shouldNotify = job.notifyOn === "always" || (job.notifyOn === "failure" && status === "failed") || (job.notifyOn === "success" && status === "success");
      if (shouldNotify) {
        try {
          const subject = `[NovaShell] Backup ${status.toUpperCase()}: ${job.name} on ${conn.name}`;
          const body = `Backup Job: ${job.name}\\nServer: ${conn.name} (${conn.host})\\nStatus: ${status}\\nDuration: ${formatDuration(duration)}\\nSize: ${sizeMB.toFixed(2)} MB\\nTime: ${new Date().toISOString()}${error ? `\\nError: ${error}` : ""}`;
          // Send email via server's mail command using SMTP config
          const mailCmd = `echo -e "Subject: ${subject}\\nFrom: ${smtp.fromAddress}\\nTo: ${smtp.toAddress}\\nContent-Type: text/plain\\n\\n${body}" | curl --ssl-reqd --url "smtps://${smtp.host}:${smtp.port}" --user "${smtp.username}:${smtp.password}" --mail-from "${smtp.fromAddress}" --mail-rcpt "${smtp.toAddress}" -T - 2>&1 || echo "Mail send failed"`;
          await invoke("ssh_exec", { ...sshArgs, command: mailCmd });
        } catch { /* email failed, non-blocking */ }
      }
    }

    // Post-backup: Telegram notification
    const tg = useAppStore.getState().backupTelegram;
    if (tg.enabled && job.notifyTelegram) {
      const shouldNotify = job.notifyOn === "always" || (job.notifyOn === "failure" && status === "failed") || (job.notifyOn === "success" && status === "success");
      if (shouldNotify) {
        try {
          const icon = status === "success" ? "\u2705" : "\u274C";
          const msg = `${icon} *NovaShell Backup*\n*Job:* ${job.name}\n*Server:* ${conn.name} (${conn.host})\n*Status:* ${status.toUpperCase()}\n*Duration:* ${formatDuration(duration)}\n*Size:* ${sizeMB.toFixed(2)} MB\n*Time:* ${new Date().toISOString()}${error ? `\n*Error:* ${error.slice(0, 200)}` : ""}`;
          const tgCmd = `curl -s -X POST "https://api.telegram.org/bot${tg.botToken}/sendMessage" -d chat_id="${tg.chatId}" -d parse_mode="Markdown" -d text="${msg.replace(/"/g, '\\"')}" 2>&1 || echo "Telegram send failed"`;
          await invoke("ssh_exec", { ...sshArgs, command: tgCmd });
        } catch { /* telegram failed, non-blocking */ }
      }
    }

    setRunningJobs((s) => { const n = new Set(s); n.delete(job.id); return n; });
  }, [sshConnections]);

  // ── Cron scheduler — checks every 60s ──
  useEffect(() => {
    const timer = setInterval(() => {
      const jobs = useAppStore.getState().backupJobs;
      const running = runningJobsRef.current;
      for (const job of jobs) {
        if (!job.enabled || !job.schedule || running.has(job.id)) continue;
        if (cronMatches(job.schedule)) {
          // Don't run if already ran this minute
          if (job.lastRun && Date.now() - job.lastRun < 60_000) continue;
          setCronLog((l) => [`[${new Date().toLocaleTimeString()}] Cron triggered: ${job.name}`, ...l.slice(0, 49)]);
          executeBackup(job);
        }
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [executeBackup]);

  const handleSaveJob = useCallback((data: JobFormData) => {
    const jobData = {
      name: data.name, connectionId: data.connectionId, templateId: data.templateId || null,
      command: data.command, remotePath: data.remotePath, downloadLocal: data.downloadLocal,
      localPath: data.localPath, schedule: data.schedule || null, enabled: true,
      notifyEmail: data.notifyEmail, notifyTelegram: data.notifyTelegram, notifyOn: data.notifyOn,
      cloudEnabled: data.cloudEnabled, cloudCommand: data.cloudCommand,
    };
    if (editingJob) updateBackupJob(editingJob.id, jobData);
    else addBackupJob(jobData);
    setShowForm(false);
    setEditingJob(null);
  }, [editingJob]);

  const filteredHistory = useMemo(() => {
    let h = backupHistory;
    if (historyFilter !== "all") h = h.filter((r) => r.status === historyFilter);
    if (historyServerFilter) h = h.filter((r) => r.serverName === historyServerFilter);
    return [...h].sort((a, b) => b.timestamp - a.timestamp);
  }, [backupHistory, historyFilter, historyServerFilter]);

  const recentHistory = useMemo(() => [...backupHistory].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10), [backupHistory]);
  const serverNames = useMemo(() => [...new Set(backupHistory.map((r) => r.serverName))], [backupHistory]);
  const scheduledJobs = useMemo(() => backupJobs.filter((j) => j.schedule && j.enabled), [backupJobs]);

  // ── SMTP + Telegram form state ──
  const [smtpForm, setSmtpForm] = useState<BackupSmtpConfig>(backupSmtp);
  const backupTelegram = useAppStore((s) => s.backupTelegram);
  const { setBackupTelegram } = useAppStore.getState();
  const [tgForm, setTgForm] = useState<BackupTelegramConfig>(backupTelegram);
  useEffect(() => { setSmtpForm(backupSmtp); }, [backupSmtp]);
  useEffect(() => { setTgForm(backupTelegram); }, [backupTelegram]);

  return (
    <div className="backup-panel">
      <div className="backup-header">
        <div className="backup-header-icon"><HardDrive size={16} /></div>
        <div className="backup-header-title">Backup Manager</div>
        {scheduledJobs.length > 0 && (
          <span className="backup-status success" style={{ fontSize: 10 }}>
            <Calendar size={10} /> {scheduledJobs.length} scheduled
          </span>
        )}
        <div style={{ flex: 1 }} />
        <div className="infra-tab-bar" style={{ flex: "none" }}>
          {([
            { key: "dashboard" as const, label: "Dashboard", icon: <Activity size={13} /> },
            { key: "jobs" as const, label: "Jobs", icon: <Server size={13} />, badge: backupJobs.length },
            { key: "history" as const, label: "History", icon: <Clock size={13} />, badge: backupHistory.length },
            { key: "templates" as const, label: "Templates", icon: <FileArchive size={13} /> },
            { key: "settings" as const, label: "Settings", icon: <Settings size={13} /> },
          ] as const).map((tab) => (
            <button key={tab.key} className={`infra-tab${view === tab.key ? " active" : ""}`} onClick={() => setView(tab.key)}>
              {tab.icon} {tab.label}
              {"badge" in tab && (tab as any).badge > 0 && <span className="infra-tab-badge">{(tab as any).badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="backup-view">
        {/* ── DASHBOARD ── */}
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
              <div className="backup-empty"><FileArchive size={36} className="backup-empty-icon" /><div className="backup-empty-text">No backups yet. Create a job and run your first backup.</div></div>
            ) : (
              <table className="backup-table">
                <thead><tr><th>Time</th><th>Job</th><th>Server</th><th>Status</th><th>Duration</th><th>Size</th></tr></thead>
                <tbody>{recentHistory.map((r) => (
                  <tr key={r.id}>
                    <td className="col-mono">{formatRelativeTime(r.timestamp)}</td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.jobName}</td>
                    <td>{r.serverName}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="col-mono">{formatDuration(r.duration)}</td>
                    <td className="col-mono">{r.sizeMB > 0 ? `${r.sizeMB.toFixed(2)} MB` : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}

            {cronLog.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="backup-section-title"><Calendar size={14} /> Cron Activity</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", maxHeight: 80, overflowY: "auto", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                  {cronLog.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── JOBS ── */}
        {view === "jobs" && (
          <>
            <div className="backup-toolbar">
              <div className="backup-section-title" style={{ margin: 0 }}>Backup Jobs</div>
              {!showForm && <button className="infra-action-btn primary" onClick={() => { setEditingJob(null); setShowForm(true); }}><Plus size={14} /> New Job</button>}
            </div>
            {showForm && (
              <div style={{ marginBottom: 14 }}>
                <JobForm
                  initial={editingJob
                    ? { name: editingJob.name, connectionId: editingJob.connectionId, templateId: editingJob.templateId || "", command: editingJob.command, remotePath: editingJob.remotePath, downloadLocal: editingJob.downloadLocal, localPath: editingJob.localPath, schedule: editingJob.schedule || "", notifyEmail: editingJob.notifyEmail, notifyTelegram: editingJob.notifyTelegram, notifyOn: editingJob.notifyOn, cloudEnabled: editingJob.cloudEnabled, cloudCommand: editingJob.cloudCommand }
                    : prefilledTemplate
                      ? { ...emptyForm, templateId: prefilledTemplate, command: DEFAULT_TEMPLATES.find((t) => t.id === prefilledTemplate)?.command || "", name: `${DEFAULT_TEMPLATES.find((t) => t.id === prefilledTemplate)?.name || ""} Backup` }
                      : emptyForm
                  }
                  onSave={(d) => { handleSaveJob(d); setPrefilledTemplate(null); }}
                  onCancel={() => { setShowForm(false); setEditingJob(null); setPrefilledTemplate(null); }}
                />
              </div>
            )}
            {backupJobs.length === 0 && !showForm ? (
              <div className="backup-empty"><Server size={36} className="backup-empty-icon" /><div className="backup-empty-text">No backup jobs configured yet.<br />Click "New Job" to create your first backup job.</div></div>
            ) : (
              <div className="backup-job-list">
                {backupJobs.map((job) => {
                  const conn = sshConnections.find((c) => c.id === job.connectionId);
                  const isRunning = runningJobs.has(job.id);
                  return (
                    <div key={job.id} className="backup-job-card">
                      <div className={`backup-job-status-dot ${isRunning ? "running" : job.lastStatus || "never"}`} />
                      <div className="backup-job-info">
                        <div className="backup-job-name">
                          {job.name}
                          {job.notifyEmail && <Mail size={11} style={{ color: "var(--accent-primary)", marginLeft: 6 }} />}
                          {job.notifyTelegram && <Send size={11} style={{ color: "#2AABEE", marginLeft: 4 }} />}
                          {job.cloudEnabled && <Cloud size={11} style={{ color: "var(--accent-secondary)", marginLeft: 4 }} />}
                        </div>
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

        {/* ── HISTORY ── */}
        {view === "history" && (
          <>
            <div className="backup-toolbar">
              <div className="backup-section-title" style={{ margin: 0 }}>Backup History</div>
              <div className="backup-filters">
                <select className="backup-filter-select" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)}>
                  <option value="all">All Status</option><option value="success">Success</option><option value="failed">Failed</option>
                </select>
                <select className="backup-filter-select" value={historyServerFilter} onChange={(e) => setHistoryServerFilter(e.target.value)}>
                  <option value="">All Servers</option>
                  {serverNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {backupHistory.length > 0 && <button className="infra-action-btn danger" onClick={clearBackupHistory}><Trash2 size={12} /> Clear</button>}
              </div>
            </div>
            {filteredHistory.length === 0 ? (
              <div className="backup-empty"><Clock size={36} className="backup-empty-icon" /><div className="backup-empty-text">No backup history found.</div></div>
            ) : (
              <table className="backup-table">
                <thead><tr><th>Time</th><th>Job</th><th>Server</th><th>Status</th><th>Duration</th><th>Size</th><th>Output</th></tr></thead>
                <tbody>{filteredHistory.map((r) => (
                  <tr key={r.id}>
                    <td className="col-mono" style={{ whiteSpace: "nowrap" }}>{new Date(r.timestamp).toLocaleString()}</td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.jobName}</td>
                    <td>{r.serverName}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="col-mono">{formatDuration(r.duration)}</td>
                    <td className="col-mono">{r.sizeMB > 0 ? `${r.sizeMB.toFixed(2)} MB` : "—"}</td>
                    <td className="col-output">{r.error || r.output || "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </>
        )}

        {/* ── TEMPLATES ── */}
        {view === "templates" && (
          <>
            <div className="backup-section-title"><Database size={14} /> Backup Templates</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Click a template to create a new backup job with it pre-configured.</div>
            <div className="backup-template-grid">
              {DEFAULT_TEMPLATES.map((tpl) => (
                <div key={tpl.id} className={`backup-template-card ${tpl.category}`} style={{ cursor: "pointer" }}
                  onClick={() => {
                    setEditingJob(null);
                    setPrefilledTemplate(tpl.id);
                    setShowForm(true);
                    setView("jobs");
                  }}
                >
                  <div className="backup-template-header">
                    <span className="backup-template-name">{tpl.name}</span>
                    <span className={`backup-template-badge ${tpl.category}`}>{tpl.category}</span>
                  </div>
                  <div className="backup-template-desc">{tpl.description}</div>
                  <div className="backup-template-engine"><HardDrive size={10} /> {tpl.engine}</div>
                  <div className="backup-template-command">{tpl.command}</div>
                  <div className="infra-action-btn primary" style={{ marginTop: 4, alignSelf: "flex-start", pointerEvents: "none" }}>
                    <Plus size={12} /> Use Template
                  </div>
                </div>
              ))}
            </div>

            <div className="backup-section-title" style={{ marginTop: 20 }}><Cloud size={14} /> Cloud Upload Templates</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>These are used in the "Cloud Upload" section when creating a job.</div>
            <div className="backup-template-grid">
              {CLOUD_TEMPLATES.map((tpl) => (
                <div key={tpl.id} className="backup-template-card system">
                  <div className="backup-template-header">
                    <span className="backup-template-name">{tpl.name}</span>
                    <span className="backup-template-badge system">cloud</span>
                  </div>
                  <div className="backup-template-desc">{tpl.description}</div>
                  {tpl.command && <div className="backup-template-command">{tpl.command}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── SETTINGS ── */}
        {view === "settings" && (
          <>
            <div className="backup-section-title"><Mail size={14} /> Email Notifications (SMTP)</div>
            <div className="backup-form" style={{ borderColor: "var(--border-color)" }}>
              <label className="backup-form-checkbox">
                <input type="checkbox" checked={smtpForm.enabled} onChange={(e) => setSmtpForm((f) => ({ ...f, enabled: e.target.checked }))} style={{ accentColor: "var(--accent-primary)" }} />
                <Bell size={12} /> Enable email notifications
              </label>

              {smtpForm.enabled && (
                <>
                  <div className="backup-form-grid">
                    <div>
                      <label className="backup-form-label">SMTP Server</label>
                      <input className="backup-form-input" value={smtpForm.host} onChange={(e) => setSmtpForm((f) => ({ ...f, host: e.target.value }))} placeholder="smtp.gmail.com" />
                    </div>
                    <div>
                      <label className="backup-form-label">Port</label>
                      <input className="backup-form-input" type="number" value={smtpForm.port} onChange={(e) => setSmtpForm((f) => ({ ...f, port: parseInt(e.target.value) || 587 }))} />
                    </div>
                  </div>
                  <div className="backup-form-grid">
                    <div>
                      <label className="backup-form-label">Username / Email</label>
                      <input className="backup-form-input" value={smtpForm.username} onChange={(e) => setSmtpForm((f) => ({ ...f, username: e.target.value }))} placeholder="you@gmail.com" />
                    </div>
                    <div>
                      <label className="backup-form-label">Password / App Password</label>
                      <input className="backup-form-input" type="password" value={smtpForm.password} onChange={(e) => setSmtpForm((f) => ({ ...f, password: e.target.value }))} placeholder="App password" />
                    </div>
                  </div>
                  <div className="backup-form-grid">
                    <div>
                      <label className="backup-form-label">From Address</label>
                      <input className="backup-form-input" value={smtpForm.fromAddress} onChange={(e) => setSmtpForm((f) => ({ ...f, fromAddress: e.target.value }))} placeholder="backups@yourdomain.com" />
                    </div>
                    <div>
                      <label className="backup-form-label">To Address</label>
                      <input className="backup-form-input" value={smtpForm.toAddress} onChange={(e) => setSmtpForm((f) => ({ ...f, toAddress: e.target.value }))} placeholder="admin@yourdomain.com" />
                    </div>
                  </div>
                  <label className="backup-form-checkbox">
                    <input type="checkbox" checked={smtpForm.useTls} onChange={(e) => setSmtpForm((f) => ({ ...f, useTls: e.target.checked }))} style={{ accentColor: "var(--accent-primary)" }} />
                    Use TLS/SSL
                  </label>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 10px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)" }}>
                    For Gmail: use smtp.gmail.com:587, enable 2FA, and create an App Password at myaccount.google.com/apppasswords
                  </div>
                </>
              )}

              <div className="backup-form-actions">
                <button className="infra-action-btn primary" onClick={() => setBackupSmtp(smtpForm)}>
                  <Check size={14} /> Save SMTP Settings
                </button>
              </div>
            </div>

            <div className="backup-section-title" style={{ marginTop: 24 }}><Send size={14} /> Telegram Notifications</div>
            <div className="backup-form" style={{ borderColor: "var(--border-color)" }}>
              <label className="backup-form-checkbox">
                <input type="checkbox" checked={tgForm.enabled} onChange={(e) => setTgForm((f) => ({ ...f, enabled: e.target.checked }))} style={{ accentColor: "#2AABEE" }} />
                <Send size={12} /> Enable Telegram notifications
              </label>

              {tgForm.enabled && (
                <>
                  <div className="backup-form-grid">
                    <div>
                      <label className="backup-form-label">Bot Token</label>
                      <input className="backup-form-input" value={tgForm.botToken} onChange={(e) => setTgForm((f) => ({ ...f, botToken: e.target.value }))} placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwx" />
                    </div>
                    <div>
                      <label className="backup-form-label">Chat ID</label>
                      <input className="backup-form-input" value={tgForm.chatId} onChange={(e) => setTgForm((f) => ({ ...f, chatId: e.target.value }))} placeholder="-1001234567890" />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 10px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", lineHeight: 1.5 }}>
                    <strong>Setup:</strong> 1) Create a bot via @BotFather on Telegram. 2) Copy the bot token. 3) Add the bot to your group/channel. 4) Get the chat ID (send a message, then visit api.telegram.org/bot&lt;TOKEN&gt;/getUpdates).
                  </div>
                </>
              )}

              <div className="backup-form-actions">
                <button className="infra-action-btn primary" onClick={() => setBackupTelegram(tgForm)} style={{ background: "#2AABEE", borderColor: "#2AABEE" }}>
                  <Check size={14} /> Save Telegram Settings
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
