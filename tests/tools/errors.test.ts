/**
 * Tests for error utility functions.
 */

import { describe, expect, it } from "bun:test";
import {
  ChannelNotFoundError,
  GuildNotFoundError,
  getErrorMessage,
  InvalidInputError,
  PermissionDeniedError,
} from "../../src/utils/errors.js";

describe("Error Utilities", () => {
  describe("getErrorMessage", () => {
    it("should extract message from Error objects", () => {
      const error = new Error("Something went wrong");
      expect(getErrorMessage(error)).toBe("Something went wrong");
    });

    it("should handle string errors", () => {
      expect(getErrorMessage("String error")).toBe("String error");
    });

    it("should handle objects with message property", () => {
      const error = { message: "Object error" };
      expect(getErrorMessage(error)).toBe("Object error");
    });

    it("should handle null", () => {
      expect(getErrorMessage(null)).toBe("Unknown error");
    });

    it("should handle undefined", () => {
      expect(getErrorMessage(undefined)).toBe("Unknown error");
    });

    it("should handle numbers", () => {
      expect(getErrorMessage(404)).toBe("404");
    });

    it("should handle objects without message property", () => {
      const error = { code: 500 };
      expect(getErrorMessage(error)).toBe("[object Object]");
    });
  });

  describe("ChannelNotFoundError", () => {
    it("should create error with channel ID", () => {
      const error = new ChannelNotFoundError("channel-123");
      expect(error.message).toBe("Channel not found: channel-123");
      expect(error.name).toBe("ChannelNotFoundError");
      expect(error.channelId).toBe("channel-123");
    });

    it("should be instanceof Error", () => {
      const error = new ChannelNotFoundError("channel-123");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ChannelNotFoundError).toBe(true);
    });
  });

  describe("GuildNotFoundError", () => {
    it("should create error with guild ID", () => {
      const error = new GuildNotFoundError("guild-456");
      expect(error.message).toBe("Guild not found: guild-456");
      expect(error.name).toBe("GuildNotFoundError");
      expect(error.guildId).toBe("guild-456");
    });
  });

  describe("PermissionDeniedError", () => {
    it("should create error with permission and resource", () => {
      const error = new PermissionDeniedError("ManageMessages", "channel-123");
      expect(error.message).toBe("Permission denied: ManageMessages for channel-123");
      expect(error.name).toBe("PermissionDeniedError");
      expect(error.permission).toBe("ManageMessages");
      expect(error.resource).toBe("channel-123");
    });
  });

  describe("InvalidInputError", () => {
    it("should create error with field and reason", () => {
      const error = new InvalidInputError("channelId", "must be a valid snowflake");
      expect(error.message).toBe("Invalid input for channelId: must be a valid snowflake");
      expect(error.name).toBe("InvalidInputError");
      expect(error.field).toBe("channelId");
      expect(error.reason).toBe("must be a valid snowflake");
    });
  });
});
