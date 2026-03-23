import { Users, Eye, Keyboard, Share2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useT } from "../i18n";

/**
 * Overlay shown on top of terminal tabs that have an active collab session.
 * Shows a subtle indicator strip — no intrusion on terminal UX.
 */
export function CollabOverlay({ tabId }: { tabId: string }) {
  const collabSessions = useAppStore((s) => s.collabSessions);
  const tabs = useAppStore((s) => s.tabs);
  const t = useT();

  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  // Check if this tab is hosting (sessionId matches a host collab)
  const hostSession = tab.sessionId ? collabSessions[tab.sessionId] : null;
  // Check if this tab is a guest session
  const guestSession = Object.values(collabSessions).find(
    (s) => s.tabId === tabId && s.role === "guest"
  );

  const session = hostSession || guestSession;
  if (!session || session.status !== "active") return null;

  const isHost = session.role === "host";
  const guestCount = session.users.filter((u) => !u.is_host).length;
  // For guest overlay, check if ANY guest has FullControl (could be us)
  const hasControl = !isHost && session.users.some(
    (u) => !u.is_host && u.permission === "FullControl"
  );

  const borderColor = isHost ? "#58a6ff" : (hasControl ? "#3fb950" : "#58a6ff");

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "2px 8px",
        background: `${borderColor}18`,
        borderBottom: `1px solid ${borderColor}40`,
        fontSize: 10,
        color: borderColor,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {isHost ? (
        <>
          <Share2 size={10} />
          <span style={{ fontWeight: 600 }}>
            {t("collab.hosting")} — {session.sessionCode}
          </span>
          <span style={{ opacity: 0.7 }}>
            <Users size={9} style={{ verticalAlign: "middle", marginRight: 2 }} />
            {guestCount}
          </span>
        </>
      ) : (
        <>
          {hasControl ? <Keyboard size={10} /> : <Eye size={10} />}
          <span style={{ fontWeight: 600 }}>
            {session.hostName} — {hasControl ? t("collab.fullControl") : t("collab.readOnly")}
          </span>
        </>
      )}
    </div>
  );
}
