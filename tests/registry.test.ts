import { beforeEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRegistryAdapter } from "../src/registry/tool-adapter.js";
import { ToolRegistry } from "../src/registry/tool-registry.js";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("registerTool", () => {
    it("should register a tool and update category count", () => {
      registry.registerTool(
        "test_tool",
        "messaging",
        "Test Tool",
        "A test tool",
        { input: z.string() },
        { output: z.boolean() },
        async () => ({
          content: [{ type: "text" as const, text: "ok" }],
        }),
      );

      const categories = registry.listCategories();
      const messaging = categories.find((c) => c.name === "messaging");
      expect(messaging?.toolCount).toBe(1);
    });

    it("should make tool searchable", () => {
      registry.registerTool(
        "send_message",
        "messaging",
        "Send Message",
        "Send a message to a channel",
        { channelId: z.string(), content: z.string() },
        { success: z.boolean() },
        async () => ({
          content: [{ type: "text" as const, text: "sent" }],
        }),
      );

      const results = registry.searchTools("message");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("send_message");
    });
  });

  describe("listCategories", () => {
    it("should only return categories with tools", () => {
      registry.registerTool("test_tool", "moderation", "Test", "Test", {}, {}, async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));

      const categories = registry.listCategories();
      expect(categories.every((c) => c.toolCount > 0)).toBe(true);
    });
  });

  describe("listTools", () => {
    it("should return tools in a category", () => {
      registry.registerTool(
        "ban_member",
        "moderation",
        "Ban Member",
        "Ban a member",
        { userId: z.string() },
        { success: z.boolean() },
        async () => ({ content: [{ type: "text" as const, text: "banned" }] }),
      );

      const tools = registry.listTools("moderation");
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe("ban_member");
    });

    it("should be case-insensitive", () => {
      registry.registerTool("test", "moderation", "Test", "Test", {}, {}, async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));

      const tools = registry.listTools("MODERATION");
      expect(tools.length).toBe(1);
    });

    it("should return empty for unknown category", () => {
      const tools = registry.listTools("unknown");
      expect(tools.length).toBe(0);
    });
  });

  describe("searchTools", () => {
    beforeEach(() => {
      registry.registerTool(
        "send_message",
        "messaging",
        "Send Message",
        "Send a message to Discord",
        {},
        {},
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );
      registry.registerTool(
        "ban_member",
        "moderation",
        "Ban Member",
        "Ban a user from the server",
        {},
        {},
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );
    });

    it("should find tools by name", () => {
      const results = registry.searchTools("ban");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("ban_member");
    });

    it("should find tools by description", () => {
      const results = registry.searchTools("Discord");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("send_message");
    });

    it("should respect limit", () => {
      const results = registry.searchTools("a", 1);
      expect(results.length).toBe(1);
    });
  });

  describe("getToolSchema", () => {
    it("should return full schema for a tool", () => {
      registry.registerTool(
        "test_tool",
        "messaging",
        "Test Tool",
        "A test tool",
        { input: z.string().describe("The input") },
        { output: z.boolean() },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );

      const schema = registry.getToolSchema("test_tool");
      expect(schema).not.toBeNull();
      expect(schema?.name).toBe("test_tool");
      expect(schema?.category).toBe("messaging");
    });

    it("should return null for unknown tool", () => {
      const schema = registry.getToolSchema("unknown");
      expect(schema).toBeNull();
    });
  });

  describe("getHandler", () => {
    it("should return handler that can be executed", async () => {
      registry.registerTool(
        "test_tool",
        "messaging",
        "Test Tool",
        "A test tool",
        {},
        {},
        async () => ({
          content: [{ type: "text" as const, text: "executed" }],
          structuredContent: { success: true },
        }),
      );

      const handler = registry.getHandler("test_tool");
      expect(handler).toBeDefined();

      const result = await handler?.({});
      expect(result?.content[0].text).toBe("executed");
      expect(result?.structuredContent?.success).toBe(true);
    });
  });
});

describe("RegistryAdapter", () => {
  it("should forward registrations to registry", () => {
    const registry = new ToolRegistry();
    const adapter = createRegistryAdapter(registry, "messaging");

    adapter.registerTool(
      "send_message",
      {
        title: "Send Message",
        description: "Send a message",
        inputSchema: { content: z.string() },
        outputSchema: { success: z.boolean() },
      },
      async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    );

    expect(registry.hasTool("send_message")).toBe(true);
    const schema = registry.getToolSchema("send_message");
    expect(schema?.category).toBe("messaging");
  });
});
