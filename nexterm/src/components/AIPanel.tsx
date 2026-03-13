import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Send,
  Terminal,
  Wand2,
  AlertTriangle,
  MessageSquare,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { AiMode } from "../store/appStore";
import { escapeHtml, renderMarkdown } from "../utils/markdown";

const MODEL = "deepseek-coder:6.7b";

const SYSTEM_PROMPTS: Record<string, string> = {
  chat: `You are NovaShell AI, a terminal and shell expert assistant. You help with shells, CLI tools, scripting, DevOps, and system administration. Be concise and direct. Use markdown. Respond in the same language the user writes in.`,
  explain: `You are NovaShell AI. The user wants you to EXPLAIN a command. Break it down part by part — explain each flag and argument clearly using bullet points. Be concise.`,
  generate: `You are NovaShell AI. The user wants you to GENERATE a shell command from a natural language description. Output the command in a code block. Add a one-line explanation below. Support Windows (PowerShell, CMD), Linux (bash, zsh), and macOS.`,
  fix: `You are NovaShell AI. The user is sharing a terminal error. Analyze it, explain what went wrong briefly, and provide the corrected command in a code block.`,
};

let invokeCache: typeof import("@tauri-apps/api/core").invoke | null = null;
async function getInvoke() {
  if (!invokeCache) {
    const mod = await import("@tauri-apps/api/core");
    invokeCache = mod.invoke;
  }
  return invokeCache;
}

type OllamaStatus = "checking" | "online" | "offline" | "pulling";

