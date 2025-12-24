/**
 * Tests for moderation tools with mocked Discord.js client.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ChannelType } from "discord.js";
import { z } from "zod";
import type { DiscordClientManager } from "../../src/discord/client.js";
import { createRegistryAdapter } from "../../src/registry/tool-adapter.js";
import { ToolRegistry } from "../../src/registry/tool-registry.js";

function createMockMessage(overrides = {}) {
  return {
    id: "msg-123",
    content: "Test message",
    author: { id: "user-123", bot: false },
    createdTimestamp: Date.now(),
    ...overrides,
  };
}

function createMockChannel(overrides = {}) {
  const recentMessages = new Map([
    ["1", createMockMessage({ id: "1", createdTimestamp: Date.now() })],
    ["2", createMockMessage({ id: "2", createdTimestamp: Date.now() - 1000 })],
    ["3", createMockMessage({ id: "3", createdTimestamp: Date.now() - 2000 })],
  ]);

  return {
    id: "channel-123",
    type: ChannelType.GuildText,
    guild: { id: "guild-123" },
    isTextBased: () => true,
    messages: {
      fetch: mock(() => Promise.resolve(recentMessages)),
    },
    bulkDelete: mock((messages: Map<string, unknown>) => Promise.resolve(messages)),
    ...overrides,
  };
}

function createMockClient(channel = createMockChannel()) {
  return {
    user: { id: "bot-123" },
    channels: {
      fetch: mock(() => Promise.resolve(channel)),
    },
  };
}

function createMockDiscordManager(client = createMockClient()): DiscordClientManager {
  return {
    getClient: () => client,
  } as unknown as DiscordClientManager;
}

describe("Moderation Tools", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("bulk_delete_messages", () => {
    it("should delete messages from a channel", async () => {
      const mockChannel = createMockChannel();
      const mockClient = createMockClient(mockChannel);
      const mockManager = createMockDiscordManager(mockClient);

      const adapter = createRegistryAdapter(registry, "moderation");

      adapter.registerTool(
        "bulk_delete_messages",
        {
          title: "Bulk Delete Messages",
          description: "Delete multiple messages",
          inputSchema: {
            channelId: z.string(),
            limit: z.number().min(1).max(100).default(10),
          },
          outputSchema: {
            success: z.boolean(),
            deletedCount: z.number().optional(),
            error: z.string().optional(),
          },
        },
        async ({ channelId, limit }) => {
          const client = mockManager.getClient();
          const channel = await client.channels.fetch(channelId);

          if (!channel || !("bulkDelete" in channel)) {
            return {
              content: [{ type: "text" as const, text: "Channel not found" }],
              structuredContent: { success: false, error: "Channel not found" },
              isError: true,
            };
          }

          const messages = await (channel as any).messages.fetch({ limit });
          const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
          const deletable = Array.from(messages.values()).filter(
            (m: any) => m.createdTimestamp > twoWeeksAgo,
          );

          if (deletable.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No messages to delete" }],
              structuredContent: { success: false, error: "No messages found" },
              isError: true,
            };
          }

          const deleted = await (channel as any).bulkDelete(
            new Map(deletable.map((m: any) => [m.id, m])),
          );

          return {
            content: [{ type: "text" as const, text: `Deleted ${deleted.size} messages` }],
            structuredContent: { success: true, deletedCount: deleted.size },
          };
        },
      );

      const handler = registry.getHandler("bulk_delete_messages");
      const result = await handler?.({ channelId: "channel-123", limit: 10 });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.deletedCount).toBe(3);
    });

    it("should filter out old messages (>14 days)", async () => {
      const oldTimestamp = Date.now() - 15 * 24 * 60 * 60 * 1000; // 15 days ago
      const oldMessages = new Map([
        ["1", createMockMessage({ id: "1", createdTimestamp: oldTimestamp })],
        ["2", createMockMessage({ id: "2", createdTimestamp: oldTimestamp })],
      ]);

      const mockChannel = createMockChannel({
        messages: { fetch: mock(() => Promise.resolve(oldMessages)) },
      });
      const mockClient = createMockClient(mockChannel);
      const mockManager = createMockDiscordManager(mockClient);

      const adapter = createRegistryAdapter(registry, "moderation");

      adapter.registerTool(
        "bulk_delete_messages",
        {
          title: "Bulk Delete",
          description: "Delete messages",
          inputSchema: {
            channelId: z.string(),
            limit: z.number().default(10),
          },
          outputSchema: {
            success: z.boolean(),
            error: z.string().optional(),
          },
        },
        async ({ channelId, limit }) => {
          const client = mockManager.getClient();
          const channel = await client.channels.fetch(channelId);

          if (!channel || !("messages" in channel)) {
            return {
              content: [{ type: "text" as const, text: "Error" }],
              structuredContent: { success: false, error: "Channel not found" },
              isError: true,
            };
          }

          const messages = await (channel as any).messages.fetch({ limit });
          const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
          const deletable = Array.from(messages.values()).filter(
            (m: any) => m.createdTimestamp > twoWeeksAgo,
          );

          if (deletable.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No messages to delete" }],
              structuredContent: { success: false, error: "All messages are too old (>14 days)" },
              isError: true,
            };
          }

          return {
            content: [{ type: "text" as const, text: "Deleted" }],
            structuredContent: { success: true },
          };
        },
      );

      const handler = registry.getHandler("bulk_delete_messages");
      const result = await handler?.({ channelId: "channel-123", limit: 10 });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("too old");
    });

    it("should filter by user ID when specified", async () => {
      const mixedMessages = new Map([
        ["1", createMockMessage({ id: "1", author: { id: "user-1", bot: false } })],
        ["2", createMockMessage({ id: "2", author: { id: "user-2", bot: false } })],
        ["3", createMockMessage({ id: "3", author: { id: "user-1", bot: false } })],
      ]);

      const mockChannel = createMockChannel({
        messages: { fetch: mock(() => Promise.resolve(mixedMessages)) },
        bulkDelete: mock((msgs: Map<string, unknown>) => Promise.resolve(msgs)),
      });
      const mockClient = createMockClient(mockChannel);
      const mockManager = createMockDiscordManager(mockClient);

      const adapter = createRegistryAdapter(registry, "moderation");

      adapter.registerTool(
        "bulk_delete_messages",
        {
          title: "Bulk Delete",
          description: "Delete messages",
          inputSchema: {
            channelId: z.string(),
            limit: z.number().default(10),
            filterUserId: z.string().optional(),
          },
          outputSchema: {
            success: z.boolean(),
            deletedCount: z.number().optional(),
          },
        },
        async ({ channelId, limit, filterUserId }) => {
          const client = mockManager.getClient();
          const channel = await client.channels.fetch(channelId);

          if (!channel || !("bulkDelete" in channel)) {
            return {
              content: [{ type: "text" as const, text: "Error" }],
              structuredContent: { success: false },
              isError: true,
            };
          }

          const messages = await (channel as any).messages.fetch({ limit });
          let deletable = Array.from(messages.values());

          if (filterUserId) {
            deletable = deletable.filter((m: any) => m.author.id === filterUserId);
          }

          const deleted = await (channel as any).bulkDelete(
            new Map(deletable.map((m: any) => [m.id, m])),
          );

          return {
            content: [{ type: "text" as const, text: `Deleted ${deleted.size}` }],
            structuredContent: { success: true, deletedCount: deleted.size },
          };
        },
      );

      const handler = registry.getHandler("bulk_delete_messages");
      const result = await handler?.({
        channelId: "channel-123",
        limit: 10,
        filterUserId: "user-1",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.deletedCount).toBe(2); // Only user-1's messages
    });
  });
});
