// The models, thinking levels and permission modes Claude offers, read from a
// short-lived `claude-agent-acp` session in the home folder. Nothing is cached
// after a failure.
import { REQUEST_TIMEOUT_MS } from "./acp/process";
import type { Models } from "./buzz";
import { type ClaudeHost, ClaudeProcess } from "./claude";

type Option = {
  id?: string;
  category?: string | null;
  currentValue?: string;
  options?: { value: string; name?: string }[];
};

/** `model` and `effort` picks from a `session/new` answer. */
export function picks(configOptions: readonly Option[], current = ""): Models {
  const model = configOptions.find((item) => item.id === "model");
  const levels = (
    configOptions.find((item) => item.category === "thought_level")?.options ??
    []
  )
    // Its own "default" is the picker's empty choice.
    .filter(({ value }) => value !== "default")
    .map(({ value, name }) => ({ id: value, label: name || value }));
  const resting = configOptions.find(
    (item) => item.category === "thought_level",
  )?.currentValue;
  const selected = current || model?.currentValue || "";
  return {
    current: selected,
    // Claude's thinking levels are the same for every model it lists.
    models: (model?.options ?? [])
      .filter(({ value }) => value !== "default")
      .map(({ value, name }) => ({
        id: value,
        label: name || value,
        efforts: levels,
        ...(resting && value === (model?.currentValue ?? "")
          ? { effort: resting }
          : {}),
      })),
  };
}

/** The permission modes a session can switch to, from the `mode` option. */
export type Modes = Readonly<{
  /** The mode Claude starts in; empty when it lists none. */
  current: string;
  modes: readonly Readonly<{ id: string; label: string }>[];
}>;

/** `mode` picks from a `session/new` answer. */
export function modes(configOptions: readonly Option[]): Modes {
  const mode = configOptions.find(
    (item) => item.id === "mode" || item.category === "mode",
  );
  return {
    current: mode?.currentValue ?? "",
    modes: (mode?.options ?? []).map(({ value, name }) => ({
      id: value,
      label: name || value,
    })),
  };
}

export class ClaudeModels {
  private reading: Promise<readonly Option[]> | undefined;
  constructor(private readonly host: ClaudeHost) {}

  read(): Promise<Models> {
    return this.options().then((options) => picks(options));
  }

  modes(): Promise<Modes> {
    return this.options().then((options) => modes(options));
  }

  private options(): Promise<readonly Option[]> {
    if (this.reading) return this.reading;
    const reading = (async () => {
      const claude = await ClaudeProcess.start(this.host.spawn, {
        cwd: await this.host.resolveDirectory("~"),
      });
      try {
        const opened = (await claude.request(
          "session/new",
          { cwd: await this.host.resolveDirectory("~"), mcpServers: [] },
          REQUEST_TIMEOUT_MS,
        )) as { configOptions?: Option[] };
        return opened.configOptions ?? [];
      } finally {
        void claude.kill();
      }
    })();
    this.reading = reading;
    reading.catch(() => {
      if (this.reading === reading) this.reading = undefined;
    });
    return reading;
  }
}
