import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
// dotenv only fills values that are not already present in process.env. This
// keeps explicit MCP-client environment variables authoritative over .env.
loadEnv({ path: envPath, quiet: true });

export interface WekanConfig {
  baseUrl: string;
  token: string | undefined;
  username: string | undefined;
  password: string | undefined;
  timeoutMs: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): WekanConfig {
  const value = (key: string): string | undefined => env[key];
  const rawBaseUrl = value("WEKAN_BASE_URL")?.trim() ?? "";
  const token = value("WEKAN_API_TOKEN") || undefined;
  const username = value("WEKAN_USERNAME") || undefined;
  const password = value("WEKAN_PASSWORD") || undefined;
  const timeoutMs = Number(value("WEKAN_REQUEST_TIMEOUT_MS") ?? 15_000);

  if (!rawBaseUrl) {
    throw new Error("WEKAN_BASE_URL is required");
  }
  let baseUrl: string;
  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    baseUrl = rawBaseUrl.replace(/\/+$/, "");
  } catch {
    throw new Error("WEKAN_BASE_URL must be a valid HTTP(S) URL");
  }
  if (!token && !(username && password)) {
    throw new Error("Set WEKAN_API_TOKEN or both WEKAN_USERNAME and WEKAN_PASSWORD");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("WEKAN_REQUEST_TIMEOUT_MS must be a positive integer");
  }

  return { baseUrl, token, username, password, timeoutMs };
}
