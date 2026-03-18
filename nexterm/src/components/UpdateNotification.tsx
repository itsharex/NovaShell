import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Download, X, RefreshCw, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { useT } from "../i18n";

type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string; body: string }
  | { phase: "downloading"; progress: number }
  | { phase: "ready" }
  | { phase: "error"; message: string }
  | { phase: "up-to-date" };

let checkCache: typeof import("@tauri-apps/plugin-updater") | null = null;
async function getUpdater() {
  if (!checkCache) checkCache = await import("@tauri-apps/plugin-updater");
  return checkCache;
}

let processCache: typeof import("@tauri-apps/plugin-process") | null = null;
async function getProcess() {
  if (!processCache) processCache = await import("@tauri-apps/plugin-process");
  return processCache;
}

// Parse GitHub release body markdown into styled JSX
function renderReleaseNotes(body: string) {
  // Remove download section and footer
  const cleaned = body
    .replace(/## Downloads[\s\S]*$/i, "")
    .replace(/---[\s\S]*$/i, "")
    .trim();

  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of cleaned.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // ### Header → section title
    if (trimmed.startsWith("### ")) {
      elements.push(
        <div key={key++} style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-primary)", marginTop: elements.length > 0 ? 8 : 0, marginBottom: 3 }}>
          {trimmed.replace(/^###\s*/, "")}
        </div>
      );
    }
    // ## Header → main title
    else if (trimmed.startsWith("## ")) {
      elements.push(
        <div key={key++} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginTop: elements.length > 0 ? 6 : 0, marginBottom: 4 }}>
          {trimmed.replace(/^##\s*/, "")}
        </div>
      );
    }
    // - Bullet point
    else if (trimmed.startsWith("- ")) {
      const text = trimmed.slice(2)
        .replace(/\*\*(.+?)\*\*/g, "\u200B$1\u200B"); // bold markers for split below
      const parts = text.split("\u200B");
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 5, marginBottom: 2, paddingLeft: 4 }}>
          <span style={{ color: "var(--accent-primary)", flexShrink: 0, fontSize: 10, lineHeight: "16px" }}>&#8226;</span>
          <span style={{ fontSize: 10.5, color: "var(--text-secondary)", lineHeight: "16px" }}>
            {parts.map((part, i) =>
              i % 2 === 1
                ? <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 600 }}>{part}</strong>
                : <span key={i}>{part}</span>
            )}
          </span>
        </div>
      );
    }
    // Regular text
    else {
      elements.push(
        <div key={key++} style={{ fontSize: 10.5, color: "var(--text-secondary)", marginBottom: 2 }}>
          {trimmed}
        </div>
      );
    }
  }

  return elements.length > 0 ? elements : <span style={{ fontSize: 10.5 }}>{body.slice(0, 500)}</span>;
}

