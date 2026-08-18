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

test("rejects incomplete authentication", () => {
  assert.throws(
    () => readConfig({ WEKAN_BASE_URL: "http://localhost:3000", WEKAN_USERNAME: "agent" }),
    /WEKAN_API_TOKEN/,
  );
});
