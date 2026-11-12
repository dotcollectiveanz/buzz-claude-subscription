// Claude Code on the shared ACP client: one `claude-agent-acp` process (the
// Agent Client Protocol adapter for Claude Code), signed in as your own Claude
// Code is. Model, thinking level and permission mode are set as config
// options. Each session gets its own Buzz tools over HTTP MCP, never a Buzz key.
import { AcpProcess } from "./acp/process";
import { errorMessage } from "./acp/steps";
import type { AcpHooks, ServeMcp, Spawn } from "./acp/types";

export type { ServeMcp, ToolServer } from "./acp/types";

/** The desktop host's `spawn` and `resolveDirectory`, which Claude starts with. */
export type ClaudeHost = Readonly<{
  spawn: Spawn;
  resolveDirectory(path: string): Promise<string>;
}>;

/** No Buzz identity reaches Claude, and no API key outranks the Claude Code
 * login: it runs on the subscription `claude` is signed in with. Nor does it
 * take on the session of a Claude Code that started the app. */
export const ENV: Readonly<Record<string, string | null>> = {
  BUZZ_PRIVATE_KEY: null,
  BUZZ_AUTH_TAG: null,
  BUZZ_RELAY_URL: null,
  ANTHROPIC_API_KEY: null,
  CLAUDECODE: null,
  CLAUDE_CODE_ENTRYPOINT: null,
  CLAUDE_CODE_SESSION_ID: null,
  CLAUDE_CODE_CHILD_SESSION: null,
  CLAUDE_AGENT_SDK_VERSION: null,
  CLAUDE_PID: null,
};

export const CLAUDE: AcpHooks = {
  label: "Claude",
  program: "claude",
  missing:
    "claude-agent-acp is not installed or not on your PATH. Run `npm install -g @agentclientprotocol/claude-agent-acp`, and sign in to Claude Code with `claude`.",
  env: ENV,
  select: async (claude, session, want) => {
    let levels:
      | { id: string | undefined; values: string[] | undefined }
      | undefined;
    const configure = async (configId: string, value: string) => {
      try {
        const answer = (await claude.request("session/set_config_option", {
          sessionId: session.id,
          configId,
          value,
        })) as {
          configOptions?: {
            id?: string;
            category?: string | null;
            options?: { value: string }[];
          }[];
        };
        session.offer(answer);
        const option = answer.configOptions?.find(
          (item) => item.category === "thought_level",
        );
        levels = option && {
          id: option.id,
          values: option.options?.map(({ value }) => value),
        };
      } catch (error) {
        throw new Error(
          `Claude could not switch its ${configId} to ${value}: ${errorMessage(error)}`,
        );
      }
    };
    if (want.mode && want.mode !== session.chosen.mode) {
      await configure("mode", want.mode);
      session.chosen = { ...session.chosen, mode: want.mode };
    }
    if (want.model && want.model !== session.chosen.model) {
      await configure("model", want.model);
      session.chosen = { ...session.chosen, model: want.model };
    }
    if (want.effort && want.effort !== session.chosen.effort) {
      if (levels?.values && !levels.values.includes(want.effort)) return;
      await configure(levels?.id ?? "effort", want.effort);
      session.chosen = { ...session.chosen, effort: want.effort };
    }
  },
};

/** Starts `claude-agent-acp` and checks it can reach the Buzz tools. */
export const ClaudeProcess = {
  start: (
    spawn: Spawn,
    launch: Readonly<{
      cwd: string;
      env?: Readonly<Record<string, string | null>>;
      serve?: ServeMcp;
    }>,
  ) => AcpProcess.start(spawn, CLAUDE, launch),
};
