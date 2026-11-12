/// <reference types="node" />
import { expect, it } from "vitest";
import { AcpProcess } from "./acp/process";
import type {
  ServeMcp,
  ToolServer,
} from "./acp/types";
import type { McpHandler } from "./acp/host";
import type { HostProcessOptions } from "./acp/host";
import { readFileSync } from "node:fs";
import { modes, ClaudeModels, picks } from "./models";
import { ENV, CLAUDE, ClaudeProcess } from "./claude";
import { config, DEFAULT_CONFIG } from "./settings";

// As `claude-agent-acp` answers `session/new`, trimmed.
const CONFIG_OPTIONS = [
  {
    id: "mode",
    category: "mode",
    currentValue: "auto",
    options: [
      { value: "default", name: "Manual" },
      { value: "plan", name: "Plan" },
      { value: "auto", name: "Auto" },
    ],
  },
  {
    id: "model",
    category: "model",
    currentValue: "sonnet",
    options: [
      { value: "default", name: "Default (recommended)" },
      { value: "sonnet", name: "Sonnet 5.5" },
      { value: "opus", name: "Opus 5.5" },
    ],
  },
  {
    id: "effort",
    category: "thought_level",
    currentValue: "high",
    options: [
      { value: "default", name: "Default" },
      { value: "low", name: "Low" },
      { value: "high", name: "High" },
    ],
  },
];

/** A stand-in for `claude acp` over stdio. */
const fake = (failure?: string) => {
  const spawned: { id: string; options: HostProcessOptions }[] = [];
  const received: { method: string; params: Record<string, unknown> }[] = [];
  let killed = 0;
  let sessions = 0;
  const spawn = async (id: string, options: HostProcessOptions = {}) => {
    if (failure) throw new Error(failure);
    spawned.push({ id, options });
    return {
      write: async (data: string) => {
        const { id: rpc, method, params } = JSON.parse(data);
        received.push({ method, params });
        const result =
          method === "initialize"
            ? { agentCapabilities: { mcpCapabilities: { http: true } } }
            : method === "session/new"
              ? { sessionId: `s${++sessions}`, configOptions: CONFIG_OPTIONS }
              : { configOptions: CONFIG_OPTIONS };
        queueMicrotask(() =>
          options.onStdout?.(
            `${JSON.stringify({ jsonrpc: "2.0", id: rpc, result })}\n`,
          ),
        );
      },
      end: async () => undefined,
      kill: async () => {
        killed++;
      },
      exited: new Promise<number | null>(() => undefined),
    };
  };
  return { spawn, spawned, received, killed: () => killed };
};

it("declares claude-agent-acp and the Buzz tools", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../plugin/manifest.json", import.meta.url), "utf8"),
  );
  expect(manifest).toMatchObject({
    id: "claude-subscription",
    name: "Claude (subscription)",
    apiVersion: 1,
    host: {
      processes: [{ id: "claude", program: "claude-agent-acp" }],
      mcp: true,
      files: true,
    },
  });
});

it("reports a missing claude binary", async () => {
  const { spawn } = fake("No such file or directory (os error 2)");
  await expect(ClaudeProcess.start(spawn, { cwd: "/w" })).rejects.toThrow(
    CLAUDE.missing,
  );
  const other = fake("permission denied");
  await expect(
    ClaudeProcess.start(other.spawn, { cwd: "/w" }),
  ).rejects.toThrow("permission denied");
});

it("starts without the Buzz identity or an API key", async () => {
  const claude = fake();
  await ClaudeProcess.start(claude.spawn, { cwd: "/w" });
  expect(claude.spawned[0]?.id).toBe("claude");
  expect(claude.spawned[0]?.options.env).toMatchObject(ENV);
  // No API key outranks the Claude Code login.
  for (const name of ["BUZZ_PRIVATE_KEY", "BUZZ_AUTH_TAG", "BUZZ_RELAY_URL", "ANTHROPIC_API_KEY"])
    expect(ENV[name]).toBeNull();
});

it("puts a session on the picked model and level, and skips what is already set", async () => {
  const claude = fake();
  const process = await ClaudeProcess.start(claude.spawn, { cwd: "/w" });
  const offered: unknown[] = [];
  const session = {
    id: "s1",
    chosen: { provider: "", model: "", effort: "" },
    offer: (options: unknown) => offered.push(options),
  };
  const configured = () =>
    claude.received
      .filter(({ method }) => method === "session/set_config_option")
      .map(({ params }) => `${params.configId}=${params.value}`);

  await CLAUDE.select?.(process, session, {
    provider: "",
    model: "",
    effort: "",
  });
  expect(configured()).toEqual([]);

  await CLAUDE.select?.(process, session, {
    provider: "",
    model: "opus",
    effort: "low",
  });
  expect(configured()).toEqual(["model=opus", "effort=low"]);
  expect(offered).toHaveLength(2);
  expect(session.chosen).toMatchObject({ model: "opus", effort: "low" });

  await CLAUDE.select?.(process, session, {
    provider: "",
    model: "opus",
    effort: "low",
  });
  expect(configured()).toHaveLength(2);

  await CLAUDE.select?.(process, session, {
    provider: "",
    model: "sonnet",
    effort: "xhigh",
  });
  expect(configured()).toEqual(["model=opus", "effort=low", "model=sonnet"]);
  expect(session.chosen).toMatchObject({
    model: "sonnet",
    effort: "low",
  });
});

