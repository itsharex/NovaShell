import { useState } from "react";
import {
  Shield,
  Radar,
  Zap,
  Brain,
  AlertTriangle,
  Clock,
  Power,
  Wrench,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useT } from "../i18n";
import { ReconView } from "./hacking/ReconView";
import { ExploitView } from "./hacking/ExploitView";
import { AiSecView } from "./hacking/AiSecView";
import { AlertsView } from "./hacking/AlertsView";
import { HistoryView } from "./hacking/HistoryView";
import { ToolsView } from "./hacking/ToolsView";

type HackingSubTab = "recon" | "exploit" | "tools" | "ai" | "alerts" | "history";

const subTabDefs: { id: HackingSubTab; icon: typeof Radar; labelKey: string }[] = [
  { id: "recon", icon: Radar, labelKey: "hacking.recon" },
  { id: "exploit", icon: Zap, labelKey: "hacking.exploit" },
  { id: "tools", icon: Wrench, labelKey: "hacking.tools" },
  { id: "ai", icon: Brain, labelKey: "hacking.aiSec" },
  { id: "alerts", icon: AlertTriangle, labelKey: "hacking.alerts" },
  { id: "history", icon: Clock, labelKey: "hacking.historyTab" },
];

export function HackingPanel() {
  const t = useT();
  const hackingMode = useAppStore((s) => s.hackingMode);
  const toggleHackingMode = useAppStore((s) => s.toggleHackingMode);
  const alertCount = useAppStore((s) => s.hackingAlerts.length);
  const [activeSubTab, setActiveSubTab] = useState<HackingSubTab>("recon");

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      gap: 0,
    }}>
      {/* Panel Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 16px 8px",
        flexShrink: 0,
      }}>
        <Shield size={16} style={{
          color: hackingMode ? "#00ff41" : "var(--text-muted)",
          filter: hackingMode ? "drop-shadow(0 0 4px rgba(0,255,65,0.5))" : "none",
        }} />
        <span style={{
          fontSize: 14,
          fontWeight: 700,
          color: hackingMode ? "#00ff41" : "var(--text-primary)",
          flex: 1,
        }}>
          {t("hacking.title")}
        </span>
        <button
          onClick={toggleHackingMode}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 12,
            border: "1px solid",
            borderColor: hackingMode ? "#00ff41" : "var(--border-subtle)",
            background: hackingMode ? "rgba(0,255,65,0.1)" : "var(--bg-active)",
            color: hackingMode ? "#00ff41" : "var(--text-muted)",
            cursor: "pointer",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          <Power size={10} />
          {hackingMode ? t("hacking.active") : t("hacking.off")}
        </button>
      </div>

      {!hackingMode ? (
        /* Inactive state */
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 20,
        }}>
          <Shield size={40} style={{ color: "var(--text-muted)", opacity: 0.3 }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            {t("hacking.enableHint")}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.6, textAlign: "center" }}>
            {t("hacking.enableDesc")}
          </span>
          <button
            onClick={toggleHackingMode}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              background: "linear-gradient(135deg, #00ff41, #00d4ff)",
              border: "none",
              color: "#000",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            {t("hacking.activate")}
          </button>
        </div>
      ) : (
        /* Active state */
        <>
          {/* Sub-tab navigation */}
          <div style={{
            display: "flex",
            padding: "0 16px",
            gap: 2,
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}>
            {subTabDefs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  fontSize: 10,
                  fontWeight: activeSubTab === tab.id ? 700 : 400,
                  color: activeSubTab === tab.id ? "var(--accent-primary)" : "var(--text-muted)",
                  background: "none",
                  border: "none",
                  borderBottom: activeSubTab === tab.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <tab.icon size={11} />
                {t(tab.labelKey)}
                {tab.id === "alerts" && alertCount > 0 && (
                  <span style={{
                    background: "#ff0040",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "0 4px",
                    fontSize: 8,
                    fontWeight: 700,
                    marginLeft: 2,
                  }}>
                    {alertCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sub-tab content */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "8px 16px 12px",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }} className="hacking-log-container">
            {activeSubTab === "recon" && <ReconView />}
            {activeSubTab === "exploit" && <ExploitView />}
            {activeSubTab === "tools" && <ToolsView />}
            {activeSubTab === "ai" && <AiSecView />}
            {activeSubTab === "alerts" && <AlertsView />}
            {activeSubTab === "history" && <HistoryView />}
          </div>
        </>
      )}
    </div>
  );
}
