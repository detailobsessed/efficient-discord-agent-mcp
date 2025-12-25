/**
 * Meta-tools for Progressive Disclosure
 *
 * These 4 tools replace 65+ individual tool registrations, dramatically reducing
 * token consumption when the LLM loads the tool list.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { Logger } from "../utils/logger.js";
import type { ToolRegistry } from "./tool-registry.js";

export function registerMetaTools(server: McpServer, registry: ToolRegistry, logger: Logger): void {
  // 1. List Categories
  server.registerTool(
    "list_categories",
    {
      title: "List Tool Categories",
      description:
        "List all available Discord tool categories. Start here to discover what operations are available.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        categories: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            toolCount: z.number(),
          }),
        ),
      }),
      annotations: {
        title: "List Tool Categories",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      logger.info("Listing categories");
      const categories = registry.listCategories();

      logger.info("Listed categories", { count: categories.length });

      return {
        content: [
          {
            type: "text" as const,
            text: `Available categories:\n${categories.map((c) => `- **${c.name}** (${c.toolCount} tools): ${c.description}`).join("\n")}`,
          },
        ],
        structuredContent: { categories },
      };
    },
  );

  // 2. List Tools in Category
  server.registerTool(
    "list_tools",
    {
      title: "List Tools in Category",
      description:
        "List all available tools in a specific category. Use after list_categories to choose a category.",
      inputSchema: z.object({
        category: z.string().describe("Category name from list_categories"),
      }),
      outputSchema: z.object({
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
          }),
        ),
      }),
      annotations: {
        title: "List Tools in Category",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ category }) => {
      const tools = registry.listTools(category as string);

      if (tools.length === 0) {
        const available = registry
          .listCategories()
          .map((c) => c.name)
          .join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Category '${category}' not found or has no tools. Available categories: ${available}`,
            },
          ],
          structuredContent: { tools: [] },
          isError: true,
        };
      }

      logger.info("Listed tools", { category, count: tools.length });

      return {
        content: [
          {
            type: "text" as const,
            text: `Tools in ${category}:\n${tools.map((t) => `- **${t.name}**: ${t.description}`).join("\n")}`,
          },
        ],
        structuredContent: { tools },
      };
    },
  );

  // 3. Search Tools
  server.registerTool(
    "search_tools",
    {
      title: "Search Tools",
      description:
        "Search for tools by name or description. Useful for finding specific functionality.",
      inputSchema: z.object({
        query: z.string().describe("Search query - matches tool names and descriptions"),
        limit: z.number().optional().describe("Maximum number of results to return"),
      }),
      outputSchema: z.object({
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            category: z.string(),
          }),
        ),
      }),
      annotations: {
        title: "Search Tools",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      const tools = registry.searchTools(query as string, (limit as number) || 20);

      logger.info("Searched tools", { query, results: tools.length });

      if (tools.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No tools found matching '${query}'. Try a different search term or use list_categories to browse.`,
            },
          ],
          structuredContent: { tools: [] },
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${tools.length} tool(s) matching '${query}':\n${tools.map((t) => `- **${t.name}**: ${t.description}`).join("\n")}`,
          },
        ],
        structuredContent: { tools },
      };
    },
  );

  // 4. Get Tool Schema
  server.registerTool(
    "get_tool_schema",
    {
      title: "Get Tool Schema",
      description:
        "Get the input schema for a specific tool. Use this to understand what parameters a tool requires.",
      inputSchema: z.object({
        tool_name: z.string().describe("Name of the tool to get schema for"),
      }),
      outputSchema: z.object({
        name: z.string(),
        title: z.string(),
        description: z.string(),
        category: z.string(),
        inputSchema: z.record(z.any()),
        outputSchema: z.record(z.any()),
      }),
      annotations: {
        title: "Get Tool Schema",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ tool_name }) => {
      const schema = registry.getToolSchema(tool_name as string);

      if (!schema) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Tool '${tool_name}' not found. Use search_tools or list_tools to find valid tool names.`,
            },
          ],
          isError: true,
        };
      }

      logger.info("Got tool schema", { tool_name });

      // Serialize Zod schemas to JSON-compatible format
      const serializedInput = registry.serializeSchema(schema.inputSchema);
      const serializedOutput = registry.serializeSchema(schema.outputSchema);

      return {
        content: [
          {
            type: "text" as const,
            text: `## ${schema.title}\n\n${schema.description}\n\n**Category:** ${schema.category}\n\n**Input Parameters:**\n\`\`\`json\n${JSON.stringify(serializedInput, null, 2)}\n\`\`\`\n\n**Output:**\n\`\`\`json\n${JSON.stringify(serializedOutput, null, 2)}\n\`\`\``,
          },
        ],
        structuredContent: {
          name: schema.name,
          title: schema.title,
          description: schema.description,
          category: schema.category,
          inputSchema: serializedInput,
          outputSchema: serializedOutput,
        },
      };
    },
  );

  // 5. Execute Tool
  // Note: No outputSchema because this tool returns dynamic content from different tools
  server.registerTool(
    "execute_tool",
    {
      title: "Execute Tool",
      description:
        "Execute any tool by name with parameters. This is the actual execution interface after discovery.",
      inputSchema: z.object({
        tool_name: z.string().describe("Name of the tool to execute"),
        arguments: z
          .record(z.any())
          .describe("Parameters for the tool (use get_tool_schema to see required fields)"),
      }),
      annotations: {
        title: "Execute Tool",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ tool_name, arguments: params }) => {
      const handler = registry.getHandler(tool_name as string);

      if (!handler) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Tool '${tool_name}' not found. Use search_tools or list_tools to find valid tool names.`,
            },
          ],
          structuredContent: {
            success: false,
            error: `Tool '${tool_name}' not found`,
          },
          isError: true,
        };
      }

      logger.info("Executing tool", { tool_name, params });

      try {
        const result = await handler(params as Record<string, unknown>);
        return result;
      } catch (error) {
        logger.error("Tool execution failed", {
          tool_name,
          error: error.message,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Tool execution failed: ${error.message}`,
            },
          ],
          structuredContent: {
            success: false,
            error: error.message,
          },
          isError: true,
        };
      }
    },
  );

  logger.info("Registered meta-tools for progressive disclosure", {
    totalTools: registry.getAllToolNames().length,
    categories: registry.listCategories().length,
  });
}