export const UpdateNotification = memo(function UpdateNotification() {
  const [status, setStatus] = useState<UpdateStatus>({ phase: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateInstalledRef = useRef(false);
  const t = useT();

  const checkForUpdates = useCallback(async (silent = true) => {
    // Don't re-check if we already downloaded and installed an update
    if (updateInstalledRef.current) return;

    try {
      setStatus({ phase: "checking" });
      const { check } = await getUpdater();
      const update = await check();

      if (update) {
        setStatus({
          phase: "available",
          version: update.version,
          body: update.body || "",
        });
        setDismissed(false);
        setMinimized(false);
      } else {
        setStatus({ phase: "up-to-date" });
        if (silent) {
          // Auto-dismiss "up to date" after 3s in silent mode
          dismissTimerRef.current = setTimeout(() => setStatus({ phase: "idle" }), 3000);
        }
      }
    } catch (e) {
      if (!silent) {
        setStatus({ phase: "error", message: String(e) });
      } else {
        // Silent check failure — don't bother the user
        setStatus({ phase: "idle" });
      }
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    try {
      setStatus({ phase: "downloading", progress: 0 });
      const { check } = await getUpdater();
      const update = await check();

      if (!update) {
        setStatus({ phase: "up-to-date" });
        return;
      }

      let lastProgress = 0;
      let totalSize = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          lastProgress = 0;
          totalSize = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          lastProgress += event.data.chunkLength;
          if (totalSize > 0) {
            setStatus({ phase: "downloading", progress: Math.min(99, Math.round((lastProgress / totalSize) * 100)) });
          }
        } else if (event.event === "Finished") {
          setStatus({ phase: "ready" });
        }
      });

      // Mark as installed so auto-check doesn't re-notify
      updateInstalledRef.current = true;
      setStatus({ phase: "ready" });
    } catch (e) {
      setStatus({ phase: "error", message: String(e) });
    }
  }, []);

  const relaunchApp = useCallback(async () => {
    try {
      const { relaunch } = await getProcess();
      await relaunch();
    } catch (e) {
      setStatus({ phase: "error", message: `Relaunch failed: ${String(e)}` });
    }
  }, []);

  // Auto-check on startup (30s delay to not block boot)
  useEffect(() => {
    const timer = setTimeout(() => checkForUpdates(true), 30000);
    // Then check every 4 hours
    const interval = setInterval(() => checkForUpdates(true), 4 * 60 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [checkForUpdates]);

  // Don't render anything if idle or dismissed
  if (status.phase === "idle") return null;
  if (dismissed && status.phase !== "downloading" && status.phase !== "ready") return null;

  // Minimized badge (small dot in corner)
  if (minimized && status.phase === "available") {
    return (
      <button
        onClick={() => setMinimized(false)}
        style={{
          position: "fixed",
          bottom: 32,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--accent-primary)",
          border: "2px solid var(--bg-primary)",
          color: "white",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          zIndex: 9999,
          animation: "pulse-glow 2s ease-in-out infinite",
        }}
        title="Update available"
      >
        <Download size={16} />
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      bottom: 32,
      right: 16,
      width: 380,
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      zIndex: 9999,
      overflow: "hidden",
      fontFamily: "inherit",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        background: status.phase === "error"
          ? "rgba(255,123,114,0.1)"
          : status.phase === "ready"
            ? "rgba(63,185,80,0.1)"
            : "rgba(88,166,255,0.1)",
        borderBottom: "1px solid var(--border-subtle)",
      }}>
        {status.phase === "checking" && <Loader size={14} style={{ color: "var(--accent-primary)", animation: "spin 1s linear infinite" }} />}
        {status.phase === "available" && <Download size={14} style={{ color: "var(--accent-primary)" }} />}
        {status.phase === "downloading" && <Loader size={14} style={{ color: "var(--accent-primary)", animation: "spin 1s linear infinite" }} />}
        {status.phase === "ready" && <CheckCircle size={14} style={{ color: "var(--accent-secondary)" }} />}
        {status.phase === "error" && <AlertCircle size={14} style={{ color: "var(--accent-error)" }} />}
        {status.phase === "up-to-date" && <CheckCircle size={14} style={{ color: "var(--accent-secondary)" }} />}

        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
          {status.phase === "checking" && t("update.checkingUpdates")}
          {status.phase === "available" && `Update v${status.version}`}
          {status.phase === "downloading" && t("update.downloadingUpdate")}
          {status.phase === "ready" && t("update.updateReady")}
          {status.phase === "error" && t("update.updateError")}
          {status.phase === "up-to-date" && t("update.upToDate")}
        </span>

        {status.phase !== "downloading" && status.phase !== "ready" && (
          <button
            onClick={() => {
              if (status.phase === "available") {
                setMinimized(true);
              } else {
                setDismissed(true);
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 2,
              display: "flex",
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "10px 12px" }}>
        {status.phase === "checking" && (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
            {t("update.connectingServer")}
          </p>
        )}

        {status.phase === "up-to-date" && (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
            {t("update.latestVersion")}
          </p>
        )}

        {status.phase === "available" && (
          <>
            {status.body && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {t("update.whatsNew")}
                </div>
                <div style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  margin: "0 0 10px 0",
                  maxHeight: 200,
                  overflowY: "auto",
                  lineHeight: 1.6,
                  padding: "8px 10px",
                  background: "var(--bg-primary)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}>
                  {renderReleaseNotes(status.body)}
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={downloadAndInstall}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  background: "var(--accent-primary)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Download size={12} />
                {t("update.installUpdate")}
              </button>
              <button
                onClick={() => setDismissed(true)}
                style={{
                  padding: "7px 12px",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t("update.later")}
              </button>
            </div>
          </>
        )}

        {status.phase === "downloading" && (
          <>
            <div style={{
              width: "100%",
              height: 6,
              background: "var(--bg-active)",
              borderRadius: 3,
              overflow: "hidden",
              marginBottom: 6,
            }}>
              <div style={{
                width: `${status.progress}%`,
                height: "100%",
                background: "var(--accent-primary)",
                borderRadius: 3,
                transition: "width 0.3s ease",
              }} />
            </div>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
              {status.progress > 0 ? `${status.progress}%` : t("update.startingDownload")}
            </p>
          </>
        )}

        {status.phase === "ready" && (
          <>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 10px 0" }}>
              Update installed successfully. Restart NovaShell to apply changes.
            </p>
            <button
              onClick={relaunchApp}
              style={{
                width: "100%",
                padding: "7px 12px",
                background: "var(--accent-secondary)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <RefreshCw size={12} />
              {t("update.restartNow")}
            </button>
          </>
        )}

        {status.phase === "error" && (
          <>
            <p style={{
              fontSize: 11,
              color: "var(--accent-error)",
              margin: "0 0 8px 0",
              maxHeight: 40,
              overflowY: "auto",
              wordBreak: "break-word",
            }}>
              {status.message}
            </p>
            <button
              onClick={() => checkForUpdates(false)}
              style={{
                width: "100%",
                padding: "6px 12px",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <RefreshCw size={11} />
              {t("common.retry")}
            </button>
          </>
        )}
      </div>
    </div>
  );
});
