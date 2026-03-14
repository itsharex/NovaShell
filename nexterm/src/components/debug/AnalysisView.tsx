import { useMemo, useState, useCallback, useRef } from "react";
import {
  Shield,
  ShieldCheck,
  Copy,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Zap,
  Sparkles,
  Loader2,
  Brain,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useAppStore } from "../../store/appStore";
import {
  scanLogsForIssues,
  collectUnmatchedErrors,
  CATEGORY_CONFIG,
  SEVERITY_CONFIG,
} from "./errorPatterns";
import type { DetectedIssue, UnmatchedError } from "./errorPatterns";

let tauriCoreCache: typeof import("@tauri-apps/api/core") | null = null;
async function getTauriCore() {
  if (!tauriCoreCache) tauriCoreCache = await import("@tauri-apps/api/core");
  return tauriCoreCache;
}

interface AiAnalysis {
  cause: string;
  fix: string;
  command?: string;
  severity: string;
}

// System prompt for the Debug Copilot AI
const AI_SYSTEM_PROMPT = `You are an expert debugging assistant integrated into a terminal emulator called NovaShell. Your job is to analyze error messages from terminal output and provide actionable fixes.

RULES:
- Respond ONLY with valid JSON, no markdown, no extra text
- Be concise — the UI has limited space
- Focus on the most likely cause and the most practical fix
- If you can suggest a terminal command to fix it, include it
- Assess severity: "critical" (data loss/security), "error" (blocks work), "warning" (non-blocking)

Response format (strict JSON):
{"cause":"Brief explanation of what caused this error","fix":"Step-by-step fix instructions (2-3 sentences max)","command":"optional terminal command to fix it","severity":"error|warning|critical"}`;