it("switches the permission mode, keeping the chosen model", async () => {
  const claude = fake();
  const process = await ClaudeProcess.start(claude.spawn, { cwd: "/w" });
  const session = {
    id: "s1",
    chosen: { provider: "", model: "openai/gpt", effort: "" },
    offer: () => undefined,
  };
  const configured = () =>
    claude.received
      .filter(({ method }) => method === "session/set_config_option")
      .map(({ params }) => `${params.configId}=${params.value}`);

  await CLAUDE.select?.(process, session, {
    provider: "",
    model: "openai/gpt",
    mode: "plan",
  });
  expect(configured()).toEqual(["mode=plan"]);
  expect(session.chosen).toMatchObject({ mode: "plan", model: "openai/gpt" });

  await CLAUDE.select?.(process, session, {
    provider: "",
    model: "openai/gpt",
    mode: "plan",
  });
  expect(configured()).toHaveLength(1);
});

it("lists the permission modes Claude offers", async () => {
  expect(modes([])).toEqual({ current: "", modes: [] });
  const claude = fake();
  const listed = await new ClaudeModels({
    spawn: claude.spawn,
    resolveDirectory: async (path) => path,
  }).modes();
  expect(listed).toEqual({
    current: "auto",
    modes: [
      { id: "default", label: "Manual" },
      { id: "plan", label: "Plan" },
      { id: "auto", label: "Auto" },
    ],
  });
});

it("lists the models and levels claude offers, and kills the probe", async () => {
  expect(picks([])).toEqual({ current: "", models: [] });
  const claude = fake();
  const models = await new ClaudeModels({
    spawn: claude.spawn,
    resolveDirectory: async (path) => path,
  }).read();
  expect(models.current).toBe("sonnet");
  // Claude's own "default" is the picker's empty choice, so it isn't listed.
  expect(models.models.map(({ id }) => id)).toEqual(["sonnet", "opus"]);
  const levels = [
    { id: "low", label: "Low" },
    { id: "high", label: "High" },
  ];
  expect(models.models[0]).toMatchObject({ effort: "high", efforts: levels });
  // Every model has Claude's levels.
  expect(models.models[1]?.efforts).toEqual(levels);
  expect(claude.killed()).toBe(1);
});

it("does not cache a failed model read", async () => {
  let fail = true;
  const ok = fake();
  const reader = new ClaudeModels({
    spawn: (id, options) =>
      fail ? Promise.reject(new Error("os error 2")) : ok.spawn(id, options),
    resolveDirectory: async (path) => path,
  });
  await expect(reader.read()).rejects.toThrow(CLAUDE.missing);
  fail = false;
  expect((await reader.read()).models).toHaveLength(2);
});

it("fills a saved config with defaults", () => {
  expect(config(undefined)).toEqual(DEFAULT_CONFIG);
  expect(config({ model: "m" })).toEqual({ ...DEFAULT_CONFIG, model: "m" });
});

it("gives each session its own Buzz tool server, acting in its conversation", async () => {
  const handlers: McpHandler[] = [];
  const serve: ServeMcp = async (handler) => {
    handlers.push(handler);
    return {
      url: `http://127.0.0.1:${handlers.length}/mcp`,
      headers: [{ name: "Authorization", value: "Bearer t" }],
      close: async () => undefined,
      closed: new Promise<void>(() => undefined),
    };
  };
  const toolsFor =
    (name: string): ToolServer =>
    async (conversation, message) => ({
      jsonrpc: "2.0",
      id: message.id,
      result: { name, conversation },
    });
  const call = (index: number) =>
    handlers[index]?.({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "send" },
    });
  const claude = fake();
  const process = await ClaudeProcess.start(claude.spawn, { cwd: "/w", serve });
  const a = await process.open({ cwd: "/w", systemPrompt: "", tools: toolsFor("a") });
  const b = await process.open({ cwd: "/w", systemPrompt: "", tools: toolsFor("b") });
  a.conversation = "chan/a";
  b.conversation = "chan/b";
  expect(handlers).toHaveLength(2);
  const servers = claude.received
    .filter(({ method }) => method === "session/new")
    .map(({ params }) => params.mcpServers);
  expect(servers[0]).not.toEqual(servers[1]);
  expect(await call(0)).toMatchObject({ result: { name: "a", conversation: "chan/a" } });
  expect(await call(1)).toMatchObject({ result: { name: "b", conversation: "chan/b" } });
});
