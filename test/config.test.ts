import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../src/config.js";

test("accepts username and password authentication", () => {
  const config = readConfig({
    WEKAN_BASE_URL: "http://localhost:3000/",
    WEKAN_USERNAME: "agent",
    WEKAN_PASSWORD: "secret",
  });
  assert.equal(config.baseUrl, "http://localhost:3000");
  assert.equal(config.timeoutMs, 15_000);
});

test("accepts an API token and trims the base URL", () => {
  const config = readConfig({
    WEKAN_BASE_URL: " https://wekan.example.test/// ",
    WEKAN_API_TOKEN: "token",
  });
  assert.equal(config.baseUrl, "https://wekan.example.test");
  assert.equal(config.token, "token");
  assert.equal(config.username, undefined);
});

test("rejects incomplete authentication", () => {
  assert.throws(
    () => readConfig({ WEKAN_BASE_URL: "http://localhost:3000", WEKAN_USERNAME: "agent" }),
    /WEKAN_API_TOKEN/,
  );
});

test("rejects invalid base URLs", () => {
  assert.throws(
    () => readConfig({ WEKAN_BASE_URL: "ftp://wekan.example.test", WEKAN_API_TOKEN: "token" }),
    /valid HTTP\(S\) URL/,
  );
});

test("rejects non-positive and fractional timeouts", () => {
  for (const timeout of ["0", "-1", "1.5", "not-a-number"]) {
    assert.throws(
      () => readConfig({ WEKAN_BASE_URL: "http://localhost:3000", WEKAN_API_TOKEN: "token", WEKAN_REQUEST_TIMEOUT_MS: timeout }),
      /positive integer/,
    );
  }
});

test("explicit process environment overrides values loaded from .env", () => {
  const keys = ["WEKAN_BASE_URL", "WEKAN_API_TOKEN", "WEKAN_USERNAME", "WEKAN_PASSWORD"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.WEKAN_BASE_URL = "https://environment.example.test";
    process.env.WEKAN_API_TOKEN = "environment-token";
    delete process.env.WEKAN_USERNAME;
    delete process.env.WEKAN_PASSWORD;
    const config = readConfig();
    assert.equal(config.baseUrl, "https://environment.example.test");
    assert.equal(config.token, "environment-token");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
