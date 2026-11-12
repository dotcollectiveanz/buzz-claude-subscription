# Notices

## Buzz (Apache-2.0)

Parts of this plugin are copied from [block/buzz-app](https://github.com/block/buzz-app), Copyright
2026 Block, Inc., under the Apache License 2.0 (the same licence as this repo, [LICENSE](LICENSE)):

- `src/acp/process.ts`, `session.ts`, `agent-sessions.ts`, `steps.ts`, `types.ts` and
  `session-control.ts`: Buzz's ACP client, from `src/features/agent-harness/`. Changed: imports
  point at local files, and a conversation's session records the harness kit's cursor instead of a
  timestamp (`newerCursor`).
- `src/acp/shims.ts`, `src/transcript-model.ts` and `src/sessions.ts`: small helpers from
  `src/buzz-mcp/message-tools.ts`, `src/bundled/claude-code/prompt.ts`,
  `src/features/agents/agent-config.ts`, `src/bundled/codex/config.ts`,
  `src/features/agents/activity-transcript.ts`, `src/features/agent-harness/turn-records.ts` and
  `src/bundled/goose/sessions.ts`, unchanged apart from trimming.
- `src/claude.ts`, `src/models.ts`, `src/settings.ts`, `src/runtime.ts` and
  their tests: adapted from the OpenCode harness in block/buzz-app#2432 by Gerard Casas Saez, with contributions
  from Marcus Quinn (casassg/buzz-app#1) and DotCollective (casassg/buzz-app#2). Changed:
  the runtime is rebuilt on the plugin API's harness kit (`ctx.agents.harness`) in place of the app's
  internals, and the tabs are rebuilt on Buzz's global CSS classes.

## Claude Code transcripts

`claudeTurns` in `src/transcript.ts` is from block/buzz-app's `src/bundled/claude-code/transcript.ts`
(Apache-2.0). Changed: final Buzz sends that ended a turn are shown as posted.

## Icon

`plugin/icon.png` and `src/icon.tsx` are a simple spark drawn for this plugin, not Anthropic's logo.
