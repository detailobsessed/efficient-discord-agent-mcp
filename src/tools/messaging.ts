import {
  type Client,
  type Message,
  PermissionFlagsBits,
  type PermissionResolvable,
  type TextBasedChannel,
} from "discord.js";
import { z } from "zod";
import type { DiscordClientManager } from "../discord/client.js";
import {
  ChannelNotFoundError,
  MessageNotFoundError,
  PermissionDeniedError,
} from "../errors/discord.js";
import type { ToolRegistrationTarget } from "../registry/tool-adapter.js";
import { embedSchema, messageSchema } from "../types/schemas.js";
import { getErrorMessage } from "../utils/errors.js";
import type { Logger } from "../utils/logger.js";

export function registerMessagingTools(
  server: ToolRegistrationTarget,
  discordManager: DiscordClientManager,
  logger: Logger,
) {
  /**
   * Fetches a text-based channel and validates it exists
   */
  async function fetchTextChannel(client: Client, channelId: string): Promise<TextBasedChannel> {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      throw new ChannelNotFoundError(channelId);
    }
    return channel;
  }

  /**
   * Checks if the bot has the required permission in a channel
   */
  function checkChannelPermission(
    channel: TextBasedChannel,
    client: Client,
    permission: PermissionResolvable,
    permissionName: string,
  ): void {
    if ("guild" in channel && channel.guild) {
      if (!client.user) throw new Error("Client user not available");
      const permissions = channel.permissionsFor(client.user);
      if (!permissions?.has(permission)) {
        throw new PermissionDeniedError(permissionName, channel.id);
      }
    }
  }

  /**
   * Checks send message permissions including thread permissions
   */
  function checkSendPermissions(channel: TextBasedChannel, client: Client): void {
    checkChannelPermission(channel, client, PermissionFlagsBits.SendMessages, "SendMessages");
    if (channel.isThread()) {
      checkChannelPermission(
        channel,
        client,
        PermissionFlagsBits.SendMessagesInThreads,
        "SendMessagesInThreads",
      );
    }
  }

  /**
   * Fetches a message from a channel
   */
  async function fetchMessage(
    channel: TextBasedChannel,
    messageId: string,
    channelId: string,
  ): Promise<Message> {
    if (!("messages" in channel)) {
      throw new ChannelNotFoundError(channelId);
    }
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      throw new MessageNotFoundError(messageId);
    }
    return message;
  }

  /**
   * Embed payload interface for Discord embeds
   */
  interface EmbedPayload {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    author?: { name: string; url?: string; icon_url?: string };
    footer?: { text: string; icon_url?: string };
    image?: { url: string };
    thumbnail?: { url: string };
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp?: string;
  }

  /**
   * Builds an embed payload from input
   */
  function buildEmbedPayload(embed: {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    image?: string;
    thumbnail?: string;
    author?: { name: string; url?: string; iconURL?: string };
    footer?: { text: string; iconURL?: string };
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp?: boolean;
  }): EmbedPayload {
    return {
      ...(embed.title && { title: embed.title }),
      ...(embed.description && { description: embed.description }),
      ...(embed.url && { url: embed.url }),
      ...(embed.color !== undefined && { color: embed.color }),
      ...(embed.author && {
        author: { name: embed.author.name, url: embed.author.url, icon_url: embed.author.iconURL },
      }),
      ...(embed.footer && { footer: { text: embed.footer.text, icon_url: embed.footer.iconURL } }),
      ...(embed.image && { image: { url: embed.image } }),
      ...(embed.thumbnail && { thumbnail: { url: embed.thumbnail } }),
      ...(embed.fields && { fields: embed.fields }),
      ...(embed.timestamp && { timestamp: new Date().toISOString() }),
    };
  }

  /**
   * Formats a message for API response
   */
  function formatMessage(msg: Message) {
    return {
      id: msg.id,
      content: msg.content,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        discriminator: msg.author.discriminator,
        bot: msg.author.bot,
        avatar: msg.author.avatar,
      },
      timestamp: msg.createdAt.toISOString(),
      editedTimestamp: msg.editedAt?.toISOString() || null,
      attachments: msg.attachments.map((att) => ({
        id: att.id,
        filename: att.name,
        size: att.size,
        url: att.url,
        contentType: att.contentType || undefined,
      })),
      embeds: msg.embeds.map((embed) => ({
        title: embed.title || undefined,
        description: embed.description || undefined,
        url: embed.url || undefined,
        color: embed.color || undefined,
        timestamp: embed.timestamp ? new Date(embed.timestamp).toISOString() : undefined,
      })),
      reactions: msg.reactions.cache.map((reaction) => ({
        emoji: reaction.emoji.name || reaction.emoji.id || "",
        count: reaction.count,
        me: reaction.me,
      })),
    };
  }

  // Send Message Tool
  server.registerTool(
    "send_message",
    {
      title: "Send Discord Message",
      description: "Send a message to a Discord channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID (snowflake) or name"),
        content: z.string().max(2000).describe("Message content"),
        embeds: z.array(embedSchema).max(10).optional().describe("Optional embeds (max 10)"),
      },
      outputSchema: {
        success: z.boolean(),
        messageId: z.string().optional(),
        channelId: z.string().optional(),
        timestamp: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, content, embeds }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        checkSendPermissions(channel, client);

        if (!("send" in channel)) {
          throw new ChannelNotFoundError(channelId);
        }

        const message = await channel.send({
          content,
          embeds: embeds || [],
        });

        const output = {
          success: true,
          messageId: message.id,
          channelId: channel.id,
          timestamp: message.createdAt.toISOString(),
        };

        logger.info("Message sent", { channelId, messageId: message.id });

        return {
          content: [
            {
              type: "text" as const,
              text: `Message sent successfully to <#${channel.id}>`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to send message", {
          error: errorMsg,
          channelId,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to send message: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Read Messages Tool
  server.registerTool(
    "read_messages",
    {
      title: "Read Discord Messages",
      description: "Retrieve recent message history from a channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID or name"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Number of messages to retrieve"),
        before: z.string().optional().describe("Get messages before this message ID"),
        after: z.string().optional().describe("Get messages after this message ID"),
      },
      outputSchema: {
        success: z.boolean(),
        messages: z.array(messageSchema).optional(),
        hasMore: z.boolean().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, limit, before, after }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        checkChannelPermission(channel, client, PermissionFlagsBits.ViewChannel, "ViewChannel");
        checkChannelPermission(
          channel,
          client,
          PermissionFlagsBits.ReadMessageHistory,
          "ReadMessageHistory",
        );

        const messages = await channel.messages.fetch({ limit, before, after });
        const formattedMessages = messages.map(formatMessage);

        const output = {
          success: true,
          messages: formattedMessages,
          hasMore: messages.size === limit,
        };

        logger.info("Messages retrieved", { channelId, count: messages.size });

        return {
          content: [
            {
              type: "text" as const,
              text: `Retrieved ${messages.size} message(s) from <#${channel.id}>`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to read messages", { error: errorMsg, channelId });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to read messages: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Delete Message Tool
  server.registerTool(
    "delete_message",
    {
      title: "Delete Discord Message",
      description: "Delete a specific message from a channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID to delete"),
        reason: z.string().optional().describe("Reason for deletion (audit log)"),
      },
      outputSchema: {
        success: z.boolean(),
        deletedMessageId: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, messageId, reason }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        const message = await fetchMessage(channel, messageId, channelId);

        // Check permissions (bot can always delete own messages)
        if (message.author.id !== client.user?.id) {
          checkChannelPermission(
            channel,
            client,
            PermissionFlagsBits.ManageMessages,
            "ManageMessages",
          );
        }

        await message.delete();

        logger.info("Message deleted", { channelId, messageId, reason });

        return {
          content: [
            {
              type: "text" as const,
              text: `Message ${messageId} deleted successfully`,
            },
          ],
          structuredContent: { success: true, deletedMessageId: messageId },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to delete message", { error: errorMsg, channelId, messageId });

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to delete message: ${errorMsg}`,
            },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Add Reaction Tool
  server.registerTool(
    "add_reaction",
    {
      title: "Add Reaction to Message",
      description: "Add an emoji reaction to a message",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID"),
        emoji: z.string().describe("Unicode emoji or custom emoji format (name:id)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, messageId, emoji }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        const message = await fetchMessage(channel, messageId, channelId);
        checkChannelPermission(channel, client, PermissionFlagsBits.AddReactions, "AddReactions");

        await message.react(emoji);

        logger.info("Reaction added", { channelId, messageId, emoji });

        return {
          content: [{ type: "text" as const, text: `Reaction ${emoji} added to message` }],
          structuredContent: { success: true },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to add reaction", { error: errorMsg, channelId, messageId, emoji });

        return {
          content: [{ type: "text" as const, text: `Failed to add reaction: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Edit Message Tool
  server.registerTool(
    "edit_message",
    {
      title: "Edit Discord Message",
      description: "Edit an existing message sent by the bot",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID to edit"),
        content: z.string().max(2000).optional().describe("New message content"),
        embeds: z.array(embedSchema).max(10).optional().describe("New embeds (max 10)"),
      },
      outputSchema: {
        success: z.boolean(),
        messageId: z.string().optional(),
        editedTimestamp: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, messageId, content, embeds }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        const message = await fetchMessage(channel, messageId, channelId);

        // Check if message was sent by the bot
        if (message.author.id !== client.user?.id) {
          throw new Error("Can only edit messages sent by the bot.");
        }

        const editedMessage = await message.edit({
          content: content || message.content,
          embeds: embeds || message.embeds,
        });

        logger.info("Message edited", { channelId, messageId });

        return {
          content: [{ type: "text" as const, text: `Message ${messageId} edited successfully` }],
          structuredContent: {
            success: true,
            messageId: editedMessage.id,
            editedTimestamp: editedMessage.editedAt?.toISOString(),
          },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to edit message", { error: errorMsg, channelId, messageId });

        return {
          content: [{ type: "text" as const, text: `Failed to edit message: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Send Message with File Tool
  server.registerTool(
    "send_message_with_file",
    {
      title: "Send Discord Message with File",
      description: "Send a message with file attachment to a Discord channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID (snowflake) or name"),
        content: z
          .string()
          .max(2000)
          .optional()
          .describe("Message content (optional if file provided)"),
        filePath: z.string().describe("Absolute path to file to attach"),
        fileName: z
          .string()
          .optional()
          .describe("Custom filename (optional, uses original if not provided)"),
        embeds: z.array(embedSchema).max(10).optional().describe("Optional embeds (max 10)"),
      },
      outputSchema: {
        success: z.boolean(),
        messageId: z.string().optional(),
        channelId: z.string().optional(),
        timestamp: z.string().optional(),
        attachmentUrl: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, content, filePath, fileName, embeds }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        checkSendPermissions(channel, client);
        checkChannelPermission(channel, client, PermissionFlagsBits.AttachFiles, "AttachFiles");

        const fs = await import("fs");
        const path = await import("path");

        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        if (!("send" in channel)) {
          throw new ChannelNotFoundError(channelId);
        }

        const message = await channel.send({
          content: content || undefined,
          embeds: embeds || [],
          files: [{ attachment: filePath, name: fileName || path.basename(filePath) }],
        });

        const attachmentUrl = message.attachments.first()?.url || "No attachment URL";

        logger.info("Message with file sent", { channelId, messageId: message.id, filePath });

        return {
          content: [{ type: "text" as const, text: `Message with file sent to <#${channel.id}>` }],
          structuredContent: {
            success: true,
            messageId: message.id,
            channelId: channel.id,
            timestamp: message.createdAt.toISOString(),
            attachmentUrl,
          },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to send message with file", { error: errorMsg, channelId, filePath });

        return {
          content: [
            { type: "text" as const, text: `Failed to send message with file: ${errorMsg}` },
          ],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Pin Message Tool
  server.registerTool(
    "pin_message",
    {
      title: "Pin Discord Message",
      description: "Pin a message to the channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID to pin"),
        reason: z.string().optional().describe("Reason for pinning (audit log)"),
      },
      outputSchema: {
        success: z.boolean(),
        pinnedMessageId: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, messageId, reason }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        const message = await fetchMessage(channel, messageId, channelId);
        checkChannelPermission(
          channel,
          client,
          PermissionFlagsBits.ManageMessages,
          "ManageMessages",
        );

        await message.pin(reason);

        logger.info("Message pinned", { channelId, messageId, reason });

        return {
          content: [{ type: "text" as const, text: `Message ${messageId} pinned successfully` }],
          structuredContent: { success: true, pinnedMessageId: messageId },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to pin message", { error: errorMsg, channelId, messageId });

        return {
          content: [{ type: "text" as const, text: `Failed to pin message: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Send Rich Message Tool
  server.registerTool(
    "send_rich_message",
    {
      title: "Send Rich Discord Message",
      description:
        "Send a richly formatted message with embeds, images, and advanced formatting. Supports full Discord markdown and embed features.",
      inputSchema: {
        channelId: z.string().describe("Channel ID (snowflake) or name"),
        content: z
          .string()
          .max(2000)
          .optional()
          .describe(
            "Message content with Discord markdown formatting (bold: **text**, italic: *text*, underline: __text__, strikethrough: ~~text~~, code: `code`, code block: ```language\\ncode\\n```)",
          ),
        embed: z
          .object({
            title: z.string().max(256).optional(),
            description: z.string().max(4096).optional(),
            url: z.string().url().optional(),
            color: z
              .number()
              .int()
              .min(0)
              .max(0xffffff)
              .optional()
              .describe("Hex color as integer (e.g., 0x00ff00 for green)"),
            image: z.string().url().optional().describe("Large image URL at bottom of embed"),
            thumbnail: z
              .string()
              .url()
              .optional()
              .describe("Small image URL at top-right of embed"),
            author: z
              .object({
                name: z.string().max(256),
                url: z.string().url().optional(),
                iconURL: z.string().url().optional(),
              })
              .optional(),
            footer: z
              .object({
                text: z.string().max(2048),
                iconURL: z.string().url().optional(),
              })
              .optional(),
            fields: z
              .array(
                z.object({
                  name: z.string().max(256),
                  value: z.string().max(1024),
                  inline: z.boolean().optional(),
                }),
              )
              .max(25)
              .optional(),
            timestamp: z.boolean().optional().describe("Add current timestamp"),
          })
          .optional()
          .describe("Rich embed object with images and formatting"),
      },
      outputSchema: {
        success: z.boolean(),
        messageId: z.string().optional(),
        channelId: z.string().optional(),
        timestamp: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, content, embed }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        checkSendPermissions(channel, client);
        if (embed) {
          checkChannelPermission(channel, client, PermissionFlagsBits.EmbedLinks, "EmbedLinks");
        }

        if (!("send" in channel)) {
          throw new ChannelNotFoundError(channelId);
        }

        const embedPayload = embed ? [buildEmbedPayload(embed)] : [];
        const message = await channel.send({ content: content || undefined, embeds: embedPayload });

        logger.info("Rich message sent", { channelId, messageId: message.id });

        return {
          content: [{ type: "text" as const, text: `Rich message sent to <#${channel.id}>` }],
          structuredContent: {
            success: true,
            messageId: message.id,
            channelId: channel.id,
            timestamp: message.createdAt.toISOString(),
          },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to send rich message", { error: errorMsg, channelId });

        return {
          content: [{ type: "text" as const, text: `Failed to send rich message: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Unpin Message Tool
  server.registerTool(
    "unpin_message",
    {
      title: "Unpin Discord Message",
      description: "Unpin a message from the channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID to unpin"),
        reason: z.string().optional().describe("Reason for unpinning (audit log)"),
      },
      outputSchema: {
        success: z.boolean(),
        unpinnedMessageId: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, messageId, reason }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        const message = await fetchMessage(channel, messageId, channelId);
        checkChannelPermission(
          channel,
          client,
          PermissionFlagsBits.ManageMessages,
          "ManageMessages",
        );

        await message.unpin(reason);

        logger.info("Message unpinned", { channelId, messageId, reason });

        return {
          content: [{ type: "text" as const, text: `Message ${messageId} unpinned successfully` }],
          structuredContent: { success: true, unpinnedMessageId: messageId },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to unpin message", { error: errorMsg, channelId, messageId });

        return {
          content: [{ type: "text" as const, text: `Failed to unpin message: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Get Message Tool
  server.registerTool(
    "get_message",
    {
      title: "Get Message",
      description: "Get a specific message by ID from a channel",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID to retrieve"),
      },
      outputSchema: {
        success: z.boolean(),
        message: z
          .object({
            id: z.string(),
            content: z.string(),
            authorId: z.string(),
            authorUsername: z.string(),
            authorBot: z.boolean(),
            timestamp: z.string(),
            editedTimestamp: z.string().nullable(),
            attachments: z.array(
              z.object({
                id: z.string(),
                filename: z.string(),
                url: z.string(),
                size: z.number(),
              }),
            ),
            embeds: z.number(),
            reactions: z.array(
              z.object({
                emoji: z.string(),
                count: z.number(),
              }),
            ),
            replyTo: z.string().nullable(),
            pinned: z.boolean(),
          })
          .optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, messageId }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        const message = await fetchMessage(channel, messageId, channelId);

        const messageData = {
          id: message.id,
          content: message.content,
          authorId: message.author.id,
          authorUsername: message.author.username,
          authorBot: message.author.bot,
          timestamp: message.createdAt.toISOString(),
          editedTimestamp: message.editedAt?.toISOString() || null,
          attachments: message.attachments.map((a) => ({
            id: a.id,
            filename: a.name,
            url: a.url,
            size: a.size,
          })),
          embeds: message.embeds.length,
          reactions: message.reactions.cache.map((r) => ({
            emoji: r.emoji.toString(),
            count: r.count || 0,
          })),
          replyTo: message.reference?.messageId || null,
          pinned: message.pinned,
        };

        logger.info("Message retrieved", { channelId, messageId });

        const preview =
          message.content.substring(0, 200) + (message.content.length > 200 ? "..." : "");
        return {
          content: [{ type: "text" as const, text: `**${message.author.username}**: ${preview}` }],
          structuredContent: { success: true, message: messageData },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to get message", { error: errorMsg, channelId, messageId });

        return {
          content: [{ type: "text" as const, text: `Failed to get message: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Reply to Message Tool
  server.registerTool(
    "reply_to_message",
    {
      title: "Reply to Message",
      description: "Reply to a specific message, creating a thread reference",
      inputSchema: {
        channelId: z.string().describe("Channel ID"),
        messageId: z.string().describe("Message ID to reply to"),
        content: z.string().max(2000).describe("Reply content"),
        mention: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to mention the original author"),
      },
      outputSchema: {
        success: z.boolean(),
        messageId: z.string().optional(),
        replyToId: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, messageId, content, mention = true }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);
        const originalMessage = await fetchMessage(channel, messageId, channelId);
        checkSendPermissions(channel, client);

        const reply = await originalMessage.reply({
          content,
          allowedMentions: { repliedUser: mention },
        });

        logger.info("Reply sent", { channelId, messageId: reply.id, replyToId: messageId });

        return {
          content: [
            { type: "text" as const, text: `Replied to message ${messageId} successfully` },
          ],
          structuredContent: { success: true, messageId: reply.id, replyToId: messageId },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to reply to message", { error: errorMsg, channelId, messageId });

        return {
          content: [{ type: "text" as const, text: `Failed to reply: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );

  // Search Messages Tool
  server.registerTool(
    "search_messages",
    {
      title: "Search Messages",
      description: "Search for messages in a channel by content, author, or other criteria",
      inputSchema: {
        channelId: z.string().describe("Channel ID to search in"),
        query: z.string().optional().describe("Text to search for in message content"),
        authorId: z.string().optional().describe("Filter by author ID"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(25)
          .describe("Number of messages to search through (max 100)"),
        before: z.string().optional().describe("Search before this message ID"),
        after: z.string().optional().describe("Search after this message ID"),
      },
      outputSchema: {
        success: z.boolean(),
        messages: z
          .array(
            z.object({
              id: z.string(),
              content: z.string(),
              authorId: z.string(),
              authorUsername: z.string(),
              timestamp: z.string(),
            }),
          )
          .optional(),
        totalFound: z.number().optional(),
        error: z.string().optional(),
      },
    },
    async ({ channelId, query, authorId, limit = 25, before, after }) => {
      try {
        const client = discordManager.getClient();
        const channel = await fetchTextChannel(client, channelId);

        const fetchOptions: { limit: number; before?: string; after?: string } = { limit };
        if (before) fetchOptions.before = before;
        if (after) fetchOptions.after = after;

        const messagesResult = await channel.messages.fetch(fetchOptions);
        const messagesArray: Message[] =
          messagesResult instanceof Map ? Array.from(messagesResult.values()) : [messagesResult];

        // Filter messages by query and author
        let filtered = messagesArray;
        if (query) {
          const lowerQuery = query.toLowerCase();
          filtered = filtered.filter((m) => m.content.toLowerCase().includes(lowerQuery));
        }
        if (authorId) {
          filtered = filtered.filter((m) => m.author.id === authorId);
        }

        const results = filtered.map((m) => ({
          id: m.id,
          content: m.content.substring(0, 500),
          authorId: m.author.id,
          authorUsername: m.author.username,
          timestamp: m.createdAt.toISOString(),
        }));

        logger.info("Messages searched", { channelId, query, found: results.length });

        const text = `Found ${results.length} message(s)${query ? ` matching "${query}"` : ""}`;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { success: true, messages: results, totalFound: results.length },
        };
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error("Failed to search messages", { error: errorMsg, channelId });

        return {
          content: [{ type: "text" as const, text: `Failed to search messages: ${errorMsg}` }],
          structuredContent: { success: false, error: errorMsg },
          isError: true,
        };
      }
    },
  );
}