export function AnalysisView() {
  const debugLogs = useAppStore((s) => s.debugLogs);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // AI state
  const [aiResults, setAiResults] = useState<Map<string, AiAnalysis>>(new Map());
  const [aiLoading, setAiLoading] = useState<Set<string>>(new Set());
  const [aiErrors, setAiErrors] = useState<Map<string, string>>(new Map());
  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const checkedOllama = useRef(false);

  // Pattern-matched issues (Layer 1)
  const issues = useMemo(() => scanLogsForIssues(debugLogs), [debugLogs]);

  // Unmatched errors for AI analysis (Layer 2)
  const unmatchedErrors = useMemo(() => collectUnmatchedErrors(debugLogs), [debugLogs]);

  const filteredIssues = useMemo(() => {
    if (!categoryFilter) return issues;
    if (categoryFilter === "ai") return []; // Show only AI section
    return issues.filter((i) => i.pattern.category === categoryFilter);
  }, [issues, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const issue of issues) {
      cats.set(issue.pattern.category, (cats.get(issue.pattern.category) || 0) + 1);
    }
    return cats;
  }, [issues]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyFix = useCallback((id: string, command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Check Ollama status on first interaction
  const checkOllama = useCallback(async () => {
    if (checkedOllama.current) return;
    checkedOllama.current = true;
    try {
      const { invoke } = await getTauriCore();
      const healthy = await invoke<boolean>("ai_health");
      if (healthy) {
        setOllamaStatus("online");
        const models = await invoke<Array<{ name: string; size: number }>>("ai_list_models");
        const names = models.map((m) => m.name);
        setAvailableModels(names);
        // Auto-select first model
        if (names.length > 0 && !selectedModel) {
          setSelectedModel(names[0]);
        }
      } else {
        setOllamaStatus("offline");
      }
    } catch {
      setOllamaStatus("offline");
    }
  }, [selectedModel]);

  // Analyze a single error with AI
  const analyzeWithAI = useCallback(async (error: UnmatchedError) => {
    // Check cache
    if (aiResults.has(error.hash)) return;

    await checkOllama();
    if (!selectedModel) return;

    setAiLoading((prev) => new Set(prev).add(error.hash));
    setAiErrors((prev) => { const n = new Map(prev); n.delete(error.hash); return n; });

    try {
      const { invoke } = await getTauriCore();
      const response = await invoke<string>("ai_chat", {
        model: selectedModel,
        systemPrompt: AI_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Analyze this terminal error (occurred ${error.count} time${error.count !== 1 ? "s" : ""}):\n\n${error.message.slice(0, 500)}`,
        }],
      });

      // Parse JSON response
      try {
        // Extract JSON from response (model might wrap it in markdown)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as AiAnalysis;
          setAiResults((prev) => new Map(prev).set(error.hash, parsed));
        } else {
          // Fallback: treat whole response as free text
          setAiResults((prev) => new Map(prev).set(error.hash, {
            cause: response.slice(0, 200),
            fix: response.slice(0, 300),
            severity: "error",
          }));
        }
      } catch {
        setAiResults((prev) => new Map(prev).set(error.hash, {
          cause: response.slice(0, 200),
          fix: response.slice(0, 300),
          severity: "error",
        }));
      }
    } catch (e) {
      setAiErrors((prev) => new Map(prev).set(error.hash, String(e)));
    }

    setAiLoading((prev) => { const n = new Set(prev); n.delete(error.hash); return n; });
  }, [aiResults, selectedModel, checkOllama]);

  // Batch analyze all unmatched errors
  const analyzeAllWithAI = useCallback(async () => {
    await checkOllama();
    for (const error of unmatchedErrors) {
      if (!aiResults.has(error.hash) && !aiLoading.has(error.hash)) {
        await analyzeWithAI(error);
      }
    }
  }, [unmatchedErrors, aiResults, aiLoading, analyzeWithAI, checkOllama]);

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <AlertCircle size={12} style={{ color: "#ff4444" }} />;
      case "error": return <AlertTriangle size={12} style={{ color: "#ff7b72" }} />;
      default: return <Zap size={12} style={{ color: "#d29922" }} />;
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const criticalCount = issues.filter((i) => i.pattern.severity === "critical").length;
  const errorCount = issues.filter((i) => i.pattern.severity === "error").length;
  const warningCount = issues.filter((i) => i.pattern.severity === "warning").length;
  const showAiSection = categoryFilter === null || categoryFilter === "ai";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Shield size={13} style={{ color: "var(--accent-primary)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
          Debug Copilot
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {debugLogs.length} scanned
        </span>
      </div>

      {/* Status banner */}
      <div style={{
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
        marginBottom: 8,
        background: issues.length === 0 && unmatchedErrors.length === 0
          ? "rgba(63,185,80,0.1)" : "rgba(255,123,114,0.08)",
        border: `1px solid ${issues.length === 0 && unmatchedErrors.length === 0
          ? "rgba(63,185,80,0.3)" : "rgba(255,123,114,0.2)"}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        {issues.length === 0 && unmatchedErrors.length === 0 ? (
          <>
            <ShieldCheck size={16} style={{ color: "var(--accent-secondary)", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-secondary)" }}>All Clear</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>No issues detected</div>
            </div>
          </>
        ) : (
          <>
            <AlertCircle size={16} style={{ color: "var(--accent-error)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
                {issues.length + unmatchedErrors.length} issue{issues.length + unmatchedErrors.length !== 1 ? "s" : ""} detected
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 10, color: "var(--text-muted)", marginTop: 2, flexWrap: "wrap" }}>
                {criticalCount > 0 && <span style={{ color: "#ff4444" }}>{criticalCount} critical</span>}
                {errorCount > 0 && <span style={{ color: "#ff7b72" }}>{errorCount} errors</span>}
                {warningCount > 0 && <span style={{ color: "#d29922" }}>{warningCount} warnings</span>}
                {unmatchedErrors.length > 0 && (
                  <span style={{ color: "var(--accent-purple, #bc8cff)" }}>
                    {unmatchedErrors.length} for AI
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Category filter pills */}
      {(categories.size > 0 || unmatchedErrors.length > 0) && (
        <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setCategoryFilter(null)}
            style={{
              padding: "2px 7px",
              border: `1px solid ${!categoryFilter ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              borderRadius: 10,
              background: !categoryFilter ? "var(--accent-primary)" : "transparent",
              color: !categoryFilter ? "white" : "var(--text-muted)",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            All
          </button>
          {Array.from(categories.entries()).map(([cat, count]) => {
            const cfg = CATEGORY_CONFIG[cat];
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(active ? null : cat)}
                style={{
                  padding: "2px 7px",
                  border: `1px solid ${active ? cfg?.color || "var(--border-subtle)" : "var(--border-subtle)"}`,
                  borderRadius: 10,
                  background: active ? `${cfg?.color || "var(--accent-primary)"}22` : "transparent",
                  color: active ? cfg?.color : "var(--text-muted)",
                  fontSize: 9,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {cfg?.label || cat} ({count})
              </button>
            );
          })}
          {unmatchedErrors.length > 0 && (
            <button
              onClick={() => setCategoryFilter(categoryFilter === "ai" ? null : "ai")}
              style={{
                padding: "2px 7px",
                border: `1px solid ${categoryFilter === "ai" ? "#bc8cff" : "var(--border-subtle)"}`,
                borderRadius: 10,
                background: categoryFilter === "ai" ? "rgba(188,140,255,0.15)" : "transparent",
                color: categoryFilter === "ai" ? "#bc8cff" : "var(--text-muted)",
                fontSize: 9,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Sparkles size={8} /> AI ({unmatchedErrors.length})
            </button>
          )}
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* === LAYER 1: Pattern-matched issues === */}
        {filteredIssues.length > 0 && categoryFilter !== "ai" && (
          <>
            {unmatchedErrors.length > 0 && (
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Pattern Matched ({filteredIssues.length})
              </div>
            )}
            {filteredIssues.map((issue) => (
              <IssueCard
                key={issue.pattern.id}
                issue={issue}
                expanded={expandedIds.has(issue.pattern.id)}
                onToggle={() => toggleExpand(issue.pattern.id)}
                onCopyFix={copyFix}
                copied={copiedId === issue.pattern.id}
                severityIcon={severityIcon}
                formatTime={formatTime}
              />
            ))}
          </>
        )}

        {/* === LAYER 2: AI Analysis for unmatched errors === */}
        {unmatchedErrors.length > 0 && showAiSection && (
          <>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: filteredIssues.length > 0 && categoryFilter !== "ai" ? 12 : 0,
              marginBottom: 6,
            }}>
              <Brain size={12} style={{ color: "#bc8cff" }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: "#bc8cff", textTransform: "uppercase", letterSpacing: "0.5px", flex: 1 }}>
                AI Analysis ({unmatchedErrors.length} unmatched)
              </span>
              <button
                onClick={() => { checkOllama(); analyzeAllWithAI(); }}
                disabled={aiLoading.size > 0}
                style={{
                  background: "rgba(188,140,255,0.15)",
                  border: "1px solid rgba(188,140,255,0.3)",
                  borderRadius: "var(--radius-sm)",
                  color: "#bc8cff",
                  cursor: aiLoading.size > 0 ? "default" : "pointer",
                  padding: "2px 8px",
                  fontSize: 9,
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  opacity: aiLoading.size > 0 ? 0.6 : 1,
                }}
              >
                {aiLoading.size > 0 ? (
                  <><Loader2 size={9} className="animate-pulse" /> Analyzing...</>
                ) : (
                  <><Sparkles size={9} /> Analyze All</>
                )}
              </button>
            </div>

            {/* Model selector (shown when Ollama is online) */}
            {ollamaStatus === "online" && availableModels.length > 1 && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
                fontSize: 9,
                color: "var(--text-muted)",
              }}>
                <span>Model:</span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: 9,
                    padding: "2px 4px",
                    fontFamily: "inherit",
                    flex: 1,
                  }}
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Ollama offline warning */}
            {ollamaStatus === "offline" && (
              <div style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(210,153,34,0.08)",
                border: "1px solid rgba(210,153,34,0.2)",
                marginBottom: 6,
                fontSize: 10,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <XCircle size={12} style={{ color: "#d29922", flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>Ollama not running</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                    Start Ollama to enable AI analysis. Install from ollama.com
                  </div>
                </div>
              </div>
            )}

            {/* Unmatched error cards */}
            {unmatchedErrors.map((error) => (
              <UnmatchedCard
                key={error.hash}
                error={error}
                expanded={expandedIds.has(error.hash)}
                onToggle={() => toggleExpand(error.hash)}
                aiResult={aiResults.get(error.hash)}
                aiError={aiErrors.get(error.hash)}
                isLoading={aiLoading.has(error.hash)}
                onAnalyze={() => analyzeWithAI(error)}
                onCopyFix={copyFix}
                copied={copiedId === error.hash}
                ollamaOnline={ollamaStatus === "online"}
                formatTime={formatTime}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Pattern-matched Issue Card (Layer 1) ───

function IssueCard({
  issue,
  expanded,
  onToggle,
  onCopyFix,
  copied,
  severityIcon,
  formatTime,
}: {
  issue: DetectedIssue;
  expanded: boolean;
  onToggle: () => void;
  onCopyFix: (id: string, cmd: string) => void;
  copied: boolean;
  severityIcon: (s: string) => React.ReactNode;
  formatTime: (ts: number) => string;
}) {
  const catCfg = CATEGORY_CONFIG[issue.pattern.category];
  const sevCfg = SEVERITY_CONFIG[issue.pattern.severity];

  return (
    <div style={{
      marginBottom: 6,
      borderRadius: "var(--radius-sm)",
      border: `1px solid ${sevCfg?.color || "var(--border-subtle)"}33`,
      background: `${sevCfg?.color || "var(--bg-tertiary)"}08`,
      overflow: "hidden",
    }}>
      <div onClick={onToggle} style={{ padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 6 }}>
        {expanded
          ? <ChevronDown size={11} style={{ color: "var(--text-muted)", marginTop: 1, flexShrink: 0 }} />
          : <ChevronRight size={11} style={{ color: "var(--text-muted)", marginTop: 1, flexShrink: 0 }} />
        }
        {severityIcon(issue.pattern.severity)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {issue.pattern.name}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 6, background: `${catCfg?.color || "#888"}22`, color: catCfg?.color || "#888", fontWeight: 600 }}>
              {catCfg?.label || issue.pattern.category}
            </span>
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{issue.count}x</span>
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{formatTime(issue.lastSeen)}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 10px 10px 29px", fontSize: 10 }}>
          <div style={{ color: "var(--text-secondary)", marginBottom: 6, lineHeight: 1.4 }}>
            {issue.pattern.description}
          </div>
          <div style={{
            padding: "6px 8px", borderRadius: "var(--radius-sm)",
            background: "rgba(63,185,80,0.08)", border: "1px solid rgba(63,185,80,0.2)", marginBottom: 6,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--accent-secondary)", marginBottom: 3 }}>SUGGESTED FIX</div>
            <div style={{ color: "var(--text-primary)", lineHeight: 1.4 }}>{issue.pattern.suggestion}</div>
          </div>
          {issue.pattern.fixCommand && (
            <FixCommandBlock
              command={issue.pattern.fixCommand}
              onCopy={() => onCopyFix(issue.pattern.id, issue.pattern.fixCommand!)}
              copied={copied}
            />
          )}
          <div style={{
            padding: "5px 8px", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)",
            border: "1px solid var(--border-subtle)", fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {issue.sampleMessage.slice(0, 200)}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 9, color: "var(--text-muted)" }}>
            <span>First: {formatTime(issue.firstSeen)}</span>
            <span>Last: {formatTime(issue.lastSeen)}</span>
            <span>{issue.count}x</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI-Analyzed Unmatched Error Card (Layer 2) ───

function UnmatchedCard({
  error,
  expanded,
  onToggle,
  aiResult,
  aiError,
  isLoading,
  onAnalyze,
  onCopyFix,
  copied,
  ollamaOnline,
  formatTime,
}: {
  error: UnmatchedError;
  expanded: boolean;
  onToggle: () => void;
  aiResult?: AiAnalysis;
  aiError?: string;
  isLoading: boolean;
  onAnalyze: () => void;
  onCopyFix: (id: string, cmd: string) => void;
  copied: boolean;
  ollamaOnline: boolean;
  formatTime: (ts: number) => string;
}) {
  const hasAiResult = !!aiResult;
  const borderColor = hasAiResult ? "#bc8cff" : "var(--border-subtle)";

  return (
    <div style={{
      marginBottom: 6,
      borderRadius: "var(--radius-sm)",
      border: `1px solid ${borderColor}${hasAiResult ? "55" : ""}`,
      background: hasAiResult ? "rgba(188,140,255,0.04)" : "var(--bg-tertiary)",
      overflow: "hidden",
    }}>
      <div onClick={onToggle} style={{ padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 6 }}>
        {expanded
          ? <ChevronDown size={11} style={{ color: "var(--text-muted)", marginTop: 1, flexShrink: 0 }} />
          : <ChevronRight size={11} style={{ color: "var(--text-muted)", marginTop: 1, flexShrink: 0 }} />
        }
        {isLoading ? (
          <Loader2 size={12} style={{ color: "#bc8cff", flexShrink: 0 }} className="animate-pulse" />
        ) : hasAiResult ? (
          <CheckCircle size={12} style={{ color: "#bc8cff", flexShrink: 0 }} />
        ) : (
          <AlertTriangle size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {error.message.slice(0, 80)}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
            <span style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 6,
              background: hasAiResult ? "rgba(188,140,255,0.15)" : "var(--bg-active)",
              color: hasAiResult ? "#bc8cff" : "var(--text-muted)", fontWeight: 600,
            }}>
              {hasAiResult ? "AI" : "unmatched"}
            </span>
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{error.count}x</span>
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{formatTime(error.lastSeen)}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 10px 10px 29px", fontSize: 10 }}>
          {/* Full error message */}
          <div style={{
            padding: "5px 8px", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)",
            border: "1px solid var(--border-subtle)", fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9, color: "var(--text-muted)", marginBottom: 6,
            whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 80, overflowY: "auto",
          }}>
            {error.message.slice(0, 500)}
          </div>

          {/* AI Result */}
          {hasAiResult && (
            <>
              {/* Cause */}
              <div style={{
                padding: "6px 8px", borderRadius: "var(--radius-sm)",
                background: "rgba(188,140,255,0.06)", border: "1px solid rgba(188,140,255,0.15)", marginBottom: 6,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#bc8cff", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <Brain size={9} /> ROOT CAUSE
                </div>
                <div style={{ color: "var(--text-primary)", lineHeight: 1.4 }}>{aiResult.cause}</div>
              </div>

              {/* Fix */}
              <div style={{
                padding: "6px 8px", borderRadius: "var(--radius-sm)",
                background: "rgba(63,185,80,0.08)", border: "1px solid rgba(63,185,80,0.2)", marginBottom: 6,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--accent-secondary)", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <Sparkles size={9} /> AI FIX
                </div>
                <div style={{ color: "var(--text-primary)", lineHeight: 1.4 }}>{aiResult.fix}</div>
              </div>

              {/* Fix command */}
              {aiResult.command && (
                <FixCommandBlock
                  command={aiResult.command}
                  onCopy={() => onCopyFix(error.hash, aiResult.command!)}
                  copied={copied}
                />
              )}
            </>
          )}

          {/* AI Error */}
          {aiError && (
            <div style={{
              padding: "6px 8px", borderRadius: "var(--radius-sm)",
              background: "rgba(255,123,114,0.08)", border: "1px solid rgba(255,123,114,0.2)", marginBottom: 6,
              fontSize: 9, color: "var(--accent-error)",
            }}>
              AI error: {aiError.slice(0, 150)}
            </div>
          )}

          {/* Analyze button (if no result yet) */}
          {!hasAiResult && !isLoading && (
            <button
              onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
              disabled={!ollamaOnline}
              style={{
                width: "100%",
                padding: "6px 0",
                border: "1px solid rgba(188,140,255,0.3)",
                borderRadius: "var(--radius-sm)",
                background: ollamaOnline ? "rgba(188,140,255,0.1)" : "var(--bg-active)",
                color: ollamaOnline ? "#bc8cff" : "var(--text-muted)",
                cursor: ollamaOnline ? "pointer" : "default",
                fontSize: 10,
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: ollamaOnline ? 1 : 0.5,
              }}
            >
              <Sparkles size={11} />
              {ollamaOnline ? "Analyze with AI" : "Ollama offline"}
            </button>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "8px 0", fontSize: 10, color: "#bc8cff",
            }}>
              <Loader2 size={12} className="animate-pulse" />
              AI is analyzing...
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 9, color: "var(--text-muted)" }}>
            <span>First: {formatTime(error.firstSeen)}</span>
            <span>Last: {formatTime(error.lastSeen)}</span>
            <span>{error.count}x</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared fix command block ───

function FixCommandBlock({ command, onCopy, copied }: {
  command: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 8px", borderRadius: "var(--radius-sm)",
      background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", marginBottom: 6,
    }}>
      <code style={{
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "var(--accent-primary)",
        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {command}
      </code>
      <button
        onClick={(e) => { e.stopPropagation(); onCopy(); }}
        style={{
          background: copied ? "var(--accent-secondary)" : "var(--bg-active)",
          border: "none", borderRadius: "var(--radius-sm)",
          color: copied ? "white" : "var(--text-secondary)",
          cursor: "pointer", padding: "2px 6px", fontSize: 9,
          display: "flex", alignItems: "center", gap: 3,
          fontFamily: "inherit", flexShrink: 0,
        }}
      >
        <Copy size={9} />
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
