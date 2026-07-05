type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, msg: string, extra?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  const sink = level === "error" || level === "warn" ? console.error : console.log;
  sink(JSON.stringify(line));
}

export const logger = {
  debug: (m: string, e?: Record<string, unknown>) => log("debug", m, e),
  info: (m: string, e?: Record<string, unknown>) => log("info", m, e),
  warn: (m: string, e?: Record<string, unknown>) => log("warn", m, e),
  error: (m: string, e?: Record<string, unknown>) => log("error", m, e),
};
