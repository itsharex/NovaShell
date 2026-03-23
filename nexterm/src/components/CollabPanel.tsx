import { useState, useRef, useEffect } from "react";
import {
  Users,
  Share2,
  LogIn,
  Copy,
  Check,
  Crown,
  Eye,
  Keyboard,
  Send,
  UserX,
  StopCircle,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { CollabSessionInfo, CollabPermission } from "../store/appStore";
import { useT } from "../i18n";

export function CollabPanel() {
  const collabSessions = useAppStore((s) => s.collabSessions);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const t = useT();

  // Set up per-session event listeners with proper cancellation
  const sessionKeys = Object.keys(collabSessions).join(",");
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (cancelled) return;

      for (const [sessionId, session] of Object.entries(collabSessions)) {
        if (cancelled) break;
        if (session.status !== "active") continue;

        // User joined
        const u1 = await listen<{ id: string; name: string; permission: string; is_host: boolean }>(
          `collab-user-joined-${sessionId}`,
          (event) => {
            useAppStore.getState().addCollabUser(sessionId, {
              id: event.payload.id,
              name: event.payload.name,
              permission: event.payload.permission as CollabPermission,
              is_host: event.payload.is_host,
            });
          }
        );
        unlisteners.push(u1);

        // User left
        const u2 = await listen<string>(
          `collab-user-left-${sessionId}`,
          (event) => {
            useAppStore.getState().removeCollabUser(sessionId, event.payload);
          }
        );
        unlisteners.push(u2);

        // Chat message (host receives from guests)
        const u3 = await listen<{ id: string; sender: string; content: string; timestamp: number }>(
          `collab-chat-${sessionId}`,
          (event) => {
            const p = event.payload;
            useAppStore.getState().addCollabChatMessage(sessionId, {
              id: p.id || crypto.randomUUID(),
              sender: p.sender || "Unknown",
              content: p.content || "",
              timestamp: p.timestamp || Date.now(),
            });
          }
        );
        unlisteners.push(u3);

        // Permission changed (guest receives)
        if (session.role === "guest") {
          const u4 = await listen<{ userId: string; permission: string }>(
            `collab-permission-${sessionId}`,
            (event) => {
              const p = event.payload;
              const updated = useAppStore.getState().collabSessions[sessionId];
              if (updated) {
                useAppStore.getState().updateCollabUsers(
                  sessionId,
                  updated.users.map((u) =>
                    u.id === p.userId ? { ...u, permission: p.permission as CollabPermission } : u
                  )
                );
              }
            }
          );
          unlisteners.push(u4);

          const u5 = await listen<string>(`collab-kicked-${sessionId}`, () => {
            useAppStore.getState().removeCollabSession(sessionId);
          });
          unlisteners.push(u5);

          const u6 = await listen<string>(`collab-disconnected-${sessionId}`, () => {
            useAppStore.getState().removeCollabSession(sessionId);
          });
          unlisteners.push(u6);
        }

        if (session.role === "host") {
          const u7 = await listen<string>(`collab-ended-${sessionId}`, () => {
            useAppStore.getState().removeCollabSession(sessionId);
          });
          unlisteners.push(u7);
        }
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [sessionKeys]);

  // Find collab session for active tab (either as host or guest)
  const activeSession = Object.values(collabSessions).find(
    (s) => s.tabId === activeTabId
  );

  // Also check if the active tab's sessionId matches a host collab
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const hostSession = activeTab?.sessionId
    ? collabSessions[activeTab.sessionId]
    : null;

  const currentSession = activeSession || hostSession;

  if (currentSession?.role === "host") {
    return <HostView session={currentSession} />;
  }
  if (currentSession?.role === "guest") {
    return <GuestView session={currentSession} />;
  }

  return <LobbyView />;
}

// ──────────── Lobby: No active session ────────────

function LobbyView() {
  const [mode, setMode] = useState<"idle" | "host" | "join">("idle");
  const t = useT();

  return (
    <div>
      <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
        <Users size={32} style={{ margin: "0 auto 8px", display: "block", opacity: 0.5 }} />
        {t("collab.description")}
      </div>

      {mode === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className="btn-primary"
            onClick={() => setMode("host")}
            style={btnStyle}
          >
            <Share2 size={14} /> {t("collab.shareSession")}
          </button>
          <button
            className="btn-secondary"
            onClick={() => setMode("join")}
            style={{ ...btnStyle, background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
          >
            <LogIn size={14} /> {t("collab.joinSession")}
          </button>
        </div>
      )}

      {mode === "host" && <HostSetup onCancel={() => setMode("idle")} />}
      {mode === "join" && <JoinSetup onCancel={() => setMode("idle")} />}
    </div>
  );
}

// ──────────── Host Setup Form ────────────

function HostSetup({ onCancel }: { onCancel: () => void }) {
  const [hostName, setHostName] = useState("Host");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const startCollabHosting = useAppStore((s) => s.startCollabHosting);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const t = useT();

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  const handleStart = async () => {
    if (!activeTab?.sessionId) {
      setError(t("collab.noActiveSession"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await startCollabHosting(activeTabId, activeTab.sessionId, hostName, 80, 24);
    } catch (e: any) {
      setError(e?.toString() || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={labelStyle}>
        {t("collab.displayName")}
        <input
          type="text"
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          style={inputStyle}
          placeholder="Host"
          maxLength={32}
        />
      </label>
      {!activeTab?.sessionId && (
        <div style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
          {t("collab.noActiveSession")}
        </div>
      )}
      {error && <div style={{ color: "#ff7b72", fontSize: 11 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleStart} disabled={loading || !activeTab?.sessionId} style={btnStyle}>
          {loading ? t("common.loading") : t("collab.shareSession")}
        </button>
        <button onClick={onCancel} style={{ ...btnStyle, background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

// ──────────── Join Setup Form ────────────

function JoinSetup({ onCancel }: { onCancel: () => void }) {
  const [hostAddress, setHostAddress] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [guestName, setGuestName] = useState("Guest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const joinCollabSession = useAppStore((s) => s.joinCollabSession);
  const t = useT();

  const handleJoin = async () => {
    if (!hostAddress || !sessionCode) return;
    setLoading(true);
    setError("");
    try {
      await joinCollabSession(hostAddress, sessionCode.toUpperCase(), guestName);
    } catch (e: any) {
      setError(e?.toString() || t("collab.connectionFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={labelStyle}>
        {t("collab.hostAddress")}
        <input
          type="text"
          value={hostAddress}
          onChange={(e) => setHostAddress(e.target.value)}
          style={inputStyle}
          placeholder="192.168.1.100:12345"
        />
      </label>
      <label style={labelStyle}>
        {t("collab.sessionCode")}
        <input
          type="text"
          value={sessionCode}
          onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
          style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: 3, textAlign: "center", fontSize: 16 }}
          placeholder="ABC123"
          maxLength={6}
        />
      </label>
      <label style={labelStyle}>
        {t("collab.displayName")}
        <input
          type="text"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          style={inputStyle}
          placeholder="Guest"
          maxLength={32}
        />
      </label>
      {error && <div style={{ color: "#ff7b72", fontSize: 11 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleJoin} disabled={loading || !hostAddress || !sessionCode} style={btnStyle}>
          {loading ? t("common.connecting") : t("collab.joinSession")}
        </button>
        <button onClick={onCancel} style={{ ...btnStyle, background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

// ──────────── Host View: Active session ────────────

function HostView({ session }: { session: CollabSessionInfo }) {
  const [copied, setCopied] = useState(false);
  const stopCollabHosting = useAppStore((s) => s.stopCollabHosting);
  const collabSetPermission = useAppStore((s) => s.collabSetPermission);
  const collabKickGuest = useAppStore((s) => s.collabKickGuest);
  const t = useT();

  const connectionString = `${session.hostAddress}:${session.port}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(`${connectionString} | ${session.sessionCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStop = async () => {
    await stopCollabHosting(session.id);
  };

  const togglePermission = async (guestId: string, current: CollabPermission) => {
    const next = current === "ReadOnly" ? "FullControl" : "ReadOnly";
    await collabSetPermission(session.id, guestId, next);
  };

  const guestCount = session.users.filter((u) => !u.is_host).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Session info */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("collab.sessionCode")}</span>
          <span style={{
            background: "#3fb95020", color: "#3fb950", fontSize: 10, padding: "2px 8px",
            borderRadius: 10, fontWeight: 600,
          }}>
            {t("collab.hosting")}
          </span>
        </div>
        <div style={{
          fontFamily: "monospace", fontSize: 22, fontWeight: 700, letterSpacing: 4,
          textAlign: "center", color: "var(--accent-color, #58a6ff)", padding: "4px 0",
        }}>
          {session.sessionCode}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 4 }}>
          {connectionString}
        </div>
        <button onClick={handleCopy} style={{ ...btnSmall, marginTop: 8, width: "100%" }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("collab.copied") : t("collab.copyInfo")}
        </button>
      </div>

      {/* Connected users */}
      <div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
          {t("collab.connectedUsers")} ({session.users.length})
        </div>
        {session.users.map((user) => (
          <div key={user.id} style={userRowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
              {user.is_host ? (
                <Crown size={12} style={{ color: "#d29922", flexShrink: 0 }} />
              ) : user.permission === "FullControl" ? (
                <Keyboard size={12} style={{ color: "#3fb950", flexShrink: 0 }} />
              ) : (
                <Eye size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.name}
              </span>
              {user.is_host && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>(host)</span>}
            </div>
            {!user.is_host && (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => togglePermission(user.id, user.permission)}
                  title={user.permission === "ReadOnly" ? t("collab.grantControl") : t("collab.revokeControl")}
                  style={iconBtnStyle}
                >
                  {user.permission === "ReadOnly" ? <Keyboard size={11} /> : <Eye size={11} />}
                </button>
                <button
                  onClick={() => collabKickGuest(session.id, user.id)}
                  title={t("collab.kick")}
                  style={{ ...iconBtnStyle, color: "#ff7b72" }}
                >
                  <UserX size={11} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chat */}
      <ChatPanel session={session} isHost={true} />

      {/* Stop button */}
      <button onClick={handleStop} style={{ ...btnStyle, background: "#ff7b7220", color: "#ff7b72", border: "1px solid #ff7b7240" }}>
        <StopCircle size={14} /> {t("collab.stopSharing")}
      </button>
    </div>
  );
}

// ──────────── Guest View ────────────

function GuestView({ session }: { session: CollabSessionInfo }) {
  const leaveCollabSession = useAppStore((s) => s.leaveCollabSession);
  const t = useT();

  const myPermission = session.users.find((u) => !u.is_host)?.permission || "ReadOnly";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("collab.connectedTo")}</span>
          <span style={{
            background: myPermission === "FullControl" ? "#3fb95020" : "#58a6ff20",
            color: myPermission === "FullControl" ? "#3fb950" : "#58a6ff",
            fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
          }}>
            {myPermission === "FullControl" ? t("collab.fullControl") : t("collab.readOnly")}
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, textAlign: "center" }}>
          {session.hostName || "Host"}
        </div>
      </div>

      {/* Users */}
      <div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
          {t("collab.connectedUsers")} ({session.users.length})
        </div>
        {session.users.map((user) => (
          <div key={user.id} style={userRowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {user.is_host ? (
                <Crown size={12} style={{ color: "#d29922" }} />
              ) : user.permission === "FullControl" ? (
                <Keyboard size={12} style={{ color: "#3fb950" }} />
              ) : (
                <Eye size={12} style={{ color: "var(--text-muted)" }} />
              )}
              <span style={{ fontSize: 12 }}>{user.name}</span>
              {user.is_host && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>(host)</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Chat */}
      <ChatPanel session={session} isHost={false} />

      {/* Leave button */}
      <button
        onClick={() => leaveCollabSession(session.id)}
        style={{ ...btnStyle, background: "#ff7b7220", color: "#ff7b72", border: "1px solid #ff7b7240" }}
      >
        <LogOut size={14} /> {t("collab.leaveSession")}
      </button>
    </div>
  );
}

// ──────────── Chat Sub-panel ────────────

function ChatPanel({ session, isHost }: { session: CollabSessionInfo; isHost: boolean }) {
  const [message, setMessage] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const collabSendChat = useAppStore((s) => s.collabSendChat);
  const t = useT();

  const hostUser = session.users.find((u) => u.is_host);
  const senderName = isHost ? (hostUser?.name || "Host") : (session.guestName || "Guest");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.chatMessages.length]);

  const handleSend = async () => {
    if (!message.trim()) return;
    try {
      await collabSendChat(session.id, message.trim(), senderName, isHost);
      setMessage("");
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div>
      <button
        onClick={() => setChatOpen(!chatOpen)}
        style={{ ...btnSmall, width: "100%", marginBottom: chatOpen ? 6 : 0, justifyContent: "center" }}
      >
        <MessageCircle size={12} />
        {t("collab.chat")} ({session.chatMessages.length})
      </button>

      {chatOpen && (
        <div style={{
          background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-subtle)", overflow: "hidden",
        }}>
          {/* Messages */}
          <div style={{ height: 160, overflowY: "auto", padding: 6 }}>
            {session.chatMessages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 11, padding: 16 }}>
                {t("collab.noMessages")}
              </div>
            )}
            {session.chatMessages.map((msg) => (
              <div key={msg.id} style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent-color, #58a6ff)" }}>
                  {msg.sender}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <div style={{ fontSize: 11, color: "var(--text-primary)", wordBreak: "break-word" }}>
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: 4, padding: 4, borderTop: "1px solid var(--border-subtle)" }}>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("collab.typeMessage")}
              style={{ ...inputStyle, fontSize: 11, padding: "4px 8px", flex: 1 }}
              maxLength={500}
            />
            <button onClick={handleSend} disabled={!message.trim()} style={iconBtnStyle}>
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────── Styles ────────────

const btnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "none",
  background: "var(--accent-color, #58a6ff)", color: "#fff", fontSize: 12,
  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

const btnSmall: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)",
  background: "var(--bg-tertiary)", color: "var(--text-primary)", fontSize: 11,
  cursor: "pointer", fontFamily: "inherit",
};

const iconBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 4, borderRadius: "var(--radius-sm)", border: "none",
  background: "transparent", color: "var(--text-muted)", cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 4, fontSize: 11,
  color: "var(--text-muted)", fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 8px",
  background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
  fontSize: 12, fontFamily: "inherit", outline: "none",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-subtle)", padding: 12,
};

const userRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "5px 8px", borderRadius: "var(--radius-sm)",
  background: "var(--bg-tertiary)", marginBottom: 3,
};
