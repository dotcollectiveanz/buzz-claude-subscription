// A Buzz conversation's Claude Code sessions, read from the transcripts Claude
// Code keeps in ~/.claude/projects and shown in the host's turn-transcript
// model. Claude Code owns the files; nothing here writes or keeps them.
// `claudeTurns` is from block/buzz-app (Apache-2.0),
// src/bundled/claude-code/transcript.ts.
import { isMessageTool } from "./acp/shims";
import {
  promptMessage,
  promptSections,
  readEventBody,
  STEER,
  type ToolItem,
  type Transcript,
  type TranscriptItem,
  type TranscriptTurn,
} from "./transcript-model";

/** The latest turns shown; the files keep the rest. */
export const TURN_LIMIT = 50;
/** A Claude Code session id: nothing else names a file to read. */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The Buzz tools' MCP server, as Claude names its tools: `mcp__buzz__send`. */
const PREFIX = "mcp__buzz__";

/** The Buzz conversation a session belongs to. */
export type Conversation = Readonly<{ channelId: string; root?: string }>;
type Session = Conversation & Readonly<{ sessionId: string }>;
export type ClaudeTranscript = Transcript & { more: boolean };
/** A person's display name, if known. */
type Names = (pubkey: string) => string | undefined;
/** Reads a file's bytes, as the host's `readFile` does. */
export type ReadFile = (path: string) => Promise<Uint8Array>;

type Json = Record<string, unknown>;
/** What Claude Code writes when a turn is stopped mid-way. */
const INTERRUPTED = /^\[Request interrupted by user/;
/** The result Claude Code records for a tool call a stopped turn cut off. */
const REFUSED = /^The user doesn't want to proceed with this tool use/;
const object = (value: unknown): Json | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : undefined;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const blocks = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((block) => {
    const entry = object(block);
    return entry ? [entry] : [];
  });
const text = (value: unknown) =>
  typeof value === "string"
    ? value
    : blocks(value)
        .map((block) => str(block.text))
        .filter(Boolean)
        .join("\n");
const KINDS: Record<string, string> = {
  Bash: "execute",
  Read: "read",
  Edit: "edit",
  Write: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Grep: "search",
  Glob: "search",
  WebFetch: "fetch",
  WebSearch: "fetch",
};

/** A Buzz prompt, or a steer, as the turn's opening item. */
function prompt(
  id: string,
  at: number,
  raw: string,
  name?: Names,
): TranscriptItem {
  let sections = promptSections(raw);
  const steer = sections.find((section) => section.tag === STEER);
  // An older steer wraps a whole turn.
  if (steer && !readEventBody(steer.body))
    sections = promptSections(steer.body);
  const { text, author, authorPubkey } = promptMessage(sections, name);
  return {
    id,
    at,
    type: "prompt",
    text: text || raw,
    ...(author ? { author } : {}),
    ...(authorPubkey ? { authorPubkey } : {}),
    sections,
    steer: !!steer,
  };
}

/** Transcript lines as turns, each opened by a prompt. Claude Code's own
 * entries (metadata, subagents, attachments) are left out. */
export function claudeTurns(
  file: string,
  conversation: Session,
  working: boolean,
  name?: Names,
): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  const tools = new Map<string, ToolItem>();
  /** Messages sent with send, until their result says whether they were posted. */
  const sends = new Map<
    string,
    { turn: TranscriptTurn; message: { posted?: boolean }; final: boolean }
  >();
  /** Turns a final Buzz send ended: Buzz stops the turn once that send has
   * posted, and Claude Code then records the send as refused and the turn as
   * interrupted, though it was neither. */
  const finished = new Set<TranscriptTurn>();
  let last = 0;
  const turn = (id: string, at: number, partial: boolean) => {
    const current = turns.at(-1);
    if (current) current.endedAt = Math.max(last, current.startedAt);
    const next: TranscriptTurn = {
      turnId: id,
      channelId: conversation.channelId,
      threadRootId: conversation.root ?? null,
      triggeringEventIds: [],
      sessionId: conversation.sessionId,
      newSession: false,
      config: [],
      startedAt: at,
      partial,
      items: [],
    };
    turns.push(next);
    return next;
  };
  for (const line of file.split("\n")) {
    let entry: Json | undefined;
    try {
      entry = object(JSON.parse(line));
    } catch {
      continue;
    }
    if (!entry || entry.isSidechain || entry.isMeta) continue;
    const message = object(entry.message);
    const id = str(entry.uuid);
    const at = Date.parse(str(entry.timestamp)) || last;
    if (
      !message ||
      !id ||
      (entry.type !== "user" && entry.type !== "assistant")
    )
      continue;
    const results = blocks(message.content).filter(
      (block) => block.type === "tool_result",
    );
    if (entry.type === "user" && !results.length) {
      const said = text(message.content);
      if (INTERRUPTED.test(said)) {
        const current = turns.at(-1);
        if (current && !finished.has(current)) current.stopReason = "stopped";
        continue;
      }
      const item = prompt(id, at, said, name);
      const current =
        item.type === "prompt" && item.steer ? turns.at(-1) : undefined;
      (current ?? turn(id, at, false)).items.push(item);
      last = at;
      continue;
    }
    const current = turns.at(-1) ?? turn(id, at, true);
    last = at;
    for (const result of results) {
      const sent = sends.get(str(result.tool_use_id));
      const refused =
        !!result.is_error && REFUSED.test(text(result.content));
      if (sent && (!result.is_error || (sent.final && refused))) {
        sent.message.posted = true;
        if (sent.final) finished.add(sent.turn);
      } else if (sent) {
        sent.turn.items.push({
          id: `${id}:${str(result.tool_use_id)}`,
          at,
          type: "status",
          text: `The message above was not posted: ${text(result.content)}`,
        });
      }
      const tool = tools.get(str(result.tool_use_id));
      if (!tool) continue;
      tool.output = text(result.content);
      tool.status = result.is_error ? "failed" : "completed";
      tool.completedAt = at;
    }
    blocks(message.content).forEach((block, index) => {
      const key = `${id}:${index}`;
      if (block.type === "text" && str(block.text).trim())
        current.items.push({
          id: key,
          at,
          type: "message",
          text: str(block.text),
        });
      else if (block.type === "thinking" && str(block.thinking).trim())
        current.items.push({
          id: key,
          at,
          type: "thought",
          text: str(block.thinking),
        });
      else if (block.type === "tool_use") {
        const name = str(block.name);
        const input = object(block.input) ?? {};
        if (
          name.startsWith(PREFIX) &&
          isMessageTool(name.slice(PREFIX.length)) &&
          str(input.text).trim()
        ) {
          const message: TranscriptItem & { posted?: boolean } = {
            id: key,
            at,
            type: "message",
            text: str(input.text),
          };
          current.items.push(message);
          sends.set(str(block.id), {
            turn: current,
            message,
            final: input.final === true,
          });
          return;
        }
        const path = str(input.file_path) || str(input.path);
        const tool: ToolItem = {
          id: key,
          at,
          type: "tool",
          toolCallId: str(block.id),
          // MCP tools as Codex names them: buzz.read, not mcp__buzz__read.
          title: str(input.command) || name.replace(/^mcp__(.+?)__/, "$1."),
          kind: KINDS[name] ?? "other",
          status: "in_progress",
          input: JSON.stringify(input, null, 2),
          output: "",
          diffs: [],
          paths: path ? [path] : [],
          truncated: false,
        };
        tools.set(tool.toolCallId, tool);
        current.items.push(tool);
      }
    });
  }
  const current = turns.at(-1);
  if (current && !working) current.endedAt = Math.max(last, current.startedAt);
  // A session file holds the whole session, from its start.
  if (turns[0] && !turns[0].partial) turns[0].newSession = true;
  return turns;
}

