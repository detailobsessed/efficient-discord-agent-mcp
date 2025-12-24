/**
 * Tests for messaging tools with mocked Discord.js client.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ChannelType } from "discord.js";
import { z } from "zod";
import type { DiscordClientManager } from "../../src/discord/client.js";
import { createRegistryAdapter } from "../../src/registry/tool-adapter.js";
import { ToolRegistry } from "../../src/registry/tool-registry.js";
import { Logger } from "../../src/utils/logger.js";

// Mock Discord.js objects
function createMockMessage(overrides = {}) {
  return {
    id: "msg-123",
    content: "Test message",
    author: {
      id: "user-123",
      username: "testuser",
      discriminator: "0001",
      bot: false,
      avatar: null,
    },
    createdAt: new Date(),
    editedAt: null,
    attachments: new Map(),
    embeds: [],
    reactions: { cache: new Map() },
    pin: mock(() => Promise.resolve()),
    unpin: mock(() => Promise.resolve()),
    reply: mock(() => Promise.resolve(createMockMessage())),
    ...overrides,
  };
}

function createMockChannel(overrides = {}) {
  const messages = new Map([["msg-123", createMockMessage()]]);
  return {
    id: "channel-123",
    name: "test-channel",
    type: ChannelType.GuildText,
    guild: {
      id: "guild-123",
      name: "Test Guild",
      members: {
        fetch: mock(() => Promise.resolve({ permissions: { has: () => true } })),
        fetchMe: mock(() => Promise.resolve({ permissions: { has: () => true } })),
      },
    },
    isTextBased: () => true,
    permissionsFor: () => ({
      has: (_perm: bigint) => true,
    }),
    send: mock(() => Promise.resolve(createMockMessage())),
    messages: {
      fetch: mock((opts: { limit?: number } | string) => {
        if (typeof opts === "string") {
          return Promise.resolve(messages.get(opts) || null);
        }
        return Promise.resolve(messages);
      }),
    },
    ...overrides,
  };
}

function createMockClient(overrides = {}) {
  const channel = createMockChannel();
  return {
    user: { id: "bot-123" },
    channels: {
      fetch: mock(() => Promise.resolve(channel)),
    },
    guilds: {
      fetch: mock(() => Promise.resolve(channel.guild)),
    },
    ...overrides,
  };
}

function createMockDiscordManager(client = createMockClient()): DiscordClientManager {
  return {
    getClient: () => client,
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    isConnected: () => true,
  } as unknown as DiscordClientManager;
}

describe("Messaging Tools", () => {
  let registry: ToolRegistry;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockManager: DiscordClientManager;
  let _logger: Logger;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockClient = createMockClient();
    mockManager = createMockDiscordManager(mockClient);
    _logger = new Logger("error", "json"); // Suppress logs in tests
  });

  describe("send_message", () => {
    it("should send a message to a channel", async () => {
      const adapter = createRegistryAdapter(registry, "messaging");

      // Register a simplified send_message tool for testing
      adapter.registerTool(
        "send_message",
        {
          title: "Send Message",
          description: "Send a message to a channel",
          inputSchema: {
            channelId: z.string(),
            content: z.string().max(2000),
          },
          outputSchema: {
            success: z.boolean(),
            messageId: z.string().optional(),
          },
        },
        async ({ channelId, content }) => {
          const client = mockManager.getClient();
          const channel = await client.channels.fetch(channelId);

          if (!channel || !("send" in channel)) {
            throw new Error("Channel not found");
          }

          const message = await (channel as any).send({ content });

          return {
            content: [{ type: "text" as const, text: `Message sent: ${message.id}` }],
            structuredContent: { success: true, messageId: message.id },
          };
        },
      );

      const handler = registry.getHandler("send_message");
      expect(handler).toBeDefined();

      const result = await handler?.({ channelId: "channel-123", content: "Hello!" });

      expect(result.structuredContent).toEqual({
        success: true,
        messageId: "msg-123",
      });
    });

    it("should handle channel not found error", async () => {
      const failingClient = createMockClient({
        channels: {
          fetch: mock(() => Promise.resolve(null)),
        },
      });
      const failingManager = createMockDiscordManager(failingClient);

      const adapter = createRegistryAdapter(registry, "messaging");

      adapter.registerTool(
        "send_message",
        {
          title: "Send Message",
          description: "Send a message",
          inputSchema: {
            channelId: z.string(),
            content: z.string(),
          },
          outputSchema: {
            success: z.boolean(),
            error: z.string().optional(),
          },
        },
        async ({ channelId, content }) => {
          const client = failingManager.getClient();
          const channel = await client.channels.fetch(channelId);

          if (!channel) {
            return {
              content: [{ type: "text" as const, text: "Channel not found" }],
              structuredContent: { success: false, error: "Channel not found" },
              isError: true,
            };
          }

          return {
            content: [{ type: "text" as const, text: "Sent" }],
            structuredContent: { success: true },
          };
        },
      );

      const handler = registry.getHandler("send_message");
      const result = await handler?.({ channelId: "invalid", content: "test" });

      expect(result.structuredContent).toEqual({
        success: false,
        error: "Channel not found",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("pin_message", () => {
    it("should pin a message", async () => {
      const adapter = createRegistryAdapter(registry, "messaging");

      adapter.registerTool(
        "pin_message",
        {
          title: "Pin Message",
          description: "Pin a message in a channel",
          inputSchema: {
            channelId: z.string(),
            messageId: z.string(),
          },
          outputSchema: {
            success: z.boolean(),
          },
        },
        async ({ channelId, messageId }) => {
          const client = mockManager.getClient();
          const channel = await client.channels.fetch(channelId);

          if (!channel || !("messages" in channel)) {
            throw new Error("Channel not found");
          }

          const message = await (channel as any).messages.fetch(messageId);
          if (!message) {
            throw new Error("Message not found");
          }

          await message.pin();

          return {
            content: [{ type: "text" as const, text: "Message pinned" }],
            structuredContent: { success: true },
          };
        },
      );

      const handler = registry.getHandler("pin_message");
      const result = await handler?.({ channelId: "channel-123", messageId: "msg-123" });

      expect(result.structuredContent).toEqual({ success: true });
    });
  });

  describe("search_messages", () => {
    it("should search messages in a channel", async () => {
      const mockMessages = new Map([
        ["1", createMockMessage({ id: "1", content: "Hello world" })],
        ["2", createMockMessage({ id: "2", content: "Goodbye world" })],
        ["3", createMockMessage({ id: "3", content: "Test message" })],
      ]);

      const searchClient = createMockClient({
        channels: {
          fetch: mock(() =>
            Promise.resolve(
              createMockChannel({
                messages: {
                  fetch: mock(() => Promise.resolve(mockMessages)),
                },
              }),
            ),
          ),
        },
      });
      const searchManager = createMockDiscordManager(searchClient);

      const adapter = createRegistryAdapter(registry, "messaging");

      adapter.registerTool(
        "search_messages",
        {
          title: "Search Messages",
          description: "Search messages in a channel",
          inputSchema: {
            channelId: z.string(),
            query: z.string(),
            limit: z.number().default(50),
          },
          outputSchema: {
            success: z.boolean(),
            messages: z.array(z.object({ id: z.string(), content: z.string() })),
            count: z.number(),
          },
        },
        async ({ channelId, query, limit }) => {
          const client = searchManager.getClient();
          const channel = await client.channels.fetch(channelId);

          if (!channel || !("messages" in channel)) {
            throw new Error("Channel not found");
          }

          const messages = await (channel as any).messages.fetch({ limit });
          const filtered = Array.from(messages.values())
            .filter((m: any) => m.content.toLowerCase().includes(query.toLowerCase()))
            .map((m: any) => ({ id: m.id, content: m.content }));

          return {
            content: [{ type: "text" as const, text: `Found ${filtered.length} messages` }],
            structuredContent: { success: true, messages: filtered, count: filtered.length },
          };
        },
      );

      const handler = registry.getHandler("search_messages");
      const result = await handler?.({ channelId: "channel-123", query: "world", limit: 50 });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.count).toBe(2);
      expect(result.structuredContent.messages).toHaveLength(2);
    });
  });
});
