/**
 * MCP Client Tests for Discord MCP Server
 *
 * Uses InMemoryTransport to test the MCP server without network I/O.
 * Pattern adapted from unblu-mcp's test_mcp_client.py.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Type for tool call results
interface ToolContent {
  type: string;
  text?: string;
}

interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

import { createRegistryAdapter, registerMetaTools, ToolRegistry } from "../src/registry/index.js";
import { Logger } from "../src/utils/logger.js";

// Mock logger for tests - using actual Logger class with minimal output
const mockLogger = new Logger("debug", "json");

/**
 * Create a test MCP server with the registry pattern.
 * This mimics the real server setup but without Discord client.
 */
function createTestServer(): McpServer {
  const mcpServer = new McpServer({
    name: "discord-mcp-test",
    version: "1.0.0",
  });

  const registry = new ToolRegistry();

  // Register some mock tools for testing
  const messagingAdapter = createRegistryAdapter(registry, "messaging");
  messagingAdapter.registerTool(
    "send_message",
    {
      title: "Send Message",
      description: "Send a message to a Discord channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        content: z.string().max(2000).describe("Message content"),
      },
      outputSchema: {
        success: z.boolean(),
        messageId: z.string().optional(),
      },
    },
    async ({ channelId, content }) => ({
      content: [{ type: "text" as const, text: `Message sent to ${channelId}` }],
      structuredContent: {
        success: true,
        messageId: "mock-message-id",
        channelId,
        content,
      },
    }),
  );

  messagingAdapter.registerTool(
    "read_messages",
    {
      title: "Read Messages",
      description: "Read messages from a channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        limit: z.number().int().min(1).max(100).default(50),
      },
      outputSchema: {
        success: z.boolean(),
        messages: z.array(z.object({ id: z.string(), content: z.string() })),
      },
    },
    async ({ channelId, limit }) => ({
      content: [
        {
          type: "text" as const,
          text: `Retrieved ${limit} messages from ${channelId}`,
        },
      ],
      structuredContent: {
        success: true,
        messages: [
          { id: "1", content: "Hello" },
          { id: "2", content: "World" },
        ],
      },
    }),
  );

  // Add new messaging tools
  messagingAdapter.registerTool(
    "get_message",
    {
      title: "Get Message",
      description: "Get a specific message by ID",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID"),
      },
      outputSchema: {
        success: z.boolean(),
        message: z
          .object({
            id: z.string(),
            content: z.string(),
            authorUsername: z.string(),
          })
          .optional(),
      },
    },
    async ({ messageId }) => ({
      content: [{ type: "text" as const, text: `Retrieved message ${messageId}` }],
      structuredContent: {
        success: true,
        message: { id: messageId, content: "Test message", authorUsername: "TestUser" },
      },
    }),
  );

  messagingAdapter.registerTool(
    "reply_to_message",
    {
      title: "Reply to Message",
      description: "Reply to a specific message",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID to reply to"),
        content: z.string().describe("Reply content"),
      },
      outputSchema: {
        success: z.boolean(),
        messageId: z.string().optional(),
        replyToId: z.string().optional(),
      },
    },
    async ({ messageId }) => ({
      content: [{ type: "text" as const, text: `Replied to message ${messageId}` }],
      structuredContent: {
        success: true,
        messageId: "new-reply-id",
        replyToId: messageId,
      },
    }),
  );

  messagingAdapter.registerTool(
    "search_messages",
    {
      title: "Search Messages",
      description: "Search for messages in a channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        query: z.string().optional().describe("Search query"),
        limit: z.number().optional().default(25),
      },
      outputSchema: {
        success: z.boolean(),
        messages: z.array(z.object({ id: z.string(), content: z.string() })).optional(),
        totalFound: z.number().optional(),
      },
    },
    async ({ query }) => ({
      content: [{ type: "text" as const, text: `Found messages matching "${query}"` }],
      structuredContent: {
        success: true,
        messages: [{ id: "1", content: "Matching message" }],
        totalFound: 1,
      },
    }),
  );

  // Add server tools
  const serverAdapter = createRegistryAdapter(registry, "server");
  serverAdapter.registerTool(
    "list_guilds",
    {
      title: "List Guilds",
      description: "List all guilds the bot is in",
      inputSchema: {},
      outputSchema: {
        success: z.boolean(),
        guilds: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
        totalCount: z.number().optional(),
      },
    },
    async () => ({
      content: [{ type: "text" as const, text: "Bot is in 1 server(s)" }],
      structuredContent: {
        success: true,
        guilds: [{ id: "123", name: "Test Server" }],
        totalCount: 1,
      },
    }),
  );

  serverAdapter.registerTool(
    "get_server_info",
    {
      title: "Get Server Info",
      description: "Get detailed server information",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
      },
      outputSchema: {
        success: z.boolean(),
        server: z
          .object({
            id: z.string(),
            name: z.string(),
            memberCount: z.number(),
          })
          .optional(),
      },
    },
    async ({ guildId }) => ({
      content: [{ type: "text" as const, text: "Server: Test Server" }],
      structuredContent: {
        success: true,
        server: { id: guildId, name: "Test Server", memberCount: 100 },
      },
    }),
  );

  const moderationAdapter = createRegistryAdapter(registry, "moderation");
  moderationAdapter.registerTool(
    "ban_member",
    {
      title: "Ban Member",
      description: "Ban a member from the server",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        userId: z.string().describe("User ID to ban"),
        reason: z.string().optional().describe("Ban reason"),
      },
      outputSchema: {
        success: z.boolean(),
      },
    },
    async ({ guildId, userId, reason }) => ({
      content: [
        {
          type: "text" as const,
          text: `Banned user ${userId} from ${guildId}`,
        },
      ],
      structuredContent: { success: true, guildId, userId, reason },
    }),
  );

  // Register meta-tools
  registerMetaTools(mcpServer, registry, mockLogger);

  return mcpServer;
}

