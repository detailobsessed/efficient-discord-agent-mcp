# Efficient Discord Agent MCP

[![CI](https://github.com/detailobsessed/efficient-discord-agent-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/detailobsessed/efficient-discord-agent-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun&logoColor=f9f1e1)](https://bun.sh/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHoiLz48L3N2Zz4=)](https://modelcontextprotocol.io/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Biome](https://img.shields.io/badge/Biome-Strict-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)

**Token-Efficient Discord Server Management** — An enhanced fork of [aj-geddes/discord-agent-mcp](https://github.com/aj-geddes/discord-agent-mcp) with significant improvements in code quality, testing, and developer experience.

## What's Different From Upstream?

This fork builds on the original progressive disclosure concept with substantial engineering improvements:

| Area | Upstream | This Fork |
|------|----------|-----------|
| **Runtime** | Node.js + npm | Bun (faster builds, native TypeScript) |
| **Testing** | None | Comprehensive test suite with high coverage |
| **Linting** | Basic | Strict Biome rules (`noExplicitAny`, `noNonNullAssertion`, cognitive complexity) |
| **Error Handling** | Basic | Custom error classes with typed properties |
| **MCP Features** | Tools only | Tools + Prompts + Resources + Tool Annotations |
| **CI/CD** | None | GitHub Actions (lint, build, test) |
| **Pre-commit** | None | prek hooks (typos, formatting, build verification) |

### Key Improvements

- **Comprehensive Test Suite** — All meta-tools, registry operations, and error utilities tested; striving for high coverage
- **Type-Safe Error Handling** — `ChannelNotFoundError`, `GuildNotFoundError`, `PermissionDeniedError`, `InvalidInputError` with typed properties
- **MCP Tool Annotations** — `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` for better LLM guidance
- **Interactive Prompts** — Pre-built prompts for moderation, server setup, events, and permissions
- **Guild Resources** — Expose server info as MCP resources
- **Strict Code Quality** — Zero `any` types, no non-null assertions, enforced cognitive complexity limits

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

- [Bun](https://bun.sh/) 1.0.0+
- A Discord bot token ([Create one here](https://discord.com/developers/applications))

### Install

```bash
git clone https://github.com/detailobsessed/efficient-discord-agent-mcp.git
cd efficient-discord-agent-mcp
bun install
```

### Configure

```bash
cp .env.example .env
# Edit .env and add your DISCORD_TOKEN
```

### Run

```bash
bun run build
bun start
```

### Connect to Claude Code

```bash
# stdio transport (default)
claude mcp add discord-agent -- bun /path/to/efficient-discord-agent-mcp/dist/index.js

# HTTP transport
TRANSPORT_MODE=http bun start
claude mcp add --transport http discord-agent http://localhost:3000/mcp
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

## Deployment

### Docker

```bash
docker build -t efficient-discord-mcp:latest .
docker run -d -p 3000:3000 -e DISCORD_TOKEN=your_token efficient-discord-mcp:latest
```

### Docker Compose

```yaml
services:
  discord-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - TRANSPORT_MODE=http
    restart: unless-stopped
```

### Kubernetes

```bash
kubectl apply -f k8s/
```

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | **Yes** | - | Discord bot token |
| `TRANSPORT_MODE` | No | `stdio` | `http` or `stdio` |
| `HTTP_PORT` | No | `3000` | Server port (HTTP mode) |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

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
