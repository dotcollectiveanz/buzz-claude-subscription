import { expect, it, vi } from "vitest";
import {
  claudeTurns,
  projectName,
  readTranscript,
  TURN_LIMIT,
} from "./transcript";

const PLACE = { channelId: "c".repeat(36), root: "e".repeat(64) };
const ID = "3ddd357c-7e67-498e-87c6-2595f66f2918";
const at = (seconds: number) => new Date(seconds * 1000).toISOString();
const line = (value: object) => JSON.stringify(value);

// The lines Claude Code writes, trimmed; its own bookkeeping lines are left out.
const FILE = [
  line({ type: "api-request", timestamp: at(1) }),
  line({
    type: "user",
    uuid: "u1",
    timestamp: at(1),
    message: { role: "user", content: [{ type: "text", text: "hello" }] },
  }),
  line({
    type: "assistant",
    uuid: "a1",
    timestamp: at(2),
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Looking at the repo." },
        { type: "text", text: "On it." },
        { type: "tool_use", id: "t1", name: "Bash", input: { command: "git status" } },
        { type: "tool_use", id: "t2", name: "Read", input: { file_path: "/w/a.ts" } },
        {
          type: "tool_use",
          id: "t3",
          name: "mcp__buzz__send",
          input: { text: "Done: it's clean.", final: true },
        },
      ],
    },
  }),
  line({
    type: "user",
    uuid: "r1",
    timestamp: at(3),
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "clean" },
        { type: "tool_result", tool_use_id: "t2", content: "no such file", is_error: true },
        { type: "tool_result", tool_use_id: "t3", content: "Sent." },
      ],
    },
  }),
  line({
    type: "assistant",
    uuid: "side",
    isSidechain: true,
    timestamp: at(4),
    message: { role: "assistant", content: [{ type: "text", text: "subagent" }] },
  }),
].join("\n");

it("turns a Claude Code session file into turns opened by its prompts", () => {
  const [turn, ...rest] = claudeTurns(FILE, { ...PLACE, sessionId: ID }, false);
  expect(rest).toEqual([]);
  expect(turn).toMatchObject({
    turnId: "u1",
    channelId: PLACE.channelId,
    threadRootId: PLACE.root,
    sessionId: ID,
    newSession: true,
    startedAt: 1000,
    endedAt: 3000,
  });
  expect(
    turn?.items.map((item) =>
      item.type === "tool"
        ? [item.type, item.title, item.kind, item.status, item.output]
        : [item.type, "text" in item ? item.text : "", "posted" in item && item.posted],
    ),
  ).toEqual([
    ["prompt", "hello", false],
    ["thought", "Looking at the repo.", false],
    ["message", "On it.", false],
    ["tool", "git status", "execute", "completed", "clean"],
    ["tool", "Read", "read", "failed", "no such file"],
    ["message", "Done: it's clean.", true],
  ]);
  // A running session's last turn has not ended.
  expect(
    claudeTurns(FILE, { ...PLACE, sessionId: ID }, true).at(-1)?.endedAt,
  ).toBeUndefined();
});

it("names a workspace's project folder as Claude Code does", () => {
  expect(projectName("/Users/me/.buzz")).toBe("-Users-me--buzz");
});

it("reads a conversation's sessions newest first, from its project folder", async () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      line({
        type: "user",
        uuid: `u${index}`,
        timestamp: at(index + 1),
        message: { role: "user", content: `turn ${index}` },
      }),
    ).join("\n");
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const files: Record<string, string> = {
    [`/p/${ids[0]}.jsonl`]: many(3),
    [`/p/${ids[1]}.jsonl`]: many(TURN_LIMIT),
    [`/p/${ids[2]}.jsonl`]: many(5),
  };
  const read = vi.fn(async (path: string) => {
    const file = files[path];
    if (file === undefined) throw new Error(`No such file: ${path}`);
    return new TextEncoder().encode(file);
  });
  const signal = new AbortController().signal;
  const transcript = await readTranscript(read, "/p", ids, PLACE, false, signal);
  // The oldest session isn't needed: the two newer ones already overflow.
  expect(read.mock.calls.map(([path]) => path)).toEqual([
    `/p/${ids[0]}.jsonl`,
    `/p/${ids[1]}.jsonl`,
  ]);
  expect(transcript.more).toBe(true);
  expect(transcript.turns).toHaveLength(TURN_LIMIT);
  expect(transcript.turns.at(-1)?.sessionId).toBe(ids[0]);

  // Only session ids name files; a session never sent a message has none.
  read.mockClear();
  const missing = "44444444-4444-4444-8444-444444444444";
  const some = await readTranscript(
    read,
    "/p",
    ["../../etc/passwd", missing, ids[2] as string],
    PLACE,
    false,
    signal,
  );
  expect(read.mock.calls.map(([path]) => path)).toEqual([
    `/p/${missing}.jsonl`,
    `/p/${ids[2]}.jsonl`,
  ]);
  expect(some.turns).toHaveLength(5);
  await expect(
    readTranscript(read, "/p", [missing], PLACE, false, signal),
  ).rejects.toThrow("No such file");
});

it("shows a final send that ended the turn as posted, not refused or stopped", () => {
  const send = (id: string, final: boolean) =>
    line({
      type: "assistant",
      uuid: `a${id}`,
      timestamp: at(2),
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id, name: "mcp__buzz__send", input: { text: `hi ${id}`, final } },
        ],
      },
    });
  const refused = (id: string) =>
    line({
      type: "user",
      uuid: `r${id}`,
      timestamp: at(3),
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: id,
            is_error: true,
            content: "The user doesn't want to proceed with this tool use. The tool use was rejected.",
          },
        ],
      },
    });
  const interrupted = (uuid: string) =>
    line({
      type: "user",
      uuid,
      timestamp: at(4),
      message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user for tool use]" }] },
    });
  const prompt = (uuid: string) =>
    line({ type: "user", uuid, timestamp: at(1), message: { role: "user", content: "go" } });
  const turns = claudeTurns(
    [
      prompt("p1"), send("t1", true), refused("t1"), interrupted("i1"),
      // The owner stopped this one before its message went.
      prompt("p2"), send("t2", false), refused("t2"), interrupted("i2"),
    ].join("\n"),
    { ...PLACE, sessionId: ID },
    false,
  );
  expect(turns).toHaveLength(2);
  expect(turns[0]?.stopReason).toBeUndefined();
  expect(turns[0]?.items.map((item) => item.type)).toEqual(["prompt", "message"]);
  expect(turns[0]?.items[1]).toMatchObject({ posted: true });
  expect(turns[1]?.stopReason).toBe("stopped");
  expect(turns[1]?.items.map((item) => item.type)).toEqual(["prompt", "message", "status"]);
});
