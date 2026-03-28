import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search, Terminal, History, Code2, Monitor, FolderSync, Activity,
  Edit3, Bug, Sparkles, FileText, Shield, Gauge, Palette, Languages,
  Columns, Rows3, Square, Server, Play, Zap, Eye, FolderTree, Puzzle,
  BarChart3, X, Layout, Save, Users,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { SidebarTab, PanelTabType } from "../store/appStore";
import { useT } from "../i18n";

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  category: "action" | "panel" | "server" | "history" | "snippet" | "theme";
  action: () => void;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const language = useAppStore((s) => s.language);
  const setSplitMode = useAppStore((s) => s.setSplitMode);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const toggleHackingMode = useAppStore((s) => s.toggleHackingMode);
  const addTab = useAppStore((s) => s.addTab);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  // Use stable length-based selectors to avoid re-renders on every history/snippet content change
  const historyLen = useAppStore((s) => s.history.length);
  const snippetsLen = useAppStore((s) => s.snippets.length);
  const sshConnectionsLen = useAppStore((s) => s.sshConnections.length);
  const executeSnippet = useAppStore((s) => s.executeSnippet);
  const hackingMode = useAppStore((s) => s.hackingMode);
  const workspaces = useAppStore((s) => s.workspaces);
  const saveWorkspace = useAppStore((s) => s.saveWorkspace);
  const loadWorkspace = useAppStore((s) => s.loadWorkspace);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const openSidebarPanel = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    onClose();
  }, [setSidebarTab, onClose]);

  const openPanel = useCallback((panelType: PanelTabType) => {
    openPanelTab(panelType);
    onClose();
  }, [openPanelTab, onClose]);

  const allItems = useMemo((): PaletteItem[] => {
    const items: PaletteItem[] = [];
    const { history, snippets, sshConnections } = useAppStore.getState();

    // Sidebar panels (auxiliary)
    const sidebarPanels: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
      { id: "history", label: t("sidebar.history"), icon: <History size={14} /> },
      { id: "snippets", label: t("sidebar.snippets"), icon: <Code2 size={14} /> },
      { id: "preview", label: t("sidebar.explorer"), icon: <FolderTree size={14} /> },
      { id: "plugins", label: t("sidebar.plugins"), icon: <Puzzle size={14} /> },
      { id: "stats", label: t("sidebar.stats"), icon: <BarChart3 size={14} /> },
    ];
    for (const p of sidebarPanels) {
      items.push({ id: `panel-${p.id}`, label: p.label, description: "Open sidebar panel", icon: p.icon, category: "panel", action: () => openSidebarPanel(p.id) });
    }

    // Full panels (open as tabs)
    const fullPanels: { id: PanelTabType; label: string; desc: string; icon: React.ReactNode }[] = [
      { id: "ssh", label: t("sidebar.ssh"), desc: "Remote terminal sessions", icon: <Monitor size={14} /> },
      { id: "sftp", label: t("sidebar.sftpTransfer"), desc: "File transfer", icon: <FolderSync size={14} /> },
      { id: "servermap", label: t("sidebar.serverMap"), desc: "Network discovery", icon: <Activity size={14} /> },
      { id: "editor", label: t("sidebar.editor"), desc: "Code editor", icon: <Edit3 size={14} /> },
      { id: "debug", label: t("sidebar.debug"), desc: "Logs & analysis", icon: <Bug size={14} /> },
      { id: "ai", label: t("sidebar.aiAssistant"), desc: "Local AI chat", icon: <Sparkles size={14} /> },
      { id: "docs", label: t("sidebar.sessionDocs"), desc: "Documentation", icon: <FileText size={14} /> },
      { id: "hacking", label: t("sidebar.hackingMode"), desc: "Pentest tools", icon: <Shield size={14} /> },
      { id: "infra", label: t("sidebar.infraMonitor"), desc: "Server dashboards", icon: <Gauge size={14} /> },
      { id: "collab", label: t("sidebar.collab"), desc: "Share sessions", icon: <Users size={14} /> },
    ];
    for (const p of fullPanels) {
      items.push({ id: `panel-${p.id}`, label: p.label, description: p.desc, icon: p.icon, category: "panel", action: () => openPanel(p.id) });
    }

    // Actions
    items.push(
      { id: "action-new-tab", label: "New Terminal Tab", icon: <Terminal size={14} />, category: "action", action: () => { addTab(); onClose(); } },
      { id: "action-split-v", label: "Split Vertical", icon: <Columns size={14} />, category: "action", action: () => { setSplitMode("vertical"); onClose(); } },
      { id: "action-split-h", label: "Split Horizontal", icon: <Rows3 size={14} />, category: "action", action: () => { setSplitMode("horizontal"); onClose(); } },
      { id: "action-split-none", label: "No Split", icon: <Square size={14} />, category: "action", action: () => { setSplitMode("none"); onClose(); } },
      { id: "action-focus", label: "Toggle Focus Mode", icon: <Eye size={14} />, category: "action", action: () => { toggleFocusMode(); onClose(); } },
      { id: "action-sidebar", label: "Toggle Sidebar", icon: <Activity size={14} />, category: "action", action: () => { toggleSidebar(); onClose(); } },
      { id: "action-hacking", label: hackingMode ? "Disable Hacking Mode" : "Enable Hacking Mode", icon: <Shield size={14} />, category: "action", action: () => { toggleHackingMode(); onClose(); } },
      { id: "action-lang", label: language === "en" ? "Switch to Spanish" : "Cambiar a Ingles", icon: <Languages size={14} />, category: "action", action: () => { setLanguage(language === "en" ? "es" : "en"); onClose(); } },
    );

    // Workspaces
    items.push({
      id: "action-save-workspace", label: "Save Current Workspace", icon: <Save size={14} />, category: "action",
      action: () => {
        const name = window.prompt("Workspace name:");
        if (name?.trim()) { saveWorkspace(name.trim()); onClose(); }
      },
    });
    for (const ws of workspaces) {
      items.push({
        id: `workspace-${ws.id}`, label: `Workspace: ${ws.name}`,
        description: `${ws.tabCount} tabs, ${ws.splitMode} split`,
        icon: <Layout size={14} />, category: "action",
        action: () => { loadWorkspace(ws.id); onClose(); },
      });
    }

    // Themes
    for (const th of ["dark", "light", "cyberpunk", "retro", "hacking"] as const) {
      items.push({
        id: `theme-${th}`,
        label: `Theme: ${th.charAt(0).toUpperCase() + th.slice(1)}`,
        icon: <Palette size={14} />,
        category: "theme",
        action: () => { setTheme(th); onClose(); },
      });
    }

    // SSH Servers (quick connect)
    for (const conn of sshConnections) {
      items.push({
        id: `server-${conn.id}`,
        label: conn.name,
        description: `${conn.username}@${conn.host}:${conn.port}`,
        icon: <Server size={14} />,
        category: "server",
        action: () => {
          if (executeSnippet) executeSnippet(`cd ${conn.name}:~`);
          onClose();
        },
      });
    }

    // Recent commands (last 20)
    for (const h of history.slice(0, 20)) {
      items.push({
        id: `history-${h.id}`,
        label: h.command,
        description: new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        icon: <History size={14} />,
        category: "history",
        action: () => {
          if (executeSnippet) executeSnippet(h.command);
          onClose();
        },
      });
    }

    // Snippets
    for (const s of snippets) {
      items.push({
        id: `snippet-${s.id}`,
        label: s.name,
        description: s.command.split("\n")[0],
        icon: <Zap size={14} />,
        category: "snippet",
        action: () => {
          if (executeSnippet) executeSnippet(s.command, s.runMode);
          onClose();
        },
      });
    }

    return items;
  }, [t, historyLen, snippetsLen, sshConnectionsLen, executeSnippet, hackingMode, language, workspaces,
      openPanel, addTab, setSplitMode, toggleFocusMode, toggleSidebar, toggleHackingMode,
      setTheme, setLanguage, saveWorkspace, loadWorkspace, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 15);
    const q = query.toLowerCase();
    return allItems
      .filter((item) =>
        item.label.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [query, allItems]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) filtered[selectedIndex].action();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const categoryColors: Record<string, string> = {
    action: "#58a6ff",
    panel: "#3fb950",
    server: "#bc8cff",
    history: "#8b949e",
    snippet: "#d29922",
    theme: "#f78166",
  };

  const categoryLabels: Record<string, string> = {
    action: "Action",
    panel: "Panel",
    server: "Server",
    history: "History",
    snippet: "Snippet",
    theme: "Theme",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)", display: "flex",
        justifyContent: "center", paddingTop: "15vh",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, maxHeight: "60vh",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, panels, servers, snippets..."
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--text-primary)", fontSize: 14, fontFamily: "inherit",
            }}
          />
          <kbd style={{
            padding: "2px 6px", fontSize: 10, background: "var(--bg-tertiary)",
            border: "1px solid var(--border-subtle)", borderRadius: 4,
            color: "var(--text-muted)", fontFamily: "inherit",
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No results for "{query}"
            </div>
          ) : (
            filtered.map((item, i) => (
              <div
                key={item.id}
                onClick={() => item.action()}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 16px", cursor: "pointer",
                  background: i === selectedIndex ? "var(--bg-hover)" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <span style={{ color: categoryColors[item.category] || "var(--text-muted)", flexShrink: 0, display: "flex" }}>
                  {item.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, color: "var(--text-primary)", fontWeight: 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.label}
                  </div>
                  {item.description && (
                    <div style={{
                      fontSize: 10, color: "var(--text-muted)", marginTop: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.description}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 8, padding: "2px 6px", borderRadius: 8,
                  background: (categoryColors[item.category] || "#888") + "15",
                  color: categoryColors[item.category] || "var(--text-muted)",
                  fontWeight: 600, textTransform: "uppercase", flexShrink: 0,
                }}>
                  {categoryLabels[item.category] || item.category}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div style={{
          display: "flex", gap: 12, padding: "8px 16px",
          borderTop: "1px solid var(--border-subtle)", fontSize: 10, color: "var(--text-muted)",
        }}>
          <span><kbd style={{ padding: "1px 4px", background: "var(--bg-tertiary)", borderRadius: 3, fontSize: 9 }}>↑↓</kbd> Navigate</span>
          <span><kbd style={{ padding: "1px 4px", background: "var(--bg-tertiary)", borderRadius: 3, fontSize: 9 }}>Enter</kbd> Select</span>
          <span><kbd style={{ padding: "1px 4px", background: "var(--bg-tertiary)", borderRadius: 3, fontSize: 9 }}>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
