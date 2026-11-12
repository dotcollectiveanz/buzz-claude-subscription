# Claude (subscription)

Private plugin. Buzz agents that run on your own signed-in Claude Code, on your Claude subscription.

1. Sign in to Claude Code with your subscription (`claude`, then `/login`).
2. Have Node.js 22+ installed. The plugin fetches Claude Code's ACP adapter with `npx` on first start.
3. In **Agents**, create an agent with **Claude (subscription)** as its Harness, or switch one to it,
   add it to a channel and mention it.

- **Identity:** Permissions, Model, Thinking and Instructions.
- **Settings:** Workspace and Conversations.
- **Activity:** conversations and their transcripts, from Claude Code's history.

It asks to run the adapter with `npx`, serve the Buzz tools to Claude (MCP), and read files (uploads, and
Claude Code's transcripts). It acts only on your own mentions, or ones you attested.
