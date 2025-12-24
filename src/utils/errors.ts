/**
 * Error utilities for safe error handling
 */

/**
 * Safely extracts an error message from an unknown error type.
 * Use this in catch blocks instead of `error.message`.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error === null || error === undefined) {
    return "Unknown error";
  }
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

/**
 * Error thrown when a channel is not found.
 */
export class ChannelNotFoundError extends Error {
  readonly channelId: string;

  constructor(channelId: string) {
    super(`Channel not found: ${channelId}`);
    this.name = "ChannelNotFoundError";
    this.channelId = channelId;
  }
}

/**
 * Error thrown when a guild is not found.
 */
export class GuildNotFoundError extends Error {
  readonly guildId: string;

  constructor(guildId: string) {
    super(`Guild not found: ${guildId}`);
    this.name = "GuildNotFoundError";
    this.guildId = guildId;
  }
}

/**
 * Error thrown when a permission is denied.
 */
export class PermissionDeniedError extends Error {
  readonly permission: string;
  readonly resource: string;

  constructor(permission: string, resource: string) {
    super(`Permission denied: ${permission} for ${resource}`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
    this.resource = resource;
  }
}

/**
 * Error thrown when input validation fails.
 */
export class InvalidInputError extends Error {
  readonly field: string;
  readonly reason: string;

  constructor(field: string, reason: string) {
    super(`Invalid input for ${field}: ${reason}`);
    this.name = "InvalidInputError";
    this.field = field;
    this.reason = reason;
  }
}

/**
 * Safely extracts error details for logging.
 */
export function getErrorDetails(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: getErrorMessage(error) };
}
