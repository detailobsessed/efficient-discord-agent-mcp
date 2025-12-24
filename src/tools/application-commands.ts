import {
  type ApplicationCommand,
  type ApplicationCommandDataResolvable,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type Collection,
} from "discord.js";
import { z } from "zod";
import type { DiscordClientManager } from "../discord/client.js";
import { InvalidInputError } from "../errors/discord.js";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { getErrorMessage } from "../utils/errors.js";
import { validateGuildAccess } from "../utils/guild-validation.js";
import type { Logger } from "../utils/logger.js";

// Type maps for application commands - defined outside function to avoid recreation
const typeMap: Record<string, ApplicationCommandType> = {
  CHAT_INPUT: ApplicationCommandType.ChatInput,
  USER: ApplicationCommandType.User,
  MESSAGE: ApplicationCommandType.Message,
};

const optionTypeMap: Record<string, ApplicationCommandOptionType> = {
  SUB_COMMAND: ApplicationCommandOptionType.Subcommand,
  SUB_COMMAND_GROUP: ApplicationCommandOptionType.SubcommandGroup,
  STRING: ApplicationCommandOptionType.String,
  INTEGER: ApplicationCommandOptionType.Integer,
  BOOLEAN: ApplicationCommandOptionType.Boolean,
  USER: ApplicationCommandOptionType.User,
  CHANNEL: ApplicationCommandOptionType.Channel,
  ROLE: ApplicationCommandOptionType.Role,
  MENTIONABLE: ApplicationCommandOptionType.Mentionable,
  NUMBER: ApplicationCommandOptionType.Number,
  ATTACHMENT: ApplicationCommandOptionType.Attachment,
};

