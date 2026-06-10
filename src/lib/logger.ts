type LogMeta = Record<string, unknown>;

function write(level: "INFO" | "WARN" | "ERROR", message: string, meta?: LogMeta) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${new Date().toISOString()}] [${level}] ${message}${payload}`);
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    write("INFO", message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    write("WARN", message, meta);
  },
  error(message: string, meta?: LogMeta) {
    write("ERROR", message, meta);
  },
};
