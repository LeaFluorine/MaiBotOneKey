import type { LogEntry } from "@shared/contracts";

export function settingsLogMessage(message: string): string {
  return message
    // Remove terminal titles / hyperlinks, then colors and cursor controls.
    .replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\|\x9c)/g, "")
    .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[ -/]*[@-Z\\-_]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

export function settingsLogs(entries: LogEntry[]): LogEntry[] {
  return entries.filter((entry) => entry.source === "desktop").slice(-80).reverse();
}