export function registerApplicationCommandTools(
  server: ToolRegistrationTarget,
  discordManager: DiscordClientManager,
  logger: Logger,
) {
  // List Application Commands Tool
  server.registerTool(
    "list_application_commands",
    {
      title: "List Application Commands",
      description: "Get all application commands (slash commands) for a guild or globally",
      inputSchema: {
        guildId: z.string().optional().describe("Guild ID (omit for global commands)"),
      },
      outputSchema: {
        success: z.boolean(),
        commands: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string(),
              type: z.string(),
              defaultMemberPermissions: z.string().nullable().optional(),
            }),
          )
          .optional(),
        count: z.number().optional(),
        scope: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId }) => {
      try {
        const client = discordManager.getClient();

        let commands:
          | Awaited<ReturnType<NonNullable<typeof client.application>["commands"]["fetch"]>>
          | undefined;
        let scope: string;

        if (guildId) {
          // Guild-specific commands
          const guild = await validateGuildAccess(client, guildId);
          commands = await guild.commands.fetch();
          scope = `guild:${guild.name}`;
        } else {
          // Global commands
          commands = await client.application?.commands.fetch();
          scope = "global";
        }

        if (!commands) {
          throw new InvalidInputError("guildId", "Could not fetch commands");
        }

        const commandList = commands.map((cmd) => ({
          id: cmd.id,
          name: cmd.name,
          description: cmd.description,
          type: ApplicationCommandType[cmd.type],
          defaultMemberPermissions: cmd.defaultMemberPermissions?.toString() || null,
        }));

        const output = {
          success: true,
          commands: commandList,
          count: commandList.length,
          scope,
        };

        logger.info("Listed application commands", {
          guildId: guildId || "global",
          count: commandList.length,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${commandList.length} application commands (${scope})`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to list application commands", {
          error: errorMsg,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMsg,
          },
        };
      }
    },
  );

  // Get Application Command Details Tool
  server.registerTool(
    "get_application_command",
    {
      title: "Get Application Command Details",
      description: "Get detailed information about a specific application command",
      inputSchema: {
        commandId: z.string().describe("Application command ID"),
        guildId: z.string().optional().describe("Guild ID (omit for global commands)"),
      },
      outputSchema: {
        success: z.boolean(),
        command: z
          .object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            type: z.string(),
            options: z.array(z.any()).optional(),
            defaultMemberPermissions: z.string().nullable().optional(),
            dmPermission: z.boolean().optional(),
            nsfw: z.boolean().optional(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ commandId, guildId }) => {
      try {
        const client = discordManager.getClient();

        let command: Awaited<
          ReturnType<NonNullable<typeof client.application>["commands"]["fetch"]>
        > extends infer T
          ? T extends Map<string, infer U>
            ? U
            : T
          : never;

        if (guildId) {
          const guild = await validateGuildAccess(client, guildId);
          const fetched = await guild.commands.fetch(commandId);
          if (!fetched) {
            throw new InvalidInputError("commandId", "Command not found");
          }
          command = fetched;
        } else {
          const fetched = await client.application?.commands.fetch(commandId);
          if (!fetched) {
            throw new InvalidInputError("commandId", "Command not found");
          }
          command = fetched;
        }

        const commandDetails = {
          id: command.id,
          name: command.name,
          description: command.description,
          type: ApplicationCommandType[command.type],
          options: command.options.map((opt) => ({
            type: ApplicationCommandOptionType[opt.type],
            name: opt.name,
            description: opt.description,
            required: "required" in opt ? (opt.required as boolean) : false,
            choices:
              "choices" in opt
                ? (opt.choices as Array<{ name: string; value: string | number }>)
                : [],
          })),
          defaultMemberPermissions: command.defaultMemberPermissions?.toString() || null,
          dmPermission: command.dmPermission,
          nsfw: command.nsfw,
        };

        const output = {
          success: true,
          command: commandDetails,
        };

        logger.info("Fetched application command details", {
          commandId,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Application command "${command.name}" details retrieved`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to get application command", {
          error: errorMsg,
          commandId,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMsg,
          },
        };
      }
    },
  );

  // Create Application Command Tool
  server.registerTool(
    "create_application_command",
    {
      title: "Create Application Command",
      description: "Create a new slash command, user context menu, or message context menu command",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(32)
          .regex(/^[\w-]{1,32}$/)
          .describe("Command name (lowercase, alphanumeric, hyphens)"),
        description: z.string().min(1).max(100).describe("Command description"),
        type: z
          .enum(["CHAT_INPUT", "USER", "MESSAGE"])
          .optional()
          .describe("Command type (default: CHAT_INPUT)"),
        options: z
          .array(
            z.object({
              type: z.enum([
                "SUB_COMMAND",
                "SUB_COMMAND_GROUP",
                "STRING",
                "INTEGER",
                "BOOLEAN",
                "USER",
                "CHANNEL",
                "ROLE",
                "MENTIONABLE",
                "NUMBER",
                "ATTACHMENT",
              ]),
              name: z.string(),
              description: z.string(),
              required: z.boolean().optional(),
              choices: z
                .array(
                  z.object({
                    name: z.string(),
                    value: z.union([z.string(), z.number()]),
                  }),
                )
                .optional(),
            }),
          )
          .optional()
          .describe("Command options (for CHAT_INPUT type)"),
        guildId: z.string().optional().describe("Guild ID (omit for global command)"),
        defaultMemberPermissions: z
          .string()
          .optional()
          .describe("Default required permissions (permission bit string)"),
        dmPermission: z.boolean().optional().describe("Enable in DMs (default: true)"),
        nsfw: z.boolean().optional().describe("Mark command as NSFW"),
      },
      outputSchema: {
        success: z.boolean(),
        command: z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({
      name,
      description,
      type = "CHAT_INPUT",
      options,
      guildId,
      defaultMemberPermissions,
      dmPermission,
      nsfw,
    }) => {
      try {
        const client = discordManager.getClient();

        const commandData = {
          name,
          description: type === "CHAT_INPUT" ? description : "",
          type: typeMap[type],
          ...(type === "CHAT_INPUT" &&
            options && {
              options: options.map((opt) => ({
                type: optionTypeMap[opt.type],
                name: opt.name,
                description: opt.description,
                required: opt.required,
                choices: opt.choices,
              })),
            }),
          ...(defaultMemberPermissions !== undefined && { defaultMemberPermissions }),
          ...(dmPermission !== undefined && { dmPermission }),
          ...(nsfw !== undefined && { nsfw }),
        } as ApplicationCommandDataResolvable;

        let scope: string;
        let createdCommand: ApplicationCommand | undefined;

        if (guildId) {
          const guild = await validateGuildAccess(client, guildId);
          createdCommand = await guild.commands.create(commandData);
          scope = `guild:${guild.name}`;
        } else {
          createdCommand = await client.application?.commands.create(commandData);
          scope = "global";
        }

        if (!createdCommand) {
          throw new InvalidInputError("command", "Failed to create command");
        }

        logger.info("Created application command", {
          commandId: createdCommand.id,
          name,
          guildId: guildId || "global",
        });

        return {
          content: [
            { type: "text" as const, text: `Created application command "/${name}" (${scope})` },
          ],
          structuredContent: {
            success: true,
            command: {
              id: createdCommand.id,
              name: createdCommand.name,
              type: ApplicationCommandType[createdCommand.type],
            },
          },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create application command", { error: errorMsg, name, guildId });

        return {
          content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
        };
      }
    },
  );

  // Modify Application Command Tool
  server.registerTool(
    "modify_application_command",
    {
      title: "Modify Application Command",
      description: "Update an existing application command's properties",
      inputSchema: {
        commandId: z.string().describe("Application command ID"),
        name: z
          .string()
          .min(1)
          .max(32)
          .regex(/^[\w-]{1,32}$/)
          .optional()
          .describe("New command name"),
        description: z.string().min(1).max(100).optional().describe("New description"),
        options: z
          .array(
            z.object({
              type: z.enum([
                "SUB_COMMAND",
                "SUB_COMMAND_GROUP",
                "STRING",
                "INTEGER",
                "BOOLEAN",
                "USER",
                "CHANNEL",
                "ROLE",
                "MENTIONABLE",
                "NUMBER",
                "ATTACHMENT",
              ]),
              name: z.string(),
              description: z.string(),
              required: z.boolean().optional(),
              choices: z
                .array(
                  z.object({
                    name: z.string(),
                    value: z.union([z.string(), z.number()]),
                  }),
                )
                .optional(),
            }),
          )
          .optional()
          .describe("New options (replaces existing)"),
        guildId: z.string().optional().describe("Guild ID (omit for global commands)"),
        defaultMemberPermissions: z.string().optional().describe("New default permissions"),
        dmPermission: z.boolean().optional().describe("New DM permission"),
        nsfw: z.boolean().optional().describe("New NSFW flag"),
      },
      outputSchema: {
        success: z.boolean(),
        command: z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({
      commandId,
      name,
      description,
      options,
      guildId,
      defaultMemberPermissions,
      dmPermission,
      nsfw,
    }) => {
      try {
        const client = discordManager.getClient();

        let command: ApplicationCommand | undefined;

        if (guildId) {
          const guild = await validateGuildAccess(client, guildId);
          command = await guild.commands.fetch(commandId);
        } else {
          command = await client.application?.commands.fetch(commandId);
        }

        if (!command) {
          throw new InvalidInputError("commandId", "Command not found");
        }

        const optionTypeMap: Record<string, ApplicationCommandOptionType> = {
          SUB_COMMAND: ApplicationCommandOptionType.Subcommand,
          SUB_COMMAND_GROUP: ApplicationCommandOptionType.SubcommandGroup,
          STRING: ApplicationCommandOptionType.String,
          INTEGER: ApplicationCommandOptionType.Integer,
          BOOLEAN: ApplicationCommandOptionType.Boolean,
          USER: ApplicationCommandOptionType.User,
          CHANNEL: ApplicationCommandOptionType.Channel,
          ROLE: ApplicationCommandOptionType.Role,
          MENTIONABLE: ApplicationCommandOptionType.Mentionable,
          NUMBER: ApplicationCommandOptionType.Number,
          ATTACHMENT: ApplicationCommandOptionType.Attachment,
        };

        const updates: Record<string, unknown> = {};

        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (options !== undefined) {
          updates.options = options.map((opt) => ({
            type: optionTypeMap[opt.type],
            name: opt.name,
            description: opt.description,
            required: opt.required,
            choices: opt.choices,
          }));
        }
        if (defaultMemberPermissions !== undefined) {
          updates.defaultMemberPermissions = defaultMemberPermissions;
        }
        if (dmPermission !== undefined) updates.dmPermission = dmPermission;
        if (nsfw !== undefined) updates.nsfw = nsfw;

        const updated = await command.edit(updates);

        const output = {
          success: true,
          command: {
            id: updated.id,
            name: updated.name,
          },
        };

        logger.info("Modified application command", {
          commandId,
          guildId: guildId || "global",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Updated application command "/${updated.name}"`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to modify application command", {
          error: errorMsg,
          commandId,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMsg,
          },
        };
      }
    },
  );

  // Delete Application Command Tool
  server.registerTool(
    "delete_application_command",
    {
      title: "Delete Application Command",
      description: "Delete an application command from the guild or globally",
      inputSchema: {
        commandId: z.string().describe("Application command ID to delete"),
        guildId: z.string().optional().describe("Guild ID (omit for global commands)"),
      },
      outputSchema: {
        success: z.boolean(),
        commandId: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ commandId, guildId }) => {
      try {
        const client = discordManager.getClient();

        let scope: string;
        let fetchedCommand: ApplicationCommand | undefined;

        if (guildId) {
          const guild = await validateGuildAccess(client, guildId);
          fetchedCommand = await guild.commands.fetch(commandId);
          scope = `guild:${guild.name}`;
        } else {
          fetchedCommand = await client.application?.commands.fetch(commandId);
          scope = "global";
        }

        if (!fetchedCommand) {
          throw new InvalidInputError("commandId", "Command not found");
        }

        const commandName = fetchedCommand.name;
        await fetchedCommand.delete();

        const output = {
          success: true,
          commandId: commandId,
        };

        logger.info("Deleted application command", {
          commandId,
          guildId: guildId || "global",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Deleted application command "/${commandName}" (${scope})`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to delete application command", {
          error: errorMsg,
          commandId,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMsg,
          },
        };
      }
    },
  );

  // Bulk Overwrite Application Commands Tool
  server.registerTool(
    "bulk_overwrite_commands",
    {
      title: "Bulk Overwrite Application Commands",
      description: "Replace all application commands with a new set (useful for syncing)",
      inputSchema: {
        commands: z
          .array(
            z.object({
              name: z.string(),
              description: z.string(),
              type: z.enum(["CHAT_INPUT", "USER", "MESSAGE"]).optional(),
              options: z.array(z.any()).optional(),
            }),
          )
          .describe("Array of commands to set (replaces all existing)"),
        guildId: z.string().optional().describe("Guild ID (omit for global commands)"),
      },
      outputSchema: {
        success: z.boolean(),
        count: z.number().optional(),
        scope: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ commands, guildId }) => {
      try {
        const client = discordManager.getClient();

        const typeMap: Record<string, ApplicationCommandType> = {
          CHAT_INPUT: ApplicationCommandType.ChatInput,
          USER: ApplicationCommandType.User,
          MESSAGE: ApplicationCommandType.Message,
        };

        const commandData = commands.map((cmd) => ({
          name: cmd.name,
          description: cmd.description || "",
          type: cmd.type ? typeMap[cmd.type] : ApplicationCommandType.ChatInput,
          options: cmd.options || [],
        }));

        let scope: string;
        let setResult: Collection<string, ApplicationCommand> | undefined;

        if (guildId) {
          const guild = await validateGuildAccess(client, guildId);
          setResult = await guild.commands.set(commandData);
          scope = `guild:${guild.name}`;
        } else {
          setResult = await client.application?.commands.set(commandData);
          scope = "global";
        }

        if (!setResult) {
          throw new Error("Failed to set commands");
        }

        const output = {
          success: true,
          count: setResult.size,
          scope,
        };

        logger.info("Bulk overwrote application commands", {
          guildId: guildId || "global",
          commandsSet: setResult.size,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Synchronized ${setResult.size} application commands (${scope})`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to bulk overwrite commands", {
          error: errorMsg,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMsg,
          },
        };
      }
    },
  );
}
