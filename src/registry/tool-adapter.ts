/**
 * Tool Adapter
 *
 * Provides a compatible interface for existing tool registration functions
 * to register with the ToolRegistry instead of directly with McpServer.
 */

import { ZodType } from "zod";
import { ToolRegistry, ToolHandler } from "./tool-registry.js";

/**
 * Creates a mock server interface that redirects tool registrations to the registry.
 * This allows existing tool files to work unchanged - they call registerTool on this
 * adapter, which forwards to the registry with the appropriate category.
 */
export function createRegistryAdapter(
  registry: ToolRegistry,
  category: string,
): RegistryAdapter {
  return new RegistryAdapter(registry, category);
}

export class RegistryAdapter {
  constructor(
    private registry: ToolRegistry,
    private category: string,
  ) {}

  /**
   * Compatible with McpServer.registerTool signature.
   * Intercepts tool registrations and forwards them to the registry.
   */
  registerTool(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: Record<string, ZodType>;
      outputSchema: Record<string, ZodType>;
    },
    handler: ToolHandler,
  ): void {
    this.registry.registerTool(
      name,
      this.category,
      config.title,
      config.description,
      config.inputSchema,
      config.outputSchema,
      handler,
    );
  }
}

/**
 * Type that makes RegistryAdapter compatible with McpServer for tool registration.
 * This is a duck-typed interface - as long as registerTool exists with compatible signature,
 * the existing tool files will work.
 */
export type ToolRegistrationTarget = {
  registerTool: RegistryAdapter["registerTool"];
};
