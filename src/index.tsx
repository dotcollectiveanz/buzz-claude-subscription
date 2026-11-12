// Claude agents for Buzz on your Claude subscription, as an installed plugin:
// an agent type whose agents are your own signed-in Claude Code, all in one
// `claude-agent-acp` process. Each conversation an agent is in is one ACP
// session; Claude answers with the
// Buzz tools, served to it over loopback HTTP MCP.
import type { AgentType, Context } from "./buzz";
import { ClaudeIcon } from "./icon";
import { ClaudeModels } from "./models";
import { setReact } from "./react";
import { ClaudeRuntime } from "./runtime";
import {
  adopt,
  type Config,
  carry,
  config,
  DEFAULT_CONFIG,
  syncedSettingsSchema,
  withSyncedSettings,
} from "./settings";
import { createTabs } from "./tabs";

export const TYPE_ID = "claude";
/** A turn's run returns once Claude has it, so this bounds only the hand-over. */
const HANDOVER_MS = 2 * 60_000;

export const inject = ["react", "agents", "host"];

export function apply(ctx: Context) {
  setReact(ctx.react);
  const { agents, host } = ctx;
  const typeKey = `${ctx.pluginOwner?.id ?? "claude-subscription"}/${TYPE_ID}`;
  const desktop = !!(host.spawn && host.resolveDirectory && host.serveMcp);
  const runtime = new ClaudeRuntime(agents, host);
  const models = desktop
    ? new ClaudeModels({
        // biome-ignore lint/style/noNonNullAssertion: checked by `desktop`.
        spawn: host.spawn!.bind(host),
        // biome-ignore lint/style/noNonNullAssertion: checked by `desktop`.
        resolveDirectory: host.resolveDirectory!.bind(host),
      })
    : undefined;
  if (desktop) {
    const sync = () => {
      const snapshot = agents.snapshot();
      if (snapshot.status === "loading") return;
      runtime.sync(snapshot.running.filter((agent) => agent.type === typeKey));
    };
    const unsubscribe = agents.subscribe(sync);
    sync();
    ctx.effect(() => () => {
      unsubscribe();
      runtime.dispose();
    });
  }

  const listModels = async () => models?.read() ?? { current: "", models: [] };
  const { ActivityTab, Create, SettingsTab } = createTabs({
    models: listModels,
    modes: async () => models?.modes() ?? { current: "", modes: [] },
    runtime,
  });

  const type: AgentType<Config> = {
    id: TYPE_ID,
    title: "Claude (subscription)",
    // Buzz types it as its own icon wrapper; a plain component renders the same.
    icon: ClaudeIcon as unknown as AgentType<Config>["icon"],
    description:
      "Your own Claude Code on this computer, on the subscription it is signed in with. Each thread it is mentioned in is one continuing session.",
    defaults: () => ({ config: DEFAULT_CONFIG }),
    adopt,
    carry,
    summary: (agent) => {
      const { mode, model } = config(agent.config);
      return [mode, model].filter(Boolean).join(" · ") || "Claude";
    },
    Create,
    tabs: [
      {
        id: "settings",
        title: "Settings",
        role: "settings",
        splitSettings: true,
        component: SettingsTab,
      },
      {
        id: "activity",
        title: "Activity",
        role: "activity",
        component: ActivityTab,
      },
    ],
    sessions: {
      list: (key) =>
        runtime.conversations(key).map(({ key, at }) => {
          const [channelId = key, root] = key.split("/");
          return { channelId, ...(root && { root }), at };
        }),
      subscribe: (listener) => runtime.subscribe(listener),
    },
    models: listModels,
    sessionControls: {
      scope: (agent) => config(agent.config).scope,
      state: (agent, place) => runtime.sessionState(agent, place),
      run: (agent, place, action) => runtime.session(agent, place, action),
      subscribe: (listener) => runtime.subscribe(listener),
    },
    run: (delivery) => runtime.run(delivery),
    runOnce: (turn) => runtime.runOnce(turn),
    timeoutMs: HANDOVER_MS,
    syncedSettings: {
      schema: syncedSettingsSchema,
      withSynced: withSyncedSettings,
    },
    resumes: true,
  };
  agents.register<Config>(type);
}
