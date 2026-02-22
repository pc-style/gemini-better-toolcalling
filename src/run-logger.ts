import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface FileLogger {
  path: string;
  log: (line: string) => void;
}

export function createFileLogger(prefix: "cli" | "tui"): FileLogger {
  const logsDir = join(process.cwd(), "logs");
  mkdirSync(logsDir, { recursive: true });

  const path = join(logsDir, `${prefix}-${timestamp()}.log`);
  appendFileSync(path, `[meta] createdAt=${new Date().toISOString()}\n`, "utf8");

  return {
    path,
    log(line: string) {
      appendFileSync(path, `${line}\n`, "utf8");
    },
  };
}

function timestamp(): string {
  const now = new Date();
  const parts = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "-",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
    "-",
    String(now.getUTCMilliseconds()).padStart(3, "0"),
    "-",
    String(process.pid),
  ];
  return parts.join("");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
