import { useEffect, useState } from "react";
import { AlertTriangle, Shield, Info, X } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import type { HackingAlert } from "../../store/appStore";

export function AlertToast() {
  const alerts = useAppStore((s) => s.hackingAlerts);
  const dismissHackingAlert = useAppStore((s) => s.dismissHackingAlert);
  const [visibleAlerts, setVisibleAlerts] = useState<HackingAlert[]>([]);

  // Show latest 3 alerts that are less than 8 seconds old
  useEffect(() => {
    const recent = alerts
      .filter((a) => Date.now() - a.timestamp < 8000)
      .slice(0, 3);
    setVisibleAlerts(recent);

    if (recent.length > 0) {
      const timer = setTimeout(() => {
        setVisibleAlerts((prev) => prev.filter((a) => Date.now() - a.timestamp < 8000));
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [alerts]);

  if (visibleAlerts.length === 0) return null;

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <AlertTriangle size={14} />;
      case "warning": return <Shield size={14} />;
      default: return <Info size={14} />;
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "#ff0040";
      case "warning": return "#ffaf00";
      default: return "#00d4ff";
    }
  };

  return (
    <div style={{
      position: "fixed",
      bottom: 40,
      right: 12,
      zIndex: 300,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      maxWidth: 320,
    }}>
      {visibleAlerts.map((alert) => (
        <div
          key={alert.id}
          className="hacking-alert-toast"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 12px",
            background: "rgba(5, 5, 16, 0.95)",
            border: `1px solid ${severityColor(alert.severity)}`,
            borderRadius: 8,
            boxShadow: `0 4px 20px ${severityColor(alert.severity)}33`,
            backdropFilter: "blur(8px)",
          }}
        >
          <span style={{ color: severityColor(alert.severity), flexShrink: 0, marginTop: 1 }}>
            {severityIcon(alert.severity)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: severityColor(alert.severity),
              marginBottom: 2,
            }}>
              {alert.title}
            </div>
            <div style={{
              fontSize: 10,
              color: "#b0ffb0",
              opacity: 0.8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {alert.details}
            </div>
          </div>
          <button
            onClick={() => dismissHackingAlert(alert.id)}
            style={{
              background: "none",
              border: "none",
              color: "#336633",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
