/**
 * MCP Server Integration Tests
 *
 * Tests the full MCP server flow using InMemoryTransport from the SDK.
 * This tests the actual MCP protocol communication, not just our registry logic.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema, InitializeResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { DiscordClientManager } from "../src/discord/client.js";
import { createRegistryAdapter, registerMetaTools, ToolRegistry } from "../src/registry/index.js";
import { registerChannelTools } from "../src/tools/channels.js";
import { registerMessagingTools } from "../src/tools/messaging.js";
import { registerModerationTools } from "../src/tools/moderation.js";
import { Logger } from "../src/utils/logger.js";

// Mock Discord client manager
function createMockDiscordManager(): DiscordClientManager {
  return {
    getClient: () => {
      throw new Error("DISCORD_TOKEN not set");
    },
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    isConnected: () => false,
  } as unknown as DiscordClientManager;
}

interface TextContent {
  type: "text";
  text: string;
}

// Helper to extract text content from tool results
function getTextContent(content: unknown): string {
  // content is already the array of content items
  if (!content || !Array.isArray(content)) {
    return "";
  }
  const textContent = content.find((c) => c.type === "text") as TextContent | undefined;
  return textContent?.text ?? "";
}

const logger = new Logger("error", "pretty");

describe("MCP Server Integration", () => {
  let client: Client;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    // Create linked transport pair for in-process testing
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Create and configure MCP server
    server = new McpServer(
      {
        name: "test-discord-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Create tool registry and register some tools
    const registry = new ToolRegistry();
    const mockDiscordManager = createMockDiscordManager();

    // Register a few tool categories for testing
    registerMessagingTools(
      createRegistryAdapter(registry, "messaging"),
      mockDiscordManager,
      logger,
    );
    registerChannelTools(createRegistryAdapter(registry, "channels"), mockDiscordManager, logger);
    registerModerationTools(
      createRegistryAdapter(registry, "moderation"),
      mockDiscordManager,
      logger,
    );

    // Register the 5 meta-tools
    registerMetaTools(server, registry, logger);

    // Create client and connect
    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    await client?.close();
    await server?.close();
  });

  describe("meta-tools", () => {
    it("should list categories", async () => {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(5);

      const listCategoriesTool = result.tools.find((t) => t.name === "list_categories");
      expect(listCategoriesTool).toBeDefined();
    });

    it("should list tools in a category", async () => {
      const response = await client.request(
        {
          method: "tools/call",
          params: {
            name: "list_tools",
            arguments: {
              category: "messaging",
            },
          },
        },
        CallToolResultSchema,
        { timeout: 5000 },
      );

      const tools = getTextContent(response.content);
      expect(tools).toContain("send_message");
      expect(tools).toContain("edit_message");
    });

    it("should search for tools", async () => {
      const response = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_tools",
            arguments: {
              query: "ban",
            },
          },
        },
        CallToolResultSchema,
        { timeout: 5000 },
      );

      const results = getTextContent(response.content);
      expect(results).toContain("ban");
    });

    it("should get tool schema", async () => {
      const response = await client.request(
        {
          method: "tools/call",
          params: {
            name: "get_tool_schema",
            arguments: {
              tool_name: "send_message",
            },
          },
        },
        CallToolResultSchema,
        { timeout: 5000 },
      );

      const schema = getTextContent(response.content);
      expect(schema).toContain("channelId");
      expect(schema).toContain("content");
    });
  });

  describe("tool execution", () => {
    it("should handle missing DISCORD_TOKEN gracefully", async () => {
      const response = await client.request(
        {
          method: "tools/call",
          params: {
            name: "execute_tool",
            arguments: {
              tool_name: "send_message",
              arguments: {
                channelId: "123",
                content: "test",
              },
            },
          },
        },
        CallToolResultSchema,
        { timeout: 5000 },
      );

      expect(response.content).toBeDefined();
      const errorText = getTextContent(response.content);
      expect(errorText).toContain("DISCORD_TOKEN");
    });
  });

  describe("server info", () => {
    it("should return server info", async () => {
      const response = await client.request(
        {
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        },
        InitializeResultSchema,
        { timeout: 5000 },
      );

      expect(response.serverInfo).toBeDefined();
      expect(response.serverInfo?.name).toBe("test-discord-mcp");
      expect(response.serverInfo?.version).toBe("1.0.0");
    });
  });
});
