import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { loadConfig } from "../src/server/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("required fields", () => {
    it("should throw error when DISCORD_TOKEN is missing", () => {
      delete process.env.DISCORD_TOKEN;
      expect(() => loadConfig()).toThrow("DISCORD_TOKEN environment variable is required");
    });

    it("should accept DISCORD_TOKEN", () => {
      process.env.DISCORD_TOKEN = "test-token";
      const config = loadConfig();
      expect(config.discordToken).toBe("test-token");
    });
  });

  describe("server identity", () => {
    beforeEach(() => {
      process.env.DISCORD_TOKEN = "test-token";
    });

    it("should have correct server name", () => {
      const config = loadConfig();
      expect(config.serverName).toBe("discord-mcp-server");
    });

    it("should have a version", () => {
      const config = loadConfig();
      expect(config.serverVersion).toBe("2.0.0");
    });
  });

  describe("transport mode", () => {
    beforeEach(() => {
      process.env.DISCORD_TOKEN = "test-token";
    });

    it("should default to http", () => {
      delete process.env.TRANSPORT_MODE;
      const config = loadConfig();
      expect(config.transportMode).toBe("http");
    });

    it("should use http when TRANSPORT_MODE=http", () => {
      process.env.TRANSPORT_MODE = "http";
      const config = loadConfig();
      expect(config.transportMode).toBe("http");
    });

    it("should default to port 3000", () => {
      delete process.env.HTTP_PORT;
      const config = loadConfig();
      expect(config.httpPort).toBe(3000);
    });

    it("should use custom HTTP_PORT", () => {
      process.env.HTTP_PORT = "8080";
      const config = loadConfig();
      expect(config.httpPort).toBe(8080);
    });
  });

  describe("logging", () => {
    beforeEach(() => {
      process.env.DISCORD_TOKEN = "test-token";
    });

    it("should default to info log level", () => {
      delete process.env.LOG_LEVEL;
      const config = loadConfig();
      expect(config.logLevel).toBe("info");
    });

    it("should accept debug log level", () => {
      process.env.LOG_LEVEL = "debug";
      const config = loadConfig();
      expect(config.logLevel).toBe("debug");
    });

    it("should default to json format", () => {
      delete process.env.LOG_FORMAT;
      const config = loadConfig();
      expect(config.logFormat).toBe("json");
    });

    it("should accept pretty format", () => {
      process.env.LOG_FORMAT = "pretty";
      const config = loadConfig();
      expect(config.logFormat).toBe("pretty");
    });
  });

  describe("discord client", () => {
    beforeEach(() => {
      process.env.DISCORD_TOKEN = "test-token";
    });

    it("should default to 5 reconnect retries", () => {
      delete process.env.RECONNECT_MAX_RETRIES;
      const config = loadConfig();
      expect(config.reconnectMaxRetries).toBe(5);
    });

    it("should accept custom reconnect retries", () => {
      process.env.RECONNECT_MAX_RETRIES = "10";
      const config = loadConfig();
      expect(config.reconnectMaxRetries).toBe(10);
    });

    it("should default to 1000ms backoff", () => {
      delete process.env.RECONNECT_BACKOFF_MS;
      const config = loadConfig();
      expect(config.reconnectBackoffMs).toBe(1000);
    });

    it("should accept custom backoff", () => {
      process.env.RECONNECT_BACKOFF_MS = "2000";
      const config = loadConfig();
      expect(config.reconnectBackoffMs).toBe(2000);
    });
  });
});
