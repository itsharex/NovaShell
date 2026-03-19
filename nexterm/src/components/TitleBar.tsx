import { useState, useRef, useEffect } from "react";
import { Minus, Square, X, Terminal, Maximize2, PanelRight, Focus, Shield, Palette } from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { ThemeName, CustomThemeColors } from "../store/appStore";
import { useT } from "../i18n";

const themes: { name: ThemeName; label: string }[] = [
  { name: "dark", label: "Dark" },
  { name: "light", label: "Light" },
  { name: "cyberpunk", label: "Cyber" },
  { name: "retro", label: "Retro" },
];

const customColorLabels: { key: keyof CustomThemeColors; label: string }[] = [
  { key: "bgPrimary", label: "Background" },
  { key: "bgSecondary", label: "Surface" },
  { key: "textPrimary", label: "Text" },
  { key: "accentPrimary", label: "Accent" },
  { key: "accentSecondary", label: "Secondary" },
  { key: "terminalBg", label: "Terminal BG" },
  { key: "terminalFg", label: "Terminal Text" },
  { key: "terminalCursor", label: "Cursor" },
];

export function TitleBar() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const customTheme = useAppStore((s) => s.customTheme);
  const setCustomThemeColor = useAppStore.getState().setCustomThemeColor;
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const hackingMode = useAppStore((s) => s.hackingMode);
  const toggleHackingMode = useAppStore((s) => s.toggleHackingMode);
  const t = useT();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on click outside
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  };

  const handleClose = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  };

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-logo">
          <Terminal size={18} />
          <span>NovaShell</span>
        </div>
        <div className="theme-selector">
          {themes.map((th) => (
            <button
              key={th.name}
              className={`theme-dot ${th.name} ${theme === th.name ? "active" : ""}`}
              onClick={() => setTheme(th.name)}
              title={th.label}
            />
          ))}
          {/* Custom theme dot with color picker */}
          <div style={{ position: "relative" }} ref={pickerRef}>
            <button
              className={`theme-dot custom ${theme === "custom" ? "active" : ""}`}
              onClick={() => {
                if (theme !== "custom") setTheme("custom" as ThemeName);
                setPickerOpen(!pickerOpen);
              }}
              title="Custom"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Palette size={8} style={{ color: "#fff", filter: "drop-shadow(0 0 1px #000)" }} />
            </button>
            {pickerOpen && (
              <div style={{
                position: "absolute", top: 24, left: 0, zIndex: 9999,
                background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)", padding: 10, width: 200,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                  Customize Theme
                </div>
                {customColorLabels.map(({ key, label }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <input
                      type="color"
                      value={customTheme[key]}
                      onInput={(e) => setCustomThemeColor(key, (e.target as HTMLInputElement).value)}
                      style={{ width: 22, height: 18, padding: 0, border: "1px solid var(--border-subtle)", borderRadius: 3, cursor: "pointer", background: "none" }}
                    />
                    <span style={{ fontSize: 10, color: "var(--text-secondary)", flex: 1 }}>{label}</span>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>{customTheme[key]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="titlebar-center">{t("titlebar.professionalTerminal")}</div>
      <div className="titlebar-right">
        <button
          className="titlebar-btn"
          onClick={toggleHackingMode}
          title={hackingMode ? t("titlebar.disableHacking") : t("titlebar.enableHacking")}
          style={hackingMode ? {
            color: "#00ff41",
            filter: "drop-shadow(0 0 4px rgba(0,255,65,0.6))",
          } : undefined}
        >
          <Shield size={14} />
        </button>
        <button className="titlebar-btn" onClick={toggleFocusMode} title={t("titlebar.focusMode")}>
          <Focus size={14} />
        </button>
        <button className="titlebar-btn" onClick={toggleSidebar} title={t("titlebar.toggleSidebar")}>
          <PanelRight size={14} />
        </button>
        <button className="titlebar-btn" onClick={handleMinimize}>
          <Minus size={14} />
        </button>
        <button className="titlebar-btn" onClick={handleMaximize}>
          <Maximize2 size={14} />
        </button>
        <button className="titlebar-btn close" onClick={handleClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}