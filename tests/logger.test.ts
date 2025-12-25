import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Logger } from "../src/utils/logger.js";

describe("Logger", () => {
  let logger: Logger;
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  describe("log levels", () => {
    beforeEach(() => {
      logger = new Logger("debug", "pretty");
      consoleSpy.mockClear();
    });

    it("should log debug when level is debug", () => {
      logger.debug("test message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log info when level is info or lower", () => {
      logger.info("test message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log warn when level is warn or lower", () => {
      logger.warn("test message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log error when level is error or lower", () => {
      logger.error("test message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should not log debug when level is info", () => {
      logger = new Logger("info", "pretty");
      consoleSpy.mockClear();
      logger.debug("test message");
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("log formats", () => {
    it("should log in json format", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("info", "json");
      logger.info("test message", { key: "value" });

      const calledWith = spy.mock.calls[0][0];
      expect(typeof calledWith).toBe("string");
      const parsed = JSON.parse(calledWith);
      expect(parsed).toMatchObject({
        level: "info",
        message: "test message",
        key: "value",
      });
      spy.mockRestore();
    });

    it("should log in pretty format", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("info", "pretty");
      logger.info("test message", { key: "value" });

      const calledWith = spy.mock.calls[0][0];
      expect(typeof calledWith).toBe("string");
      expect(calledWith).toContain("INFO:");
      expect(calledWith).toContain("test message");
      expect(calledWith).toContain('{"key":"value"}');
      spy.mockRestore();
    });
  });

  describe("metadata", () => {
    it("should include metadata in log entry", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("info", "json");
      logger.info("test message", { userId: "123", action: "login" });

      const calledWith = spy.mock.calls[0][0];
      const parsed = JSON.parse(calledWith);
      expect(parsed).toMatchObject({
        level: "info",
        message: "test message",
        userId: "123",
        action: "login",
      });
      spy.mockRestore();
    });

    it("should handle circular references", () => {
      const circular: any = { name: "test" };
      circular.self = circular;

      expect(() => {
        logger.info("circular test", circular);
      }).toThrow();
    });
  });
});
