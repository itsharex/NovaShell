import { useAppStore } from "../store/appStore";

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let previousProcessCount = 0;

// Throttle: prevent duplicate alerts within 30 seconds per title
const recentAlerts = new Map<string, number>();
const ALERT_THROTTLE_MS = 30000;

function throttledAlert(title: string, severity: "info" | "warning" | "critical", details: string, category: string) {
  const now = Date.now();
  const lastSeen = recentAlerts.get(title) || 0;
  if (now - lastSeen < ALERT_THROTTLE_MS) return;
  recentAlerts.set(title, now);
  // Cleanup old entries periodically
  if (recentAlerts.size > 50) {
    for (const [key, ts] of recentAlerts) {
      if (now - ts > ALERT_THROTTLE_MS * 2) recentAlerts.delete(key);
    }
  }
  useAppStore.getState().addHackingAlert({ severity, title, details, category });
}

/**
 * Start real-time security monitoring.
 * Runs every 30 seconds when hacking mode is active.
 * Checks: CPU spikes, memory anomalies, new processes.
 */
export function startSecurityMonitor() {
  if (monitorInterval) return;

  monitorInterval = setInterval(() => {
    const state = useAppStore.getState();
    if (!state.hackingMode) {
      stopSecurityMonitor();
      return;
    }

    const stats = state.systemStats;
    if (!stats) return;

    // CPU spike detection
    if (stats.cpu > 90) {
      throttledAlert(
        "High CPU Usage",
        "warning",
        `CPU at ${stats.cpu.toFixed(1)}% — possible resource-intensive process or crypto miner`,
        "system",
      );
      state.addHackingLog({
        level: "alert",
        message: `CPU spike detected: ${stats.cpu.toFixed(1)}%`,
        source: "Monitor",
        category: "system",
      });
    }

    // Memory spike detection
    if (stats.memoryPercent > 92) {
      throttledAlert(
        "Critical Memory Usage",
        "warning",
        `Memory at ${stats.memoryPercent.toFixed(1)}% — possible memory leak or DoS`,
        "system",
      );
    }

    // Process count jump
    if (previousProcessCount > 0 && stats.processes > previousProcessCount + 50) {
      throttledAlert(
        "Process Count Spike",
        "critical",
        `Process count jumped from ${previousProcessCount} to ${stats.processes} — possible fork bomb`,
        "system",
      );
    }
    previousProcessCount = stats.processes;

  }, 30000);
}

export function stopSecurityMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  previousProcessCount = 0;
  recentAlerts.clear();
}

/**
 * Scan terminal output for security-relevant patterns.
 * Called from the debug log pipeline. Throttled to prevent flooding.
 */
export function scanForSecurityEvents(message: string): void {
  const state = useAppStore.getState();
  if (!state.hackingMode) return;

  const patterns = [
    { regex: /Permission denied/i, title: "Permission Denied", severity: "warning" as const },
    { regex: /password.*incorrect|authentication.*fail/i, title: "Auth Failure", severity: "warning" as const },
    { regex: /Connection refused/i, title: "Connection Refused", severity: "info" as const },
    { regex: /CRITICAL|EMERGENCY|FATAL/i, title: "Critical Error", severity: "critical" as const },
    { regex: /segmentation fault|core dumped|SIGSEGV/i, title: "Crash Detected", severity: "critical" as const },
    { regex: /CVE-\d{4}-\d+/i, title: "CVE Reference", severity: "warning" as const },
    { regex: /buffer overflow|heap overflow|stack smashing/i, title: "Buffer Overflow", severity: "critical" as const },
    { regex: /unauthorized|403 Forbidden/i, title: "Access Denied", severity: "warning" as const },
    { regex: /SQL syntax.*error|mysql.*error|sqlite.*error/i, title: "SQL Error (Possible SQLi)", severity: "warning" as const },
    { regex: /command injection|eval\(|exec\(/i, title: "Code Injection Risk", severity: "critical" as const },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(message)) {
      throttledAlert(pattern.title, pattern.severity, message.slice(0, 150), "terminal");
      break;
    }
  }
}
