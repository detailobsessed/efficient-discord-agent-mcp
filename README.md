# Efficient Discord Agent MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io/)

**Token-Efficient Discord Server Management** - A fork of discord-agent-mcp that uses **progressive disclosure** to dramatically reduce token consumption.

## Why This Fork?

The original discord-agent-mcp exposes **71 individual tools** to the LLM. Each tool definition consumes tokens when loaded. This fork reduces that to **5 meta-tools** that allow the LLM to discover and execute Discord operations on-demand.

### Token Savings

| Approach | Tools Exposed | Approximate Token Cost |
|----------|---------------|------------------------|
| Original | 71 tools | ~15,000+ tokens |
| This Fork | 5 meta-tools | ~1,500 tokens |

**~90% reduction in tool definition tokens!**

---

## How It Works

Instead of exposing 71 individual tools, this server exposes **5 meta-tools**:

| Meta-Tool | Purpose |
|-----------|---------|
| `list_categories` | Discover available tool categories (messaging, moderation, etc.) |
| `list_tools` | List tools in a specific category |
| `search_tools` | Search for tools by keyword |
| `get_tool_schema` | Get full parameter schema for a tool |
| `execute_tool` | Execute any Discord tool by name |

### Example Workflow

```
1. LLM calls list_categories() → sees "moderation" category
2. LLM calls list_tools("moderation") → sees "ban_member", "kick_member", etc.
3. LLM calls get_tool_schema("ban_member") → sees required params: userId, guildId, reason
4. LLM calls execute_tool("ban_member", {userId: "123", guildId: "456", reason: "spam"})
```

The LLM only loads the schema for tools it actually needs, saving thousands of tokens.

---

## Available Operations

All 71 original Discord operations are still available, organized by category:

| Category | Operations | Description |
|----------|------------|-------------|
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

## Features

- **Token Efficient**: Progressive disclosure pattern reduces token usage by ~90%
- **Persistent Connection**: Robust Discord.js client with automatic reconnection
- **Type Safe**: Full TypeScript with Zod validation
- **Comprehensive Errors**: Detailed error messages with resolution guidance
- **Structured Logging**: JSON logging with configurable levels
- **Flexible Deployment**: Local, Docker, or Kubernetes

---

## Quick Start

### 1. Prerequisites

- Node.js 20.0.0+
- A Discord bot token ([Create one here](https://discord.com/developers/applications))

### 2. Install

```bash
git clone https://github.com/aj-geddes/discord-agent-mcp.git
cd discord-agent-mcp
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env and add your DISCORD_TOKEN
```

### 4. Run

```bash
npm run build
npm start
# Server runs at http://localhost:3000/mcp
```

### 5. Connect to Claude Code

```bash
claude mcp add --transport http discord-agent http://localhost:3000/mcp
```

**[Full Setup Guide →](https://aj-geddes.github.io/discord-agent-mcp/getting-started/)**

---

## Deployment Options

### Docker

```bash
docker build -t discord-mcp-server:latest .
docker run -d -p 3000:3000 -e DISCORD_TOKEN=your_token discord-mcp-server:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  discord-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
    restart: unless-stopped
```

### Kubernetes

```bash
kubectl apply -f k8s/
```

**[Full Deployment Guide →](https://aj-geddes.github.io/discord-agent-mcp/deployment/)**

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | **Yes** | - | Discord bot token |
| `TRANSPORT_MODE` | No | `http` | `http` or `stdio` |
| `HTTP_PORT` | No | `3000` | Server port |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

---

## Example Usage

Once connected, use natural language in Claude Code:

**Server Setup:**
```
"Set up a gaming community with channels for Minecraft, Valorant, and general chat"
```

**Moderation:**
```
"Timeout user 123456789 for 1 hour for spam"
```

**Events:**
```
"Create a voice event called 'Game Night' for Saturday at 8 PM"
```

**Automation:**
```
"Set up auto-moderation to block spam and timeout repeat offenders"
```

---

## Security

- **Never commit tokens** - Use `.env` files (gitignored)
- **Rotate tokens** - Regenerate periodically
- **Least privilege** - Only grant necessary permissions
- **Audit logs** - Monitor bot actions

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Test with a development Discord server
4. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Resources

- **Documentation**: [aj-geddes.github.io/discord-agent-mcp](https://aj-geddes.github.io/discord-agent-mcp/)
- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **Discord API**: [discord.com/developers](https://discord.com/developers/)
- **Issues**: [GitHub Issues](https://github.com/aj-geddes/discord-agent-mcp/issues)

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Discord Agent MCP</strong> - AI-Powered Discord Server Management
  <br>
  Built with TypeScript, Discord.js, and the Model Context Protocol
</p>
