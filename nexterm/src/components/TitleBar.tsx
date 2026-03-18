import { useState } from "react";
import { Minus, Square, X, Terminal, Maximize2, PanelRight, Focus, Shield } from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { ThemeName } from "../store/appStore";
import { useT } from "../i18n";

const themes: { name: ThemeName; label: string }[] = [
  { name: "dark", label: "Dark" },
  { name: "light", label: "Light" },
  { name: "cyberpunk", label: "Cyber" },
  { name: "retro", label: "Retro" },
];

export function TitleBar() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const hackingMode = useAppStore((s) => s.hackingMode);
  const toggleHackingMode = useAppStore((s) => s.toggleHackingMode);
  const t = useT();

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