/** Claude Code's project folder name for a working directory. Longer paths
 * get a hash suffix this does not reproduce, so they are not found. */
export const projectName = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

/** The conversation's latest turns: its sessions, newest first as they are
 * saved, read until there are more than enough. `project` is the absolute
 * folder Claude Code keeps the agent's sessions in. A session with no file yet
 * (opened, but never sent a message) is skipped. */
export async function readTranscript(
  read: ReadFile,
  project: string,
  sessions: readonly string[],
  conversation: Conversation,
  working: boolean,
  signal: AbortSignal,
  name?: Names,
): Promise<ClaudeTranscript> {
  const found: TranscriptTurn[][] = [];
  const failures: unknown[] = [];
  let count = 0;
  let index = 0;
  for (; index < sessions.length && count <= TURN_LIMIT; index++) {
    const sessionId = sessions[index];
    if (!sessionId || !SESSION_ID.test(sessionId)) continue;
    signal.throwIfAborted();
    let file: string;
    try {
      file = new TextDecoder().decode(
        await read(`${project}/${sessionId}.jsonl`),
      );
    } catch (error) {
      failures.push(error);
      continue;
    }
    signal.throwIfAborted();
    const turns = claudeTurns(
      file,
      { ...conversation, sessionId },
      // Only the newest session can still be running.
      working && index === 0,
      name,
    );
    found.unshift(turns);
    count += turns.length;
  }
  if (!found.length && failures.length) throw failures[0];
  const all = found.flat();
  return {
    turns: all.slice(-TURN_LIMIT),
    more: all.length > TURN_LIMIT || index < sessions.length,
  };
}
