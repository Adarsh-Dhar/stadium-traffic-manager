import { pushEvent } from "./dynatrace.js";
import type { Alert } from "./types.js";

let alerts: Alert[] = [];

function generateAlertId() {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addAlert(severity: Alert["severity"], title: string, message: string, aiAction: string | null = null): void {
  alerts.unshift({ id: generateAlertId(), severity, title, message, timestamp: Date.now(), resolved: false, aiAction });
  if (alerts.length > 50) alerts = alerts.slice(0, 50);
  if (severity === "critical" || severity === "warning") {
    pushEvent(title, message, severity === "critical" ? "CUSTOM_ALERT" : "INFO").catch(() => {});
  }
}

export function resolveAlerts(severity?: Alert["severity"]): void {
  alerts = alerts.map((a) => (!a.resolved && (!severity || a.severity === severity)) ? { ...a, resolved: true } : a);
}

export function getAlerts(): Alert[] {
  return [...alerts];
}

export function resetAlerts(): void {
  alerts = [];
}
