import type { Client, Guild, GuildMember } from "discord.js";
import { GuildNotFoundError } from "../errors/discord.js";

/**
 * Gets the bot's user ID, throwing if not logged in
 * @param client Discord client instance
 * @returns Bot user ID
 * @throws Error if bot is not logged in
 */
export function getBotUserId(client: Client): string {
  if (!client.user?.id) {
    throw new Error("Bot is not logged in");
  }
  return client.user.id;
}

/**
 * Gets the bot member in a guild
 * @param guild Guild to get bot member from
 * @param client Discord client instance
 * @returns Bot's GuildMember object
 * @throws Error if bot is not logged in or not in guild
 */
export async function getBotMember(guild: Guild, client: Client): Promise<GuildMember> {
  const botUserId = getBotUserId(client);
  return guild.members.fetch(botUserId);
}

/**
 * Validates that the bot has access to a guild and fetches it
 * @param client Discord client instance
 * @param guildId Guild ID to validate
 * @returns Guild object if accessible
 * @throws GuildNotFoundError if guild is not accessible
 */
export async function validateGuildAccess(client: Client, guildId: string): Promise<Guild> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);

  if (!guild) {
    throw new GuildNotFoundError(guildId);
  }

  return guild;
}

/**
 * Checks if the bot is a member of a guild without throwing
 * @param client Discord client instance
 * @param guildId Guild ID to check
 * @returns true if bot has access, false otherwise
 */
export async function hasGuildAccess(client: Client, guildId: string): Promise<boolean> {
  try {
    const guild = await client.guilds.fetch(guildId);
    return !!guild;
  } catch {
    return false;
  }
}