describe("MCP Client Integration", () => {
  let client: Client;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeAll(async () => {
    server = createTestServer();
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  describe("Meta-Tools", () => {
    it("should expose exactly 5 meta-tools", async () => {
      const result = await client.listTools();
      const toolNames = result.tools.map((t) => t.name);

      expect(result.tools.length).toBe(5);
      expect(toolNames).toContain("list_categories");
      expect(toolNames).toContain("list_tools");
      expect(toolNames).toContain("search_tools");
      expect(toolNames).toContain("get_tool_schema");
      expect(toolNames).toContain("execute_tool");
    });

    it("should have descriptions for all meta-tools", async () => {
      const result = await client.listTools();

      for (const tool of result.tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description?.length).toBeGreaterThan(0);
      }
    });
  });

  describe("list_categories", () => {
    it("should return categories with tool counts", async () => {
      const result = (await client.callTool({
        name: "list_categories",
        arguments: {},
      })) as ToolResult;

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);

      // Parse the structured content from the text response
      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("messaging");
      expect(textContent?.text).toContain("moderation");
    });
  });

  describe("list_tools", () => {
    it("should return tools for a valid category", async () => {
      const result = (await client.callTool({
        name: "list_tools",
        arguments: { category: "messaging" },
      })) as ToolResult;

      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("send_message");
      expect(textContent?.text).toContain("read_messages");
    });

    it("should return error for invalid category", async () => {
      const result = (await client.callTool({
        name: "list_tools",
        arguments: { category: "nonexistent" },
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("search_tools", () => {
    it("should find tools by name", async () => {
      const result = (await client.callTool({
        name: "search_tools",
        arguments: { query: "ban" },
      })) as ToolResult;

      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("ban_member");
    });

    it("should find tools by description", async () => {
      const result = (await client.callTool({
        name: "search_tools",
        arguments: { query: "message" },
      })) as ToolResult;

      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("send_message");
    });

    it("should return empty for no matches", async () => {
      const result = (await client.callTool({
        name: "search_tools",
        arguments: { query: "xyznonexistent" },
      })) as ToolResult;

      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("No tools found");
    });
  });

  describe("get_tool_schema", () => {
    it("should return schema for valid tool", async () => {
      const result = (await client.callTool({
        name: "get_tool_schema",
        arguments: { tool_name: "send_message" },
      })) as ToolResult;

      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("Send Message");
      expect(textContent?.text).toContain("channelId");
      expect(textContent?.text).toContain("content");
    });

    it("should return error for invalid tool", async () => {
      const result = (await client.callTool({
        name: "get_tool_schema",
        arguments: { tool_name: "nonexistent" },
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("execute_tool", () => {
    it("should execute a tool successfully", async () => {
      const result = (await client.callTool({
        name: "execute_tool",
        arguments: {
          tool_name: "send_message",
          arguments: {
            channelId: "123456789",
            content: "Hello, World!",
          },
        },
      })) as ToolResult;

      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("Message sent");
    });

    it("should return error for invalid tool", async () => {
      const result = (await client.callTool({
        name: "execute_tool",
        arguments: {
          tool_name: "nonexistent",
          arguments: {},
        },
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });
});

describe("Progressive Disclosure Workflow", () => {
  let client: Client;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeAll(async () => {
    server = createTestServer();
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it("should support full discovery workflow", async () => {
    // Step 1: List categories
    const categoriesResult = await client.callTool({
      name: "list_categories",
      arguments: {},
    });
    expect(categoriesResult.content).toBeDefined();

    // Step 2: List tools in a category
    const toolsResult = await client.callTool({
      name: "list_tools",
      arguments: { category: "messaging" },
    });
    expect(toolsResult.content).toBeDefined();

    // Step 3: Get schema for a specific tool
    const schemaResult = await client.callTool({
      name: "get_tool_schema",
      arguments: { tool_name: "send_message" },
    });
    expect(schemaResult.content).toBeDefined();

    // Step 4: Execute the tool
    const executeResult = (await client.callTool({
      name: "execute_tool",
      arguments: {
        tool_name: "send_message",
        arguments: {
          channelId: "test-channel",
          content: "Test message",
        },
      },
    })) as ToolResult;
    expect(executeResult.content).toBeDefined();

    const textContent = executeResult.content.find((c) => c.type === "text");
    expect(textContent?.text).toContain("Message sent");
  });
});

describe("New Tools Tests", () => {
  let client: Client;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeAll(async () => {
    server = createTestServer();
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  describe("Server Tools", () => {
    it("should list guilds", async () => {
      const result = (await client.callTool({
        name: "execute_tool",
        arguments: { tool_name: "list_guilds", arguments: {} },
      })) as ToolResult;

      expect(result.content).toBeDefined();
      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent?.text).toContain("server");
    });

    it("should get server info", async () => {
      const result = (await client.callTool({
        name: "execute_tool",
        arguments: {
          tool_name: "get_server_info",
          arguments: { guildId: "123456789" },
        },
      })) as ToolResult;

      expect(result.content).toBeDefined();
      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent?.text).toContain("Server");
    });
  });

  describe("Messaging Tools", () => {
    it("should get a specific message", async () => {
      const result = (await client.callTool({
        name: "execute_tool",
        arguments: {
          tool_name: "get_message",
          arguments: { channelId: "chan-123", messageId: "msg-456" },
        },
      })) as ToolResult;

      expect(result.content).toBeDefined();
      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent?.text).toContain("Retrieved message");
    });

    it("should reply to a message", async () => {
      const result = (await client.callTool({
        name: "execute_tool",
        arguments: {
          tool_name: "reply_to_message",
          arguments: {
            channelId: "chan-123",
            messageId: "msg-456",
            content: "This is a reply",
          },
        },
      })) as ToolResult;

      expect(result.content).toBeDefined();
      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent?.text).toContain("Replied to message");
    });

    it("should search messages", async () => {
      const result = (await client.callTool({
        name: "execute_tool",
        arguments: {
          tool_name: "search_messages",
          arguments: { channelId: "chan-123", query: "hello" },
        },
      })) as ToolResult;

      expect(result.content).toBeDefined();
      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent?.text).toContain("Found messages");
    });
  });

  describe("Tool Discovery for New Tools", () => {
    it("should find server category with new tools", async () => {
      const result = (await client.callTool({
        name: "list_tools",
        arguments: { category: "server" },
      })) as ToolResult;

      expect(result.content).toBeDefined();
      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent?.text).toContain("list_guilds");
      expect(textContent?.text).toContain("get_server_info");
    });

    it("should find new messaging tools", async () => {
      const result = (await client.callTool({
        name: "list_tools",
        arguments: { category: "messaging" },
      })) as ToolResult;

      expect(result.content).toBeDefined();
      const textContent = result.content.find((c) => c.type === "text");
      expect(textContent?.text).toContain("get_message");
      expect(textContent?.text).toContain("reply_to_message");
      expect(textContent?.text).toContain("search_messages");
    });
  });
});