export function AIPanel() {
  const aiMessages = useAppStore((s) => s.aiMessages);
  const aiLoading = useAppStore((s) => s.aiLoading);
  const addAiMessage = useAppStore((s) => s.addAiMessage);
  const clearAiMessages = useAppStore((s) => s.clearAiMessages);
  const setAiLoading = useAppStore((s) => s.setAiLoading);

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AiMode>("chat");
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>("checking");
  const [pullProgress, setPullProgress] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const checkOllama = useCallback(async () => {
    setOllamaStatus("checking");
    try {
      const invoke = await getInvoke();
      const healthy = await invoke<boolean>("ai_health");
      if (!healthy) { setOllamaStatus("offline"); return; }

      const models = await invoke<Array<{ name: string; size: number }>>("ai_list_models");
      const hasModel = models.some((m) => m.name.startsWith("deepseek-coder"));
      if (!hasModel) {
        setOllamaStatus("pulling");
        setPullProgress("Downloading DeepSeek Coder...");
        try {
          await invoke("ai_pull_model", { model: MODEL });
          setOllamaStatus("online");
        } catch (e: unknown) {
          setOllamaStatus("offline");
          setPullProgress(String(e));
        }
      } else {
        setOllamaStatus("online");
      }
    } catch {
      setOllamaStatus("offline");
    }
  }, []);

  useEffect(() => { checkOllama(); }, [checkOllama]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [aiMessages.length, aiLoading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || aiLoading || ollamaStatus !== "online") return;

    setInput("");
    addAiMessage({ role: "user", content: text, mode });
    setAiLoading(true);

    try {
      const invoke = await getInvoke();
      const allMessages = [...useAppStore.getState().aiMessages];
      const apiMessages = allMessages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));

      const response = await invoke<string>("ai_chat", {
        model: MODEL,
        systemPrompt: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.chat,
        messages: apiMessages,
      });

      addAiMessage({ role: "assistant", content: response, mode });
    } catch (err: unknown) {
      addAiMessage({ role: "assistant", content: `**Error:** ${err}`, mode });
    } finally {
      setAiLoading(false);
    }
  }, [input, mode, aiLoading, ollamaStatus, addAiMessage, setAiLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const extractCodeBlock = (text: string): string | null => {
    const match = text.match(/```[\w]*\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  };

  const modes: { id: AiMode; icon: typeof Terminal; label: string; placeholder: string }[] = [
    { id: "chat", icon: MessageSquare, label: "Chat", placeholder: "Ask anything about terminal/shell..." },
    { id: "explain", icon: Terminal, label: "Explain", placeholder: "Paste a command to explain..." },
    { id: "generate", icon: Wand2, label: "Generate", placeholder: "Describe what you want to do..." },
    { id: "fix", icon: AlertTriangle, label: "Fix", placeholder: "Paste the error output..." },
  ];

  const currentMode = modes.find((m) => m.id === mode)!;

  // Offline state
  if (ollamaStatus === "offline" || ollamaStatus === "checking" || ollamaStatus === "pulling") {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={18} style={{ color: "var(--accent-purple)" }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>AI Assistant</span>
        </div>

        {ollamaStatus === "checking" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 16, color: "var(--text-muted)" }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12 }}>Checking Ollama...</span>
          </div>
        )}

        {ollamaStatus === "pulling" && (
          <div style={{ background: "var(--bg-tertiary)", borderRadius: "var(--radius-md)", padding: 16, border: "1px solid var(--border-color)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Loader2 size={14} style={{ color: "var(--accent-warning)", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 12, color: "var(--accent-warning)", fontWeight: 500 }}>{pullProgress}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>This may take a few minutes on first run...</div>
          </div>
        )}

        {ollamaStatus === "offline" && (
          <div style={{ background: "var(--bg-tertiary)", borderRadius: "var(--radius-md)", padding: 16, border: "1px solid var(--border-color)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <AlertCircle size={14} style={{ color: "var(--accent-error)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Ollama Required</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 12px" }}>
              NovaShell AI uses <strong>Ollama</strong> to run AI models locally — free, private, no API keys needed.
            </p>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
              <div>1. Install Ollama (one-time setup)</div>
              <div>2. Start Ollama</div>
              <div>3. Models download automatically</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  import("@tauri-apps/plugin-shell").then(({ open }) => {
                    open("https://ollama.com/download");
                  }).catch(() => {});
                }}
                style={{
                  flex: 1, padding: "8px 12px", background: "var(--accent-primary)", color: "white",
                  border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12, fontWeight: 500,
                }}
              >
                Download Ollama
              </button>
              <button onClick={checkOllama} style={{
                padding: "8px 12px", background: "var(--bg-active)", color: "var(--text-secondary)",
                border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12,
              }}>
                Retry
              </button>
            </div>
            {pullProgress && (
              <div style={{ fontSize: 11, color: "var(--accent-error)", marginTop: 8 }}>{pullProgress}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        borderBottom: "1px solid var(--border-color)", flexShrink: 0,
      }}>
        <Sparkles size={16} style={{ color: "var(--accent-purple)" }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", flex: 1 }}>AI Assistant</span>
        <span title="Ollama connected" style={{ display: "flex" }}>
          <CheckCircle size={12} style={{ color: "var(--accent-secondary)" }} />
        </span>
        <button onClick={clearAiMessages} title="Clear chat" style={iconBtnStyle}>
          <Trash2 size={12} />
        </button>
      </div>

      {/* Mode selector */}
      <div style={{
        display: "flex", gap: 4, padding: "8px 12px",
        borderBottom: "1px solid var(--border-subtle)", flexShrink: 0,
      }}>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              padding: "5px 6px", fontSize: 11, fontWeight: 500, border: "none", cursor: "pointer",
              borderRadius: "var(--radius-sm)", transition: "all var(--transition-fast)",
              background: mode === m.id ? "var(--accent-primary)" : "var(--bg-tertiary)",
              color: mode === m.id ? "white" : "var(--text-secondary)",
            }}
          >
            <m.icon size={11} />
            {m.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10,
      }}>
        {aiMessages.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", gap: 12, color: "var(--text-muted)", textAlign: "center",
          }}>
            <Sparkles size={32} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              <strong style={{ color: "var(--text-secondary)" }}>DeepSeek Coder</strong>
              <br />
              Explain commands, generate scripts,
              <br />
              fix errors — running locally.
            </div>
          </div>
        )}

        {aiMessages.map((msg) => {
          const isUser = msg.role === "user";
          const codeBlock = !isUser ? extractCodeBlock(msg.content) : null;
          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "92%", padding: "8px 12px", borderRadius: "var(--radius-md)",
                fontSize: 12, lineHeight: 1.6, wordBreak: "break-word",
                background: isUser ? "var(--accent-primary)" : "var(--bg-tertiary)",
                color: isUser ? "white" : "var(--text-primary)",
                border: isUser ? "none" : "1px solid var(--border-subtle)",
              }}>
                <div
                  style={{ whiteSpace: "pre-wrap" }}
                  dangerouslySetInnerHTML={{ __html: isUser ? escapeHtml(msg.content) : renderMarkdown(msg.content) }}
                />
                {codeBlock && !isUser && (
                  <button
                    onClick={() => handleCopy(msg.id, codeBlock)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, marginTop: 6,
                      padding: "3px 8px", fontSize: 10, background: "var(--bg-active)",
                      color: "var(--text-secondary)", border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-sm)", cursor: "pointer",
                    }}
                  >
                    {copiedId === msg.id ? <Check size={10} /> : <Copy size={10} />}
                    {copiedId === msg.id ? "Copied!" : "Copy command"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {aiLoading && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
            background: "var(--bg-tertiary)", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)", alignSelf: "flex-start",
          }}>
            <Loader2 size={14} style={{ color: "var(--accent-purple)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-color)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentMode.placeholder}
            rows={1}
            style={{
              flex: 1, padding: "8px 10px", background: "var(--bg-secondary)",
              color: "var(--text-primary)", border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)", fontSize: 12, resize: "none",
              outline: "none", fontFamily: "inherit", lineHeight: 1.5,
              minHeight: 34, maxHeight: 120, overflow: "auto",
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || aiLoading}
            style={{
              padding: "8px 10px", background: input.trim() && !aiLoading ? "var(--accent-primary)" : "var(--bg-active)",
              color: "white", border: "none", borderRadius: "var(--radius-sm)",
              cursor: input.trim() && !aiLoading ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", opacity: input.trim() && !aiLoading ? 1 : 0.5,
              flexShrink: 0, height: 34,
            }}
          >
            <Send size={14} />
          </button>
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, textAlign: "center" }}>
          DeepSeek Coder — Local via Ollama
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
  padding: 4, borderRadius: "var(--radius-sm)", display: "flex",
};
