# Instructions for coding agents

This repo is a **private** Buzz desktop plugin (`claude-subscription`) that registers a Claude agent
harness running on the owner's signed-in Claude Code. Read [README.md](README.md) first. Never publish
it, make the repo public, or add a way to share it: subscription sign-in in third-party products
needs Anthropic's approval.

## Hard rules

- **One self-contained module.** Buzz loads `plugin/plugin.js` from a blob URL: no runtime imports, no
  CSS or asset files, no code splitting. `build.mjs` and `scripts/check.mjs` enforce it.
- **React comes from Buzz.** Never import `react` or `react-dom` at runtime. JSX compiles to
  `React.createElement` against `src/react.ts`, set from `ctx.react` in `apply`. Tests may import React.
- **Types only from Buzz.** `@buzz/author` (via `src/buzz.ts`) is type-only; never import it at runtime.
- **No Buzz UI components.** Buzz exposes none to plugins. Build UI in `src/ui.tsx` with Buzz's global
  `buzz-*` classes and design tokens (`var(--space-2)` etc.), matching Buzz's own markup.
- **Commit the build.** After changing `src/`, run `npm run build` and commit `plugin/plugin.js`;
  `npm run check` fails if it's stale.
- **Manifest `host` changes need the owner's approval** on update in Buzz; keep them minimal, and update
  `scripts/check.mjs` and `src/claude.test.ts` with them.
- **Only a checked session UUID names a transcript file** to read (`src/transcript.ts`).
- **The adapter version is pinned in `plugin/manifest.json`** (`npx -y …@x.y.z`). Bump it there,
  run the live test, and update `scripts/check.mjs` and `src/claude.test.ts` with it.
- **Keep `ANTHROPIC_API_KEY` out of Claude's environment** (`ENV` in `src/claude.ts`), so the
  subscription login is used.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.tsx` | `apply(ctx)`: registers the agent type, its tabs and icon |
| `src/runtime.ts` | Turns Buzz deliveries into Claude turns, on the harness kit |
| `src/acp/` | Buzz's ACP client, copied (see NOTICE.md); keep changes small and noted there |
| `src/claude.ts` | The adapter's ACP hooks: model, thinking level and permission mode selection |
| `src/models.ts` | Lists models, levels and permission modes from a short-lived adapter session |
| `src/settings.ts` | Config, defaults, synced settings, and carry/adopt across harness changes |
| `src/tabs.tsx` | New agent fields, Identity/Settings tab, Activity tab and transcript view |
| `src/transcript.ts` | Reads Claude Code's `~/.claude/projects/<workspace>/<session>.jsonl` into Buzz's turn model |
| `src/ui.tsx` | Buzz-styled controls |

## Checks

- `npm test`: unit tests, including loading the built `plugin.js` and rendering every tab.
- `npm run typecheck` after `npm run types` (or `node scripts/types.mjs <buzz-app checkout>`).
- `CLAUDE_LIVE=1 npx vitest run src/runtime.live.test.ts`: a real turn on the Claude Code login
  (`CLAUDE_MODEL` picks the model, default `haiku`). Nothing reaches Buzz.
- Before a release, also try the change in Buzz itself: install from `plugin/`, switch an agent to
  Claude (subscription), mention it, and open its Activity.

## Releases

1. Update `version` in `package.json` and add notes to `CHANGELOG.md`.
2. `npm run build && npm run check`.
3. Commit, tag `vX.Y.Z` and push to the private repo. Don't attach builds anywhere public.
