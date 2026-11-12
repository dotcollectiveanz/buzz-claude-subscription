# Claude (subscription) for Buzz

**Private, for personal use only. Do not publish or share this plugin.**

A [Buzz](https://github.com/block/buzz-app) desktop plugin (`claude-subscription`) that adds a
**Claude (subscription)** harness: Buzz agents that run on *your own* signed-in Claude Code, using
your Claude subscription instead of an Anthropic API key.

Buzz's built-in Claude harness only accepts an API key. Anthropic's terms say third-party products
shouldn't offer claude.ai (subscription) sign-in unless Anthropic approves them, so this plugin is
kept private to its owner's own computer and agents. Agents running on it use your subscription's
usage limits.

## Features

Same as [buzz-opencode](https://github.com/dotcollectiveanz/buzz-opencode):

- **Harness:** Claude (subscription) in Agents → Harness, for new agents or by switching an existing
  one. Its instructions and workspace carry over.
- **Identity:** Permissions (Claude Code's permission mode: Manual, Accept edits, Plan, Auto, Bypass),
  Model and Thinking, listed from your Claude Code, and Instructions.
- **Settings:** Workspace and Conversations (one session per thread, or per channel).
- **Activity:** the agent's conversations, whether each is working, and each one's transcript, read
  from Claude Code's own history in `~/.claude/projects`.
- **Synced settings:** permissions, model, thinking level and scope sync across your devices.
- A failed turn says so in its thread and tags you.

## Requirements

- Buzz desktop 1.0 on macOS.
- Claude Code installed and signed in with your subscription (`claude`, then `/login`). Check with
  `claude auth status`.
- Node.js 22 or later, with `npx` on the PATH your login shell gives Buzz. The plugin runs the Claude
  Code ACP adapter with `npx`, pinned to `@agentclientprotocol/claude-agent-acp@0.106.0`: the first
  start downloads it (about 20 seconds), and later starts use npm's cache. Nothing to install by hand.

It uses your whole Claude Code setup: `~/.claude/settings.json`, your model routing, MCP servers and
skills. The plugin removes `ANTHROPIC_API_KEY` from Claude's environment so the subscription login is
used, not a key.

## Install

In Buzz: **Settings → Plugins → Manage plugins → Add → Browse** under "Add from folder", pick
`~/Code/buzz-claude-subscription/plugin`, review the access it asks for, and install. Then create an
agent with **Claude (subscription)** as its Harness, or switch one to it.

### Access it asks for

- Run `npx -y @agentclientprotocol/claude-agent-acp@0.106.0` (the Claude Code ACP adapter).
- Serve the Buzz tools to Claude on this computer (MCP), acting as the agent.
- Read files: uploads you ask the agent to make, and Claude Code's transcripts for Activity.

Claude runs commands as you, so an agent acts only on your own mentions, or ones you attested.

## How it works

The same design as buzz-opencode: Buzz's side of each turn comes from the plugin API's harness kit
(`ctx.agents.harness`); Claude's side is one `claude-agent-acp` process (the Agent Client Protocol
adapter for Claude Code, Apache-2.0) driven by a copy of Buzz's ACP client (`src/acp/`). Each Buzz
conversation is one Claude Code session with its own Buzz tool server. Buzz's prompt is appended to
Claude Code's own system prompt.

Buzz ends a turn as soon as the agent's final `send` posts; Claude Code then records that send as
refused and the turn as interrupted. The transcript reader shows those as posted and finished.

## Develop

See [AGENTS.md](AGENTS.md).

```sh
npm install
npm run build        # src/ → plugin/plugin.js
npm test
npm run types        # Buzz's plugin API types, for typecheck
npm run check        # typecheck, tests, manifest, icon and build freshness
CLAUDE_LIVE=1 npx vitest run src/runtime.live.test.ts   # a real turn on your Claude Code login
```
