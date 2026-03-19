import { useEffect, useRef, useState, useCallback, memo } from "react";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { TerminalPanel } from "./components/TerminalPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { UpdateNotification } from "./components/UpdateNotification";
import { useAppStore } from "./store/appStore";
import { AlertToast } from "./components/hacking/AlertToast";
import { CommandPalette } from "./components/CommandPalette";
import { I18nProvider } from "./i18n";

const MemoizedTerminalPanel = memo(TerminalPanel);
const MemoizedTabBar = memo(TabBar);
const MemoizedStatusBar = memo(StatusBar);

const MIN_SIDEBAR_WIDTH = 260;
const DEFAULT_SIDEBAR_WIDTH = 320;

function App() {
  const theme = useAppStore((s) => s.theme);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const focusMode = useAppStore((s) => s.focusMode);
  const hackingMode = useAppStore((s) => s.hackingMode);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const sidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  sidebarWidthRef.current = sidebarWidth;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isResizing = useRef(false);

  const customTheme = useAppStore((s) => s.customTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // Apply custom theme CSS variables when custom theme is active
    if (theme === "custom") {
      const root = document.documentElement;
      root.style.setProperty("--bg-primary", customTheme.bgPrimary);
      root.style.setProperty("--bg-secondary", customTheme.bgSecondary);
      root.style.setProperty("--bg-tertiary", customTheme.bgSecondary);
      root.style.setProperty("--text-primary", customTheme.textPrimary);
      root.style.setProperty("--accent-primary", customTheme.accentPrimary);
      root.style.setProperty("--accent-secondary", customTheme.accentSecondary);
      root.style.setProperty("--terminal-bg", customTheme.terminalBg);
      root.style.setProperty("--terminal-cursor", customTheme.terminalCursor);
      root.style.setProperty("--titlebar-bg", customTheme.bgPrimary);
      root.style.setProperty("--sidebar-bg", customTheme.bgPrimary);
      root.style.setProperty("--statusbar-bg", customTheme.bgPrimary);
    } else {
      // Clear inline styles when switching away from custom
      const root = document.documentElement;
      const props = ["--bg-primary", "--bg-secondary", "--bg-tertiary", "--text-primary", "--accent-primary", "--accent-secondary", "--terminal-bg", "--terminal-cursor", "--titlebar-bg", "--sidebar-bg", "--statusbar-bg"];
      props.forEach((p) => root.style.removeProperty(p));
    }
  }, [theme, customTheme]);

  // Command Palette shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const sidebarWrapperRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;

    // Disable CSS transition during drag for instant response
    sidebarWrapperRef.current?.classList.add("sidebar-resizing");

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX - ev.clientX;
      const maxWidth = Math.floor(window.innerWidth * 0.8);
      const newWidth = Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      sidebarWrapperRef.current?.classList.remove("sidebar-resizing");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []); // stable reference — uses ref for startWidth

  return (
    <I18nProvider>
      <div className={`app-container theme-${theme} ${focusMode ? "focus-mode" : ""}`}>
        <TitleBar />
        <div className="app-body">
          <div className="main-area">
            <MemoizedTabBar />
            <MemoizedTerminalPanel />
          </div>
          <div
            ref={sidebarWrapperRef}
            className={`sidebar-wrapper ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}
            style={{ width: sidebarOpen ? sidebarWidth : 0, position: "relative" }}
          >
            {sidebarOpen && (
              <div
                className="sidebar-resize-handle"
                onMouseDown={startResize}
              />
            )}
            <div style={{ display: sidebarOpen ? "flex" : "none", width: "100%", height: "100%", flexDirection: "column" }}>
              <Sidebar />
            </div>
          </div>
        </div>
        <MemoizedStatusBar />
        <UpdateNotification />
        {hackingMode && <AlertToast />}
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      </div>
    </I18nProvider>
  );
}

export default App;
