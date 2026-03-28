import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Plus, X, Users, Share2, Monitor, FolderSync, Activity,
  Edit3, Bug, Sparkles, FileText, Shield, Gauge,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { PanelTabType } from "../store/appStore";
import { useT } from "../i18n";

const shellIcons: Record<string, string> = {
  powershell: "PS",
  cmd: ">_",
  bash: "$",
  zsh: "%",
  fish: "><>",
  wsl: "~",
};

const panelIconMap: Record<PanelTabType, React.ReactNode> = {
  ssh: <Monitor size={10} />,
  sftp: <FolderSync size={10} />,
  servermap: <Activity size={10} />,
  collab: <Users size={10} />,
  editor: <Edit3 size={10} />,
  debug: <Bug size={10} />,
  ai: <Sparkles size={10} />,
  docs: <FileText size={10} />,
  hacking: <Shield size={10} />,
  infra: <Gauge size={10} />,
};

const panelMenuItems: { type: PanelTabType; label: string }[] = [
  { type: "ssh", label: "SSH" },
  { type: "sftp", label: "SFTP" },
  { type: "editor", label: "Editor" },
  { type: "ai", label: "AI Assistant" },
  { type: "debug", label: "Debug" },
  { type: "servermap", label: "Server Map" },
  { type: "docs", label: "Session Docs" },
  { type: "hacking", label: "Hacking" },
  { type: "infra", label: "Infra Monitor" },
  { type: "collab", label: "Collaboration" },
];

interface ShellInfo {
  name: string;
  path: string;
  available: boolean;
}

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const addTab = useAppStore((s) => s.addTab);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const collabSessions = useAppStore((s) => s.collabSessions);
  const [showShellMenu, setShowShellMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [availableShells, setAvailableShells] = useState<ShellInfo[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const t = useT();

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch available shells from backend (platform-aware)
  useEffect(() => {
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<ShellInfo[]>("get_available_shells").then(setAvailableShells).catch(() => {
        // Fallback for demo mode
        setAvailableShells([
          { name: "PowerShell", path: "powershell.exe", available: true },
          { name: "CMD", path: "cmd.exe", available: true },
        ]);
      });
    }).catch(() => {});
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!showShellMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current && btnRef.current.contains(target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setShowShellMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showShellMenu]);

  const toggleMenu = useCallback(() => {
    if (!showShellMenu && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setShowShellMenu((v) => !v);
  }, [showShellMenu]);

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="tab-icon" style={{ fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
            {(() => {
              // Panel tab → use panel icon
              if (tab.type && tab.type !== "terminal") {
                return panelIconMap[tab.type] || <Edit3 size={10} />;
              }
              // Terminal tab → use shell icon
              const s = tab.shellType.toLowerCase();
              if (s === "collab-guest") return <Users size={10} style={{ color: "#3fb950" }} />;
              if (s.includes("powershell")) return "PS";
              if (s.includes("cmd")) return ">_";
              if (s.includes("zsh")) return "%";
              if (s.includes("fish")) return "><>";
              if (s.includes("wsl")) return "~";
              if (s.includes("bash")) return "$";
              return ">_";
            })()}
            {/* Show sharing indicator if this tab is being hosted */}
            {tab.sessionId && collabSessions[tab.sessionId]?.role === "host" &&
              collabSessions[tab.sessionId]?.status === "active" && (
              <Share2 size={8} style={{ color: "#58a6ff" }} />
            )}
          </span>
          <span>{tab.title}</span>
          {tabs.length > 1 && (
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X size={10} />
            </span>
          )}
        </button>
      ))}
      <button
        ref={btnRef}
        className="tab-add"
        onClick={toggleMenu}
        title={t("tabbar.newTab")}
      >
        <Plus size={14} />
      </button>
      {showShellMenu && createPortal(
        <div
          ref={dropdownRef}
          className="shell-dropdown animate-slide-up"
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 10000,
          }}
        >
          {availableShells.map((shell) => {
            const key = shell.name.toLowerCase().replace(/\s+/g, "").replace("gitbash", "bash");
            return (
              <button
                key={shell.path}
                className="shell-option"
                onClick={() => {
                  addTab(shell.path);
                  setShowShellMenu(false);
                }}
              >
                <span style={{ fontWeight: 700, width: 24 }}>{shellIcons[key] || ">_"}</span>
                {shell.name}
              </button>
            );
          })}
          <div style={{ height: 1, background: "var(--border-color)", margin: "4px 0" }} />
          {panelMenuItems.map((item) => (
            <button
              key={item.type}
              className="shell-option"
              onClick={() => {
                openPanelTab(item.type);
                setShowShellMenu(false);
              }}
            >
              <span style={{ display: "inline-flex", width: 24, justifyContent: "center" }}>{panelIconMap[item.type]}</span>
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
