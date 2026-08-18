import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
loadEnv({ path: envPath, quiet: true });

function readLegacyLocalEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trimStart().startsWith("#") && line.includes("="))
        .map((line) => {
          const separator = line.indexOf("=");
          const key = line.slice(0, separator).trim();
          const raw = line.slice(separator + 1).trim();
          const value = raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
            ? raw.slice(1, -1)
            : raw;
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}

const localEnv = readLegacyLocalEnv();

export interface WekanConfig {
  baseUrl: string;
  token: string | undefined;
  username: string | undefined;
  password: string | undefined;
  timeoutMs: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): WekanConfig {
  const value = (key: string): string | undefined => env === process.env ? localEnv[key] ?? env[key] : env[key];
  const baseUrl = value("WEKAN_BASE_URL")?.replace(/\/$/, "") ?? "";
  const token = value("WEKAN_API_TOKEN") || undefined;
  const username = value("WEKAN_USERNAME") || undefined;
  const password = value("WEKAN_PASSWORD") || undefined;
  const timeoutMs = Number(value("WEKAN_REQUEST_TIMEOUT_MS") ?? 15_000);

  if (!baseUrl) {
    throw new Error("WEKAN_BASE_URL is required");
  }
  if (!token && !(username && password)) {
    throw new Error("Set WEKAN_API_TOKEN or both WEKAN_USERNAME and WEKAN_PASSWORD");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("WEKAN_REQUEST_TIMEOUT_MS must be a positive number");
  }

  return { baseUrl, token, username, password, timeoutMs };
}
