import {
  ChannelType,
  type GuildChannel,
  PermissionFlagsBits,
  type TextChannel,
  type VoiceChannel,
} from "discord.js";
import { z } from "zod";
import type { DiscordClientManager } from "../discord/client.js";
import {
  ChannelNotFoundError,
  GuildNotFoundError,
  PermissionDeniedError,
} from "../errors/discord.js";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { getErrorMessage } from "../utils/errors.js";
import type { Logger } from "../utils/logger.js";

export function registerChannelTools(
  server: ToolRegistrationTarget,
  discordManager: DiscordClientManager,
  logger: Logger,
) {
  /**
   * Fetches a channel and validates it's a guild channel
   */
  async function fetchGuildChannel(
    client: ReturnType<typeof discordManager.getClient>,
    channelId: string,
  ) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      throw new ChannelNotFoundError(channelId);
    }
    if (!("guild" in channel) || !channel.guild) {
      throw new Error("This tool only works with server channels");
    }
    return channel;
  }

  /**
   * Checks if bot has ManageChannels permission
   */
  async function checkManageChannelsPermission(channel: {
    guild: {
      members: { fetchMe: () => Promise<{ permissions: { has: (p: bigint) => boolean } }> };
      id: string;
    };
  }) {
    const botMember = await channel.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new PermissionDeniedError("ManageChannels", channel.guild.id);
    }
  }

  // Create Text Channel Tool
  server.registerTool(
    "create_text_channel",
    {
      title: "Create Text Channel",
      description: "Create a new text channel in a Discord server",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        name: z.string().min(1).max(100).describe("Channel name"),
        topic: z.string().max(1024).optional().describe("Channel topic/description"),
        parent: z.string().optional().describe("Parent category ID"),
        nsfw: z.boolean().default(false).describe("Mark channel as NSFW"),
      },
      outputSchema: {
        success: z.boolean(),
        channel: z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.number(),
            position: z.number(),
            parentId: z.string().nullable(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, name, topic, parent, nsfw }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        // Check permissions
        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          throw new PermissionDeniedError("ManageChannels", guildId);
        }

        const channel = await guild.channels.create({
          name,
          type: ChannelType.GuildText,
          topic,
          parent: parent || undefined,
          nsfw,
        });

        const output = {
          success: true,
          channel: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            position: channel.position,
            parentId: channel.parentId,
          },
        };

        logger.info("Channel created", {
          guildId,
          channelId: channel.id,
          name,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Channel <#${channel.id}> created successfully`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create channel", {
          error: errorMsg,
          guildId,
          name,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create channel: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Delete Channel Tool
  server.registerTool(
    "delete_channel",
    {
      title: "Delete Channel",
      description: "Permanently delete a Discord channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID to delete"),
        reason: z.string().optional().describe("Reason for deletion (audit log)"),
      },
      outputSchema: {
        success: z.boolean(),
        deletedChannelId: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, reason }) => {
      try {
        const client = discordManager.getClient();

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
          throw new ChannelNotFoundError(channelId);
        }

        // Check permissions
        if ("guild" in channel && channel.guild) {
          const botMember = await channel.guild.members.fetchMe();
          if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            throw new PermissionDeniedError("ManageChannels", channel.guild.id);
          }
        }

        await channel.delete(reason);

        const output = {
          success: true,
          deletedChannelId: channelId,
        };

        logger.info("Channel deleted", { channelId, reason });

        return {
          content: [
            {
              type: "text" as const,
              text: `Channel ${channelId} deleted successfully`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to delete channel", {
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
              text: `Failed to delete channel: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Get Server Info Tool
  server.registerTool(
    "get_server_info",
    {
      title: "Get Server Information",
      description: "Retrieve detailed information about a Discord server",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
      },
      outputSchema: {
        success: z.boolean(),
        guild: z
          .object({
            id: z.string(),
            name: z.string(),
            ownerId: z.string(),
            memberCount: z.number(),
            channelCount: z.number(),
            roleCount: z.number(),
            description: z.string().nullable(),
            createdTimestamp: z.number(),
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

        const output = {
          success: true,
          guild: {
            id: guild.id,
            name: guild.name,
            ownerId: guild.ownerId,
            memberCount: guild.memberCount,
            channelCount: guild.channels.cache.size,
            roleCount: guild.roles.cache.size,
            description: guild.description,
            createdTimestamp: guild.createdTimestamp,
          },
        };

        logger.info("Server info retrieved", { guildId });

        return {
          content: [
            {
              type: "text" as const,
              text: `Server: ${guild.name}\nMembers: ${guild.memberCount}\nChannels: ${guild.channels.cache.size}`,
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

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get server info: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Create Voice Channel Tool
  server.registerTool(
    "create_voice_channel",
    {
      title: "Create Voice Channel",
      description: "Create a new voice channel in the server",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        name: z.string().min(1).max(100).describe("Channel name"),
        parent: z.string().optional().describe("Parent category ID"),
        userLimit: z
          .number()
          .int()
          .min(0)
          .max(99)
          .optional()
          .describe("User limit (0 = unlimited)"),
        bitrate: z
          .number()
          .int()
          .min(8000)
          .max(384000)
          .optional()
          .describe("Audio bitrate in bps (8000-384000)"),
      },
      outputSchema: {
        success: z.boolean(),
        channel: z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.number(),
            userLimit: z.number(),
            bitrate: z.number(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, name, parent, userLimit, bitrate }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          throw new PermissionDeniedError("ManageChannels", guildId);
        }

        const channel = await guild.channels.create({
          name,
          type: ChannelType.GuildVoice,
          parent: parent || undefined,
          userLimit: userLimit,
          bitrate: bitrate,
        });

        const output = {
          success: true,
          channel: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            userLimit: (channel as VoiceChannel).userLimit || 0,
            bitrate: (channel as VoiceChannel).bitrate || 64000,
          },
        };

        logger.info("Voice channel created", {
          guildId,
          channelId: channel.id,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Voice channel "${name}" created successfully (ID: ${channel.id})`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create voice channel", {
          error: errorMsg,
          guildId,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create voice channel: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Create Category Tool
  server.registerTool(
    "create_category",
    {
      title: "Create Channel Category",
      description: "Create a new category to organize channels",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        name: z.string().min(1).max(100).describe("Category name"),
      },
      outputSchema: {
        success: z.boolean(),
        category: z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.number(),
            position: z.number(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, name }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          throw new PermissionDeniedError("ManageChannels", guildId);
        }

        const category = await guild.channels.create({
          name,
          type: ChannelType.GuildCategory,
        });

        const output = {
          success: true,
          category: {
            id: category.id,
            name: category.name,
            type: category.type,
            position: category.position,
          },
        };

        logger.info("Category created", { guildId, categoryId: category.id });

        return {
          content: [
            {
              type: "text" as const,
              text: `Category "${name}" created successfully (ID: ${category.id})`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create category", {
          error: errorMsg,
          guildId,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create category: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Create Forum Channel Tool
  server.registerTool(
    "create_forum_channel",
    {
      title: "Create Forum Channel",
      description: "Create a new forum channel for threaded discussions",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        name: z.string().min(1).max(100).describe("Forum name"),
        topic: z.string().max(1024).optional().describe("Forum description"),
        parent: z.string().optional().describe("Parent category ID"),
        tags: z.array(z.string()).max(20).optional().describe("Forum tags (max 20)"),
      },
      outputSchema: {
        success: z.boolean(),
        forum: z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.number(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, name, topic, parent, tags }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          throw new PermissionDeniedError("ManageChannels", guildId);
        }

        const availableTags = tags ? tags.map((tag) => ({ name: tag })) : undefined;

        const forum = await guild.channels.create({
          name,
          type: ChannelType.GuildForum,
          topic: topic,
          parent: parent || undefined,
          availableTags,
        });

        const output = {
          success: true,
          forum: {
            id: forum.id,
            name: forum.name,
            type: forum.type,
          },
        };

        logger.info("Forum created", { guildId, forumId: forum.id });

        return {
          content: [
            {
              type: "text" as const,
              text: `Forum "${name}" created successfully (ID: ${forum.id})`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create forum", {
          error: errorMsg,
          guildId,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create forum: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Modify Channel Tool
  server.registerTool(
    "modify_channel",
    {
      title: "Modify Channel Settings",
      description: "Update channel name, topic, slowmode, or other settings",
      inputSchema: {
        channelId: z.string().describe("Channel ID to modify"),
        name: z.string().min(1).max(100).optional().describe("New channel name"),
        topic: z.string().max(1024).optional().describe("New channel topic"),
        nsfw: z.boolean().optional().describe("Mark channel as NSFW"),
        slowmode: z
          .number()
          .int()
          .min(0)
          .max(21600)
          .optional()
          .describe("Slowmode delay in seconds (0-21600)"),
        reason: z.string().optional().describe("Reason for modification (audit log)"),
      },
      outputSchema: {
        success: z.boolean(),
        channel: z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, name, topic, nsfw, slowmode, reason }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchGuildChannel(client, channelId);
        await checkManageChannelsPermission(channel);

        const updateOptions: {
          name?: string;
          topic?: string;
          nsfw?: boolean;
          rateLimitPerUser?: number;
          reason?: string;
        } = {};
        if (name !== undefined) updateOptions.name = name;
        if (topic !== undefined) updateOptions.topic = topic;
        if (nsfw !== undefined) updateOptions.nsfw = nsfw;
        if (slowmode !== undefined) updateOptions.rateLimitPerUser = slowmode;
        if (reason !== undefined) updateOptions.reason = reason;

        const updatedChannel = await (channel as TextChannel).edit(updateOptions);

        logger.info("Channel modified", { channelId, reason });

        return {
          content: [
            {
              type: "text" as const,
              text: `Channel "${updatedChannel.name}" modified successfully`,
            },
          ],
          structuredContent: {
            success: true,
            channel: { id: updatedChannel.id, name: updatedChannel.name },
          },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to modify channel", { error: errorMsg, channelId });

        return {
          content: [{ type: "text" as const, text: `Failed to modify channel: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Create Thread Tool
  server.registerTool(
    "create_thread",
    {
      title: "Create Discussion Thread",
      description: "Create a new thread in a channel or from a message",
      inputSchema: {
        channelId: z.string().describe("Channel ID to create thread in"),
        name: z.string().min(1).max(100).describe("Thread name"),
        message: z.string().optional().describe("Initial message content for thread"),
        autoArchiveDuration: z
          .enum(["60", "1440", "4320", "10080"])
          .optional()
          .describe("Auto-archive after inactivity: 60=1hr, 1440=24hr, 4320=3d, 10080=7d"),
      },
      outputSchema: {
        success: z.boolean(),
        thread: z
          .object({
            id: z.string(),
            name: z.string(),
            parentId: z.string(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, name, message, autoArchiveDuration }) => {
      try {
        const client = discordManager.getClient();
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) throw new ChannelNotFoundError(channelId);
        if (!("threads" in channel)) throw new Error("This channel does not support threads");

        const thread = await (channel as TextChannel).threads.create({
          name,
          autoArchiveDuration: autoArchiveDuration ? parseInt(autoArchiveDuration, 10) : 60,
          reason: "Thread created via MCP",
        });

        if (message) await thread.send(message);
        logger.info("Thread created", { channelId, threadId: thread.id });

        return {
          content: [{ type: "text" as const, text: `Thread "${name}" created (ID: ${thread.id})` }],
          structuredContent: {
            success: true,
            thread: { id: thread.id, name: thread.name, parentId: thread.parentId || channelId },
          },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create thread", { error: errorMsg, channelId });

        return {
          content: [{ type: "text" as const, text: `Failed to create thread: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Archive Thread Tool
  server.registerTool(
    "archive_thread",
    {
      title: "Archive Thread",
      description: "Archive (lock) a thread",
      inputSchema: {
        threadId: z.string().describe("Thread ID to archive"),
        locked: z
          .boolean()
          .optional()
          .default(true)
          .describe("Lock thread (prevents new messages)"),
      },
      outputSchema: {
        success: z.boolean(),
        threadId: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ threadId, locked = true }) => {
      try {
        const client = discordManager.getClient();

        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread || !thread.isThread()) {
          throw new Error(`Thread ${threadId} not found or is not a thread`);
        }

        if (thread.guild) {
          const botMember = await thread.guild.members.fetchMe();
          if (!botMember.permissions.has(PermissionFlagsBits.ManageThreads)) {
            throw new PermissionDeniedError("ManageThreads", thread.guild.id);
          }
        }

        await thread.setArchived(true);
        if (locked) {
          await thread.setLocked(true);
        }

        const output = {
          success: true,
          threadId,
        };

        logger.info("Thread archived", { threadId, locked });

        return {
          content: [
            {
              type: "text" as const,
              text: `Thread archived successfully${locked ? " and locked" : ""}`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to archive thread", {
          error: errorMsg,
          threadId,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to archive thread: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // List Channels Tool
  server.registerTool(
    "list_channels",
    {
      title: "List Server Channels",
      description: "Get all channels in the server organized by type",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        type: z
          .enum(["text", "voice", "category", "forum", "all"])
          .optional()
          .default("all")
          .describe("Filter by channel type"),
      },
      outputSchema: {
        success: z.boolean(),
        channels: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              type: z.string(),
              position: z.number(),
              parentId: z.string().nullable(),
            }),
          )
          .optional(),
        totalCount: z.number().optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, type = "all" }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const channels = await guild.channels.fetch();
        let filteredChannels = Array.from(channels.values()).filter(
          (c): c is NonNullable<typeof c> => c !== null,
        );

        // Filter by type
        if (type !== "all") {
          const typeMap: Record<string, ChannelType> = {
            text: ChannelType.GuildText,
            voice: ChannelType.GuildVoice,
            category: ChannelType.GuildCategory,
            forum: ChannelType.GuildForum,
          };
          filteredChannels = filteredChannels.filter((c) => c.type === typeMap[type]);
        }

        const channelList = filteredChannels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: ChannelType[channel.type],
          position: channel.position,
          parentId: channel.parentId,
        }));

        // Sort by position
        channelList.sort((a, b) => a.position - b.position);

        const output = {
          success: true,
          channels: channelList,
          totalCount: channelList.length,
        };

        logger.info("Channels listed", {
          guildId,
          type,
          count: channelList.length,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${channelList.length} channel(s) in server`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to list channels", {
          error: errorMsg,
          guildId,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to list channels: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Create Stage Channel Tool
  server.registerTool(
    "create_stage_channel",
    {
      title: "Create Stage Channel",
      description: "Create a stage voice channel for presentations and events",
      inputSchema: {
        guildId: z.string().describe("Guild ID"),
        name: z.string().min(1).max(100).describe("Stage channel name"),
        topic: z.string().max(1024).optional().describe("Stage topic"),
        parent: z.string().optional().describe("Parent category ID"),
      },
      outputSchema: {
        success: z.boolean(),
        channel: z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.number(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ guildId, name, topic, parent }) => {
      try {
        const client = discordManager.getClient();

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          throw new GuildNotFoundError(guildId);
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          throw new PermissionDeniedError("ManageChannels", guildId);
        }

        const channel = await guild.channels.create({
          name,
          type: ChannelType.GuildStageVoice,
          topic: topic,
          parent: parent || undefined,
        });

        const output = {
          success: true,
          channel: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
          },
        };

        logger.info("Stage channel created", {
          guildId,
          channelId: channel.id,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Stage channel "${name}" created successfully (ID: ${channel.id})`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to create stage channel", {
          error: errorMsg,
          guildId,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create stage channel: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Set Channel Permissions Tool
  server.registerTool(
    "set_channel_permissions",
    {
      title: "Set Channel Permissions",
      description: "Override permissions for a role or member on a specific channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        targetId: z.string().describe("Role ID or User ID to set permissions for"),
        targetType: z.enum(["role", "member"]).describe("Whether target is a role or member"),
        allow: z.array(z.string()).optional().describe("Array of permission names to allow"),
        deny: z.array(z.string()).optional().describe("Array of permission names to deny"),
      },
      outputSchema: {
        success: z.boolean(),
        channelId: z.string().optional(),
        targetId: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, targetId, targetType, allow, deny }) => {
      try {
        const client = discordManager.getClient();

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
          throw new ChannelNotFoundError(channelId);
        }

        // Check if channel is in a guild
        if (!("guild" in channel) || !channel.guild) {
          throw new Error("Channel is not in a guild");
        }

        const botMember = await channel.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          throw new PermissionDeniedError("ManageChannels", channel.guild.id);
        }

        // Apply permission overwrite using edit method which accepts allow/deny arrays
        await (channel as TextChannel).permissionOverwrites.edit(targetId, {
          ...(allow && allow.length > 0 ? Object.fromEntries(allow.map((p) => [p, true])) : {}),
          ...(deny && deny.length > 0 ? Object.fromEntries(deny.map((p) => [p, false])) : {}),
        });

        const output = {
          success: true,
          channelId: channel.id,
          targetId,
        };

        logger.info("Channel permissions set", {
          channelId,
          targetId,
          targetType,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Permissions set for ${targetType} ${targetId} on channel ${channelId}`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to set channel permissions", {
          error: errorMsg,
          channelId,
          targetId,
        });

        const output = {
          success: false,
          error: errorMsg,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to set channel permissions: ${errorMsg}`,
            },
          ],
          structuredContent: output,
          isError: true,
        };
      }
    },
  );

  // Find Threads Tool
  server.registerTool(
    "find_threads",
    {
      title: "Find Threads in Forum",
      description: "Search for threads in a forum channel by name or list all threads",
      inputSchema: {
        forumId: z.string().describe("Forum channel ID"),
        name: z.string().optional().describe("Search for threads with this name (partial match)"),
        archived: z.boolean().optional().describe("Include archived threads"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(50)
          .describe("Max number of threads to return"),
      },
      outputSchema: {
        success: z.boolean(),
        threads: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              ownerId: z.string(),
              messageCount: z.number(),
              memberCount: z.number(),
              createdAt: z.string(),
              archived: z.boolean(),
              locked: z.boolean(),
              lastMessageAt: z.string().nullable(),
            }),
          )
          .optional(),
        totalCount: z.number().optional(),
        error: z.string().optional(),
      },
    },
    async ({ forumId, name, archived = false, limit = 50 }) => {
      try {
        const client = discordManager.getClient();
        const forum = await client.channels.fetch(forumId).catch(() => null);
        if (!forum || forum.type !== ChannelType.GuildForum)
          throw new Error(`Channel ${forumId} is not a forum channel`);

        // Fetch threads
        const threadsData = await forum.threads.fetchActive();
        let threads = Array.from(threadsData.threads.values());
        if (archived)
          threads = threads.concat(
            Array.from((await forum.threads.fetchArchived()).threads.values()),
          );
        if (name)
          threads = threads.filter((t) => t.name.toLowerCase().includes(name.toLowerCase()));
        threads = threads.slice(0, limit);

        const threadList = threads.map((thread) => ({
          id: thread.id,
          name: thread.name,
          ownerId: thread.ownerId || "",
          messageCount: thread.messageCount || 0,
          memberCount: thread.memberCount || 0,
          createdAt: thread.createdAt?.toISOString() || new Date().toISOString(),
          archived: thread.archived || false,
          locked: thread.locked || false,
          lastMessageAt: thread.lastMessage?.createdAt?.toISOString() || null,
        }));

        logger.info("Threads found", { forumId, count: threadList.length, name });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${threadList.length} thread(s) in forum${name ? ` matching "${name}"` : ""}`,
            },
          ],
          structuredContent: { success: true, threads: threadList, totalCount: threadList.length },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to find threads", { error: errorMsg, forumId });

        return {
          content: [{ type: "text" as const, text: `Failed to find threads: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Get Channel Details Tool
  server.registerTool(
    "get_channel_details",
    {
      title: "Get Channel Details",
      description:
        "Get detailed information about a channel including type, permissions, and capabilities",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
      },
      outputSchema: {
        success: z.boolean(),
        channel: z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.number(),
            typeName: z.string(),
            topic: z.string().nullable(),
            nsfw: z.boolean().optional(),
            parentId: z.string().nullable(),
            parentName: z.string().nullable(),
            position: z.number(),
            rateLimitPerUser: z.number().optional(),
            supportsThreads: z.boolean(),
            supportsMessages: z.boolean(),
            isTextBased: z.boolean(),
            isForum: z.boolean(),
            isVoice: z.boolean(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchGuildChannel(client, channelId);

        // Determine channel capabilities
        const supportsThreads =
          channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.GuildAnnouncement ||
          channel.type === ChannelType.GuildForum;
        const isForum = channel.type === ChannelType.GuildForum;
        const isVoice =
          channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;

        // Get parent channel name if exists
        let parentName: string | null = null;
        if ("parentId" in channel && channel.parentId) {
          const parent = await channel.guild.channels.fetch(channel.parentId).catch(() => null);
          parentName = parent?.name || null;
        }

        const guildChannel = channel as GuildChannel & {
          topic?: string | null;
          nsfw?: boolean;
          rateLimitPerUser?: number;
        };
        const channelDetails = {
          id: guildChannel.id,
          name: guildChannel.name || guildChannel.id,
          type: guildChannel.type,
          typeName: ChannelType[guildChannel.type],
          topic: guildChannel.topic || null,
          nsfw: guildChannel.nsfw ?? false,
          parentId: guildChannel.parentId || null,
          parentName,
          position: guildChannel.position ?? 0,
          rateLimitPerUser: guildChannel.rateLimitPerUser,
          supportsThreads,
          supportsMessages: channel.isTextBased(),
          isTextBased: channel.isTextBased(),
          isForum,
          isVoice,
        };

        logger.info("Channel details retrieved", { channelId });

        return {
          content: [
            {
              type: "text" as const,
              text: `Channel: ${guildChannel.name || guildChannel.id} (${ChannelType[channel.type]})`,
            },
          ],
          structuredContent: { success: true, channel: channelDetails },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to get channel details", { error: errorMsg, channelId });

        return {
          content: [{ type: "text" as const, text: `Failed to get channel details: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );
}
