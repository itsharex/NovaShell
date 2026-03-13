import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Sparkles,
  Loader2,
  Trash2,
  ArrowLeft,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { renderMarkdown } from "../utils/markdown";

interface SessionDocInfo {
  filename: string;
  title: string;
  created: number;
  size: number;
}

let invokeCache: typeof import("@tauri-apps/api/core").invoke | null = null;
async function getInvoke() {
  if (!invokeCache) {
    const mod = await import("@tauri-apps/api/core");
    invokeCache = mod.invoke;
  }
  return invokeCache;
}

type OllamaStatus = "checking" | "online" | "offline" | "pulling";

export function SessionDocPanel() {
  const history = useAppStore((s) => s.history);
  const debugLogs = useAppStore((s) => s.debugLogs);
  const sessionStartTime = useAppStore((s) => s.sessionStartTime);

  const [docs, setDocs] = useState<SessionDocInfo[]>([]);
  const [viewingDoc, setViewingDoc] = useState<{ filename: string; content: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>("checking");
  const [pullProgress, setPullProgress] = useState("");
  const [error, setError] = useState("");

  const checkOllama = useCallback(async () => {
    setOllamaStatus("checking");
    try {
      const invoke = await getInvoke();
      const healthy = await invoke<boolean>("ai_health");
      if (!healthy) {
        setOllamaStatus("offline");
        return;
      }
      // Check if llama3.2 model is available
      const models = await invoke<Array<{ name: string; size: number }>>("ai_list_models");
      const hasLlama = models.some((m) => m.name.startsWith("llama3.2"));
      if (!hasLlama) {
        // Auto-pull the model
        setOllamaStatus("pulling");
        setPullProgress("Downloading llama3.2...");
        try {
          await invoke("ai_pull_model", { model: "llama3.2" });
          setOllamaStatus("online");
          setPullProgress("");
        } catch (e: unknown) {
          setError(`Failed to download model: ${e}`);
          setOllamaStatus("offline");
        }
      } else {
        setOllamaStatus("online");
      }
    } catch {
      setOllamaStatus("offline");
    }
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      const invoke = await getInvoke();
      const list = await invoke<SessionDocInfo[]>("session_doc_list");
      setDocs(list);
    } catch {}
  }, []);

  useEffect(() => {
    checkOllama();
    loadDocs();
  }, [checkOllama, loadDocs]);

  const generateDoc = async () => {
    setGenerating(true);
    setError("");
    try {
      const invoke = await getInvoke();
      // Collect session data
      const commands = history.slice(0, 50).map((h) => h.command);
      const errors = debugLogs
        .filter((l) => l.level === "error" || l.level === "warn")
        .slice(0, 20)
        .map((l) => `[${l.level.toUpperCase()}] ${l.message}`);
      const durationMinutes = Math.round((Date.now() - sessionStartTime) / 60000);

      // Generate with AI
      const content = await invoke<string>("ai_generate_session_doc", {
        commands: commands.reverse(), // Chronological order
        errors,
        durationMinutes,
      });

      // Save to disk
      const filename = await invoke<string>("session_doc_save", { content });

      // Refresh list and show
      await loadDocs();
      setViewingDoc({ filename, content });
    } catch (e: unknown) {
      setError(String(e));
    }
    setGenerating(false);
  };

  const viewDoc = async (filename: string) => {
    try {
      const invoke = await getInvoke();
      const content = await invoke<string>("session_doc_load", { filename });
      setViewingDoc({ filename, content });
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  const deleteDoc = async (filename: string) => {
    try {
      const invoke = await getInvoke();
      await invoke("session_doc_delete", { filename });
      if (viewingDoc?.filename === filename) setViewingDoc(null);
      loadDocs();
    } catch {}
  };

  const exportDoc = () => {
    if (!viewingDoc) return;
    const blob = new Blob([viewingDoc.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = viewingDoc.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (ts: number) => {
    if (!ts) return "Unknown";
    return new Date(ts * 1000).toLocaleString();
  };

  // Viewing a specific doc
  if (viewingDoc) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
          borderBottom: "1px solid var(--border-color)", flexShrink: 0,
        }}>
          <button onClick={() => setViewingDoc(null)} style={iconBtnStyle}><ArrowLeft size={14} /></button>
          <FileText size={14} style={{ color: "var(--accent-purple)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {viewingDoc.filename}
          </span>
          <button onClick={exportDoc} title="Export" style={iconBtnStyle}><Download size={13} /></button>
          <button onClick={() => deleteDoc(viewingDoc.filename)} title="Delete" style={iconBtnStyle}><Trash2 size={13} /></button>
        </div>
        <div style={{
          flex: 1, overflow: "auto", padding: 16, fontSize: 12, lineHeight: 1.7,
          color: "var(--text-primary)",
        }}>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(viewingDoc.content) }} />
        </div>
      </div>
    );
  }

  // Main panel
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        borderBottom: "1px solid var(--border-color)", flexShrink: 0,
      }}>
        <FileText size={16} style={{ color: "var(--accent-purple)" }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", flex: 1 }}>Session Docs</span>
        <button onClick={loadDocs} title="Refresh" style={iconBtnStyle}><RefreshCw size={13} /></button>
      </div>

      {/* Ollama Status */}
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
      }}>
        {ollamaStatus === "checking" && (
          <>
            <Loader2 size={12} style={{ color: "var(--text-muted)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Checking Ollama...</span>
          </>
        )}
        {ollamaStatus === "online" && (
          <>
            <CheckCircle size={12} style={{ color: "var(--accent-secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--accent-secondary)" }}>Ollama ready (Llama 3.2)</span>
          </>
        )}
        {ollamaStatus === "pulling" && (
          <>
            <Loader2 size={12} style={{ color: "var(--accent-warning)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 11, color: "var(--accent-warning)" }}>{pullProgress}</span>
          </>
        )}
        {ollamaStatus === "offline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AlertCircle size={12} style={{ color: "var(--accent-error)" }} />
              <span style={{ fontSize: 11, color: "var(--accent-error)" }}>Ollama not detected</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Install <strong>Ollama</strong> to enable AI session documentation.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {
                  import("@tauri-apps/plugin-shell").then(({ open }) => {
                    open("https://ollama.com/download");
                  }).catch(() => {});
                }}
                style={{
                  padding: "4px 10px", background: "var(--accent-primary)", color: "white",
                  border: "none", borderRadius: "var(--radius-sm)", fontSize: 11, cursor: "pointer",
                }}
              >
                Download Ollama
              </button>
              <button onClick={checkOllama} style={{
                padding: "4px 10px", background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", fontSize: 11, cursor: "pointer",
              }}>
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      {ollamaStatus === "online" && (
        <div style={{ padding: "12px", flexShrink: 0 }}>
          <button
            onClick={generateDoc}
            disabled={generating || history.length === 0}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px 16px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
              borderRadius: "var(--radius-md)", transition: "all var(--transition-fast)",
              background: generating || history.length === 0 ? "var(--bg-active)" : "var(--accent-gradient)",
              color: "white", opacity: generating || history.length === 0 ? 0.5 : 1,
            }}
          >
            {generating ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                Generating documentation...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Document Current Session
              </>
            )}
          </button>
          {history.length === 0 && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>
              Run some commands first
            </div>
          )}
          {error && (
            <div style={{ fontSize: 11, color: "var(--accent-error)", marginTop: 8, padding: "6px 8px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)" }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Session info */}
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)",
        display: "flex", gap: 12, fontSize: 10, color: "var(--text-muted)", flexShrink: 0,
      }}>
        <span>{history.length} commands</span>
        <span>{debugLogs.filter((l) => l.level === "error").length} errors</span>
        <span>
          <Clock size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />
          {Math.round((Date.now() - sessionStartTime) / 60000)}m
        </span>
      </div>

      {/* Past docs list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {docs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6 }}>
            No documentation yet.
            <br />
            Generate your first session doc above.
          </div>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.filename}
              onClick={() => viewDoc(doc.filename)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                cursor: "pointer", transition: "background var(--transition-fast)",
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <FileText size={14} style={{ color: "var(--accent-purple)", flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {doc.title}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {formatDate(doc.created)} &middot; {formatSize(doc.size)}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteDoc(doc.filename); }}
                style={iconBtnStyle}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const iconBtnStyle: React.CSSProperties = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
  padding: 4, borderRadius: "var(--radius-sm)", display: "flex",
};
