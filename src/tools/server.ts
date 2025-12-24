import {
  AuditLogEvent,
  type Collection,
  type GuildAuditLogsFetchOptions,
  type GuildEditOptions,
  PermissionFlagsBits,
  type Webhook,
} from "discord.js";
import { z } from "zod";
import type { DiscordClientManager } from "../discord/client.js";
import { GuildNotFoundError, PermissionDeniedError } from "../errors/discord.js";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { getErrorMessage } from "../utils/errors.js";
import type { Logger } from "../utils/logger.js";

export function registerServerTools(
  server: ToolRegistrationTarget,
  discordManager: DiscordClientManager,
  logger: Logger,
) {
  // List Guilds Tool
  server.registerTool(
    "list_guilds",
    {
      title: "List Bot Guilds",
      description: "List all Discord servers (guilds) the bot is a member of",
      inputSchema: {},
      outputSchema: {
        success: z.boolean(),
        guilds: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              memberCount: z.number(),
              ownerId: z.string(),
              icon: z.string().nullable(),
            }),
          )
          .optional(),
        totalCount: z.number().optional(),
        error: z.string().optional(),
      },
    },
    async () => {
      try {
        const client = discordManager.getClient();
        const guilds = client.guilds.cache;

        const guildList = guilds.map((guild) => ({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          ownerId: guild.ownerId,
          icon: guild.iconURL(),
        }));

        const output = {
          success: true,
          guilds: guildList,
          totalCount: guildList.length,
        };

        logger.info("Guilds listed", { count: guildList.length });

        return {
          content: [
            {
              type: "text" as const,
              text: `Bot is in ${guildList.length} server(s): ${guildList.map((g) => g.name).join(", ")}`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to list guilds", { error: errorMsg });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to list guilds: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Get Server Info Tool
  server.registerTool(
    "get_server_info",
    {
      title: "Get Server Info",
      description:
        "Get detailed information about a Discord server including name, member count, channels, roles, and more",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
      },
      outputSchema: {
        success: z.boolean(),
        server: z
          .object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable(),
            memberCount: z.number(),
            ownerId: z.string(),
            ownerUsername: z.string().optional(),
            icon: z.string().nullable(),
            banner: z.string().nullable(),
            createdAt: z.string(),
            channelCount: z.number(),
            roleCount: z.number(),
            emojiCount: z.number(),
            boostLevel: z.number(),
            boostCount: z.number(),
            verificationLevel: z.string(),
            features: z.array(z.string()),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        // Fetch additional data
        const owner = await guild.fetchOwner().catch(() => null);

        const serverInfo = {
          id: guild.id,
          name: guild.name,
          description: guild.description,
          memberCount: guild.memberCount,
          ownerId: guild.ownerId,
          ownerUsername: owner?.user.username,
          icon: guild.iconURL(),
          banner: guild.bannerURL(),
          createdAt: guild.createdAt.toISOString(),
          channelCount: guild.channels.cache.size,
          roleCount: guild.roles.cache.size,
          emojiCount: guild.emojis.cache.size,
          boostLevel: guild.premiumTier,
          boostCount: guild.premiumSubscriptionCount || 0,
          verificationLevel: guild.verificationLevel.toString(),
          features: [...guild.features],
        };

        const output = {
          success: true,
          server: serverInfo,
        };

        logger.info("Server info retrieved", { guildId, name: guild.name });

        return {
          content: [
            {
              type: "text" as const,
              text: `**${guild.name}**\nMembers: ${guild.memberCount} | Channels: ${serverInfo.channelCount} | Roles: ${serverInfo.roleCount}`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to get server info", {
          error: errorMsg,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get server info: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Modify Server Tool
  server.registerTool(
    "modify_server",
    {
      title: "Modify Server Settings",
      description: "Update server name, description, or other settings",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        name: z.string().min(2).max(100).optional().describe("New server name"),
        description: z.string().max(120).optional().describe("New server description"),
        reason: z.string().optional().describe("Reason for modification (audit log)"),
      },
      outputSchema: {
        success: z.boolean(),
        guild: z
          .object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, name, description, reason }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
          throw new PermissionDeniedError("ManageGuild", guildId);
        }

        const updateOptions: GuildEditOptions = {};
        if (name !== undefined) updateOptions.name = name;
        if (description !== undefined) updateOptions.description = description;
        if (reason !== undefined) updateOptions.reason = reason;

        const updatedGuild = await guild.edit(updateOptions);

        const output = {
          success: true,
          guild: {
            id: updatedGuild.id,
            name: updatedGuild.name,
            description: updatedGuild.description,
          },
        };

        logger.info("Server modified", { guildId, reason });

        return {
          content: [
            {
              type: "text" as const,
              text: `Server "${updatedGuild.name}" modified successfully`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to modify server", {
          error: errorMsg,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to modify server: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Get Audit Logs Tool
  server.registerTool(
    "get_audit_logs",
    {
      title: "Get Server Audit Logs",
      description: "Retrieve recent audit log entries for the server",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(50)
          .describe("Number of entries to retrieve (max 100)"),
        userId: z.string().optional().describe("Filter by user who performed actions"),
        actionType: z
          .enum([
            "ALL",
            "MEMBER_KICK",
            "MEMBER_BAN_ADD",
            "MEMBER_BAN_REMOVE",
            "MEMBER_UPDATE",
            "MEMBER_ROLE_UPDATE",
            "CHANNEL_CREATE",
            "CHANNEL_DELETE",
            "CHANNEL_UPDATE",
            "ROLE_CREATE",
            "ROLE_DELETE",
            "ROLE_UPDATE",
            "MESSAGE_DELETE",
            "MESSAGE_BULK_DELETE",
          ])
          .optional()
          .default("ALL")
          .describe("Filter by action type"),
      },
      outputSchema: {
        success: z.boolean(),
        entries: z
          .array(
            z.object({
              id: z.string(),
              action: z.string(),
              executorId: z.string().nullable(),
              executorUsername: z.string().nullable(),
              targetId: z.string().nullable(),
              reason: z.string().nullable(),
              timestamp: z.string(),
            }),
          )
          .optional(),
        totalCount: z.number().optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, limit = 50, userId, actionType = "ALL" }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
          throw new PermissionDeniedError("ViewAuditLog", guildId);
        }

        const fetchOptions: GuildAuditLogsFetchOptions<AuditLogEvent> = { limit };
        if (userId) fetchOptions.user = userId;
        if (actionType !== "ALL") {
          const actionMap: Record<string, AuditLogEvent> = {
            MEMBER_KICK: AuditLogEvent.MemberKick,
            MEMBER_BAN_ADD: AuditLogEvent.MemberBanAdd,
            MEMBER_BAN_REMOVE: AuditLogEvent.MemberBanRemove,
            MEMBER_UPDATE: AuditLogEvent.MemberUpdate,
            MEMBER_ROLE_UPDATE: AuditLogEvent.MemberRoleUpdate,
            CHANNEL_CREATE: AuditLogEvent.ChannelCreate,
            CHANNEL_DELETE: AuditLogEvent.ChannelDelete,
            CHANNEL_UPDATE: AuditLogEvent.ChannelUpdate,
            ROLE_CREATE: AuditLogEvent.RoleCreate,
            ROLE_DELETE: AuditLogEvent.RoleDelete,
            ROLE_UPDATE: AuditLogEvent.RoleUpdate,
            MESSAGE_DELETE: AuditLogEvent.MessageDelete,
            MESSAGE_BULK_DELETE: AuditLogEvent.MessageBulkDelete,
          };
          fetchOptions.type = actionMap[actionType];
        }

        const auditLogs = await guild.fetchAuditLogs(fetchOptions);

        const entries = auditLogs.entries.map((entry) => ({
          id: entry.id,
          action: AuditLogEvent[entry.action],
          executorId: entry.executorId,
          executorUsername: entry.executor?.username || null,
          targetId: entry.targetId,
          reason: entry.reason,
          timestamp: entry.createdAt.toISOString(),
        }));

        const output = {
          success: true,
          entries,
          totalCount: entries.length,
        };

        logger.info("Audit logs retrieved", {
          guildId,
          count: entries.length,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Retrieved ${entries.length} audit log entr${entries.length === 1 ? "y" : "ies"}`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to get audit logs", {
          error: errorMsg,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get audit logs: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // List Webhooks Tool
  server.registerTool(
    "list_webhooks",
    {
      title: "List Server Webhooks",
      description: "Get all webhooks in the server or a specific channel",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        channelId: z.string().optional().describe("Filter by channel ID (optional)"),
      },
      outputSchema: {
        success: z.boolean(),
        webhooks: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              channelId: z.string(),
              channelName: z.string().optional(),
              url: z.string(),
            }),
          )
          .optional(),
        totalCount: z.number().optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, channelId }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
          throw new PermissionDeniedError("ManageWebhooks", guildId);
        }

        let webhooks: Collection<string, Webhook>;
        if (channelId) {
          const channel = await guild.channels.fetch(channelId);
          if (!channel || !("fetchWebhooks" in channel)) {
            throw new Error("Invalid channel or channel doesn't support webhooks");
          }
          webhooks = await channel.fetchWebhooks();
        } else {
          webhooks = await guild.fetchWebhooks();
        }

        const webhookList = webhooks.map((webhook) => ({
          id: webhook.id,
          name: webhook.name,
          channelId: webhook.channelId,
          channelName: guild.channels.cache.get(webhook.channelId)?.name,
          url: webhook.url,
        }));

        const output = {
          success: true,
          webhooks: webhookList,
          totalCount: webhookList.length,
        };

        logger.info("Webhooks listed", { guildId, count: webhookList.length });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${webhookList.length} webhook(s)`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to list webhooks", {
          error: errorMsg,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to list webhooks: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Create Webhook Tool
  server.registerTool(
    "create_webhook",
    {
      title: "Create Webhook",
      description: "Create a new webhook for a channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        name: z.string().min(1).max(80).describe("Webhook name"),
        reason: z.string().optional().describe("Reason for creating webhook (audit log)"),
      },
      outputSchema: {
        success: z.boolean(),
        webhook: z
          .object({
            id: z.string(),
            name: z.string(),
            url: z.string(),
            token: z.string(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, name, reason }) => {
      try {
        const client = discordManager.getClient();

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !("createWebhook" in channel)) {
          throw new Error("Invalid channel or channel doesn't support webhooks");
        }

        if ("guild" in channel && channel.guild) {
          const botMember = await channel.guild.members.fetchMe();
          if (!botMember.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
            throw new PermissionDeniedError("ManageWebhooks", channel.guild.id);
          }
        }

        const webhook = await channel.createWebhook({
          name,
          reason,
        });

        const output = {
          success: true,
          webhook: {
            id: webhook.id,
            name: webhook.name,
            url: webhook.url,
            token: webhook.token || "",
          },
        };

        logger.info("Webhook created", { channelId, webhookId: webhook.id });

        return {
          content: [
            {
              type: "text" as const,
              text: `Webhook "${name}" created successfully`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create webhook", {
          error: errorMsg,
          channelId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create webhook: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Get Invites Tool
  server.registerTool(
    "get_invites",
    {
      title: "Get Server Invites",
      description: "List all active invite links for the server",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
      },
      outputSchema: {
        success: z.boolean(),
        invites: z
          .array(
            z.object({
              code: z.string(),
              url: z.string(),
              channelId: z.string(),
              channelName: z.string().optional(),
              inviterId: z.string().nullable(),
              inviterUsername: z.string().nullable(),
              uses: z.number(),
              maxUses: z.number(),
              expiresAt: z.string().nullable(),
              temporary: z.boolean(),
            }),
          )
          .optional(),
        totalCount: z.number().optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
          throw new PermissionDeniedError("ManageGuild", guildId);
        }

        const invites = await guild.invites.fetch();

        const inviteList = invites.map((invite) => ({
          code: invite.code,
          url: invite.url,
          channelId: invite.channelId || "",
          channelName: invite.channel?.name,
          inviterId: invite.inviterId,
          inviterUsername: invite.inviter?.username || null,
          uses: invite.uses || 0,
          maxUses: invite.maxUses || 0,
          expiresAt: invite.expiresAt?.toISOString() || null,
          temporary: invite.temporary || false,
        }));

        const output = {
          success: true,
          invites: inviteList,
          totalCount: inviteList.length,
        };

        logger.info("Invites retrieved", { guildId, count: inviteList.length });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${inviteList.length} active invite(s)`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to get invites", {
          error: errorMsg,
          guildId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get invites: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Create Invite Tool
  server.registerTool(
    "create_invite",
    {
      title: "Create Server Invite",
      description: "Create a new invite link for a channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID to create invite for"),
        maxAge: z
          .number()
          .int()
          .min(0)
          .max(604800)
          .optional()
          .describe("Invite expiration in seconds (0 = never, max 7 days)"),
        maxUses: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe("Max number of uses (0 = unlimited)"),
        temporary: z.boolean().optional().describe("Grant temporary membership"),
        unique: z
          .boolean()
          .optional()
          .default(true)
          .describe("Create a unique invite (don't reuse existing)"),
        reason: z.string().optional().describe("Reason for creating invite (audit log)"),
      },
      outputSchema: {
        success: z.boolean(),
        invite: z
          .object({
            code: z.string(),
            url: z.string(),
            expiresAt: z.string().nullable(),
            maxUses: z.number(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, maxAge, maxUses, temporary, unique = true, reason }) => {
      try {
        const client = discordManager.getClient();

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !("createInvite" in channel)) {
          throw new Error("Invalid channel or channel doesn't support invites");
        }

        if ("guild" in channel && channel.guild) {
          const botMember = await channel.guild.members.fetchMe();
          if (!botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
            throw new PermissionDeniedError("CreateInstantInvite", channel.guild.id);
          }
        }

        const invite = await channel.createInvite({
          maxAge,
          maxUses,
          temporary,
          unique,
          reason,
        });

        const output = {
          success: true,
          invite: {
            code: invite.code,
            url: invite.url,
            expiresAt: invite.expiresAt?.toISOString() || null,
            maxUses: invite.maxUses || 0,
          },
        };

        logger.info("Invite created", { channelId, inviteCode: invite.code });

        return {
          content: [
            {
              type: "text" as const,
              text: `Invite created: ${invite.url}`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create invite", {
          error: errorMsg,
          channelId,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create invite: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );
}
