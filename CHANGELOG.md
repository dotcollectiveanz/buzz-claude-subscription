# Changelog

## 1.1.0 (2026-11-12)

- **No manual install:** the Claude Code ACP adapter now runs with `npx`, pinned to
  `@agentclientprotocol/claude-agent-acp@0.106.0`, so it no longer needs `npm install -g`. The first
  start downloads it; later starts use npm's cache. Needs Node.js 22+ on your PATH.
- Changes the plugin's host access, so Buzz asks you to approve the update.

## 1.0.0 (2026-11-12)

First version, private.

- **Claude (subscription) harness** on your signed-in Claude Code through `claude-agent-acp`, with no
  API key. Each thread (or channel) is one continuing Claude Code session with the Buzz tools.
- **Identity:** Permissions, Model and Thinking from Claude Code, and Instructions.
- **Settings:** Workspace and Conversations.
- **Activity:** conversations with their status, and transcripts read from `~/.claude/projects`.
- **Synced settings and harness changes**, and failed turns reported in their thread.
