# Efficient Discord Agent MCP

[![npm version](https://img.shields.io/npm/v/efficient-discord-mcp-server.svg)](https://www.npmjs.com/package/efficient-discord-mcp-server)
[![CI](https://github.com/detailobsessed/efficient-discord-agent-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/detailobsessed/efficient-discord-agent-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun&logoColor=f9f1e1)](https://bun.sh/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHoiLz48L3N2Zz4=)](https://modelcontextprotocol.io/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Biome](https://img.shields.io/badge/Biome-Strict-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)

**Token-Efficient Discord Server Management** — An enhanced fork of [aj-geddes/discord-agent-mcp](https://github.com/aj-geddes/discord-agent-mcp) with progressive disclosure pattern for dramatic token savings.

## What's Different From Upstream?

This fork builds on the original progressive disclosure concept with substantial engineering improvements:

| Area | Upstream | This Fork |
|------|----------|-----------|
| **Runtime** | Node.js + npm | Bun (faster builds, native TypeScript) |
| **Tool Exposure** | 68+ tools directly | 5 meta-tools (progressive disclosure) |
| **Testing** | None | Comprehensive test suite |
| **Linting** | Basic | Strict Biome rules (`noExplicitAny`, `noNonNullAssertion`, cognitive complexity) |
| **CI/CD** | None | GitHub Actions (lint, build, test, semantic-release) |
| **Pre-commit** | None | prek hooks (typos, formatting, build verification) |

### Key Improvements

- **Progressive Disclosure** — 5 meta-tools instead of 68+ individual tools (~90% token reduction)
- **MCP Protocol Logging** — Structured logs sent to LLM clients for agent observability
- **HTTP Transport Security** — DNS rebinding protection, configurable allowed hosts/origins
- **Comprehensive Test Suite** — All meta-tools, registry operations, and error utilities tested
- **Type-Safe Error Handling** — `ChannelNotFoundError`, `GuildNotFoundError`, `PermissionDeniedError`, `InvalidInputError` with typed properties
- **MCP Tool Annotations** — `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` for better LLM guidance
- **Interactive Prompts** — Pre-built prompts for moderation, server setup, events, and permissions
- **Guild Resources** — Expose server info as MCP resources
- **Strict Code Quality** — Zero `any` types, no non-null assertions, enforced cognitive complexity limits
- **Modern Tooling** — Bun for fast builds, Biome for linting, prek for pre-commit hooks
- **Automated Releases** — Semantic versioning with conventional commits

---

## How It Works

Instead of exposing 68+ individual tools, this server exposes **5 meta-tools**:

| Meta-Tool | Purpose |
|-----------|---------|
| `list_categories` | Discover available tool categories |
| `list_tools` | List tools in a specific category |
| `search_tools` | Search for tools by keyword |
| `get_tool_schema` | Get full parameter schema for a tool |
| `execute_tool` | Execute any Discord tool by name |

### Token Savings

| Approach | Tools Exposed | Approximate Token Cost |
|----------|---------------|------------------------|
| Traditional | 68+ tools | ~15,000+ tokens |
| Progressive Disclosure | 5 meta-tools | ~1,500 tokens |

**~90% reduction in tool definition tokens!**

### Example Workflow

```
1. LLM calls list_categories() → sees "moderation" category
2. LLM calls list_tools("moderation") → sees "ban_member", "kick_member", etc.
3. LLM calls get_tool_schema("ban_member") → sees required params
4. LLM calls execute_tool("ban_member", {userId: "123", guildId: "456", reason: "spam"})
```

---

## Available Operations

All Discord operations organized by category:

| Category | Tools | Description |
|----------|-------|-------------|
| messaging | 10 | Send, edit, delete, react, pin messages |
| channels | 10 | Create, modify, delete channels and permissions |
| members | 3 | Info, listings, nicknames |
| roles | 7 | Create, assign, modify roles |
| server | 7 | Settings, webhooks, invites, audit logs |
| moderation | 6 | Kick, ban, timeout, manage bans |
| emojis | 4 | Custom emoji management |
| stickers | 4 | Custom sticker management |
| scheduled-events | 6 | Scheduled events |
| automod | 5 | Automatic moderation rules |
| application-commands | 6 | Slash command management |

---

## Quick Start

### Prerequisites

- Node.js 18+ (for `npx`) or [Bun](https://bun.sh/) 1.0+ (for `bunx`)
- A Discord bot token ([Create one here](https://discord.com/developers/applications))

### MCP Client Configuration

Add this to your MCP client configuration (e.g., `~/.config/claude/claude_desktop_config.json` for Claude Desktop, or your IDE's MCP settings):

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["efficient-discord-mcp-server"],
      "env": {
        "DISCORD_TOKEN": "your_bot_token_here"
      }
    }
  }
}
```

Or with Bun:

```json
{
  "mcpServers": {
    "discord": {
      "command": "bunx",
      "args": ["efficient-discord-mcp-server"],
      "env": {
        "DISCORD_TOKEN": "your_bot_token_here"
      }
    }
  }
}
```

### Connect via CLI

```bash
# stdio transport (default)
claude mcp add discord-agent -- npx efficient-discord-mcp-server

# HTTP transport (requires running from source)
STREAMABLE_HTTP=true npx efficient-discord-mcp-server
claude mcp add --transport http discord-agent http://localhost:3000/mcp
```

### Install from Source (Development)

```bash
git clone https://github.com/detailobsessed/efficient-discord-agent-mcp.git
cd efficient-discord-agent-mcp
bun install
bun run build
bun start
```

---

## Features

### MCP Protocol Logging

The server supports MCP protocol logging for agent observability. When connected, LLM clients can receive structured log messages showing what the server is doing:

- Tool execution logs
- Discord API call details
- Error information with context

This helps agents understand server behavior and debug issues.

### HTTP Transport Security

When using HTTP transport (`STREAMABLE_HTTP=true`), the server includes security features:

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `HTTP_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated list of allowed Host headers |
| `HTTP_ALLOWED_ORIGINS` | (any) | Comma-separated list of allowed Origin headers |
| `HTTP_ENABLE_DNS_REBINDING_PROTECTION` | `true` | Enable DNS rebinding attack protection |

Example for production:

```bash
HTTP_ALLOWED_HOSTS=api.example.com,localhost \
HTTP_ALLOWED_ORIGINS=https://app.example.com \
STREAMABLE_HTTP=true \
bun start
```

---

## Development

```bash
# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Lint and format
bun run check

# Build
bun run build
```

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | **Yes** | - | Discord bot token |
| `STREAMABLE_HTTP` | No | `false` | Enable HTTP transport |
| `PORT` | No | `3000` | Server port (HTTP mode) |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `HTTP_ALLOWED_HOSTS` | No | `localhost,127.0.0.1` | Allowed Host headers |
| `HTTP_ALLOWED_ORIGINS` | No | (any) | Allowed Origin headers |

---

## Security

- **Never commit tokens** — Use `.env` files (gitignored)
- **Rotate tokens** — Regenerate periodically
- **Least privilege** — Only grant necessary bot permissions
- **Audit logs** — Monitor bot actions

---

## Acknowledgments

This project is a fork of [aj-geddes/discord-agent-mcp](https://github.com/aj-geddes/discord-agent-mcp). Thanks to the original author for the progressive disclosure concept and initial implementation.

---

## Resources

- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **Discord API**: [discord.com/developers](https://discord.com/developers/)
- **Bun**: [bun.sh](https://bun.sh/)

---

## License

MIT License — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Efficient Discord Agent MCP</strong><br>
  AI-Powered Discord Server Management with Token Efficiency<br>
  <sub>Built with Bun, Discord.js, and the Model Context Protocol</sub>
</p>
