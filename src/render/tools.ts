// ## Tools section → CreateAgent `tools[]` (§7). Two entry kinds render:
// the platform toolset — a line naming `agent_toolset_20260401`, optionally
// carrying its default permission policy as a backticked token on the same
// line — and custom tools: one fenced ```json block per tool, written in the
// CreateAgent custom-tool shape (`type`/`name`/`description`/`input_schema`).
// A custom tool declared in prose (``Custom tool `name` ``) with no matching
// JSON block fails render: a deploy-ready file must not silently drop a tool
// it promises. Shape validation happens once, in the CreateAgent contract
// check at render time.

import { extractSection } from "./sections.ts";

const TOOLSET = "agent_toolset_20260401";
const JSON_FENCE_RE = /```json\s*\n([\s\S]*?)\n```/g;
const POLICY_RE = /`(always_allow|always_ask)`/;
const DECLARED_CUSTOM_RE = /custom tool\s+`([a-z0-9_-]+)`/gi;

export function collectTools(body: string): unknown[] {
  const section = extractSection(body, "Tools");
  if (!section) return [];
  const tools: unknown[] = [];

  const toolsetLine = section.split("\n").find((l) => l.includes(TOOLSET));
  if (toolsetLine) {
    const policy = toolsetLine.match(POLICY_RE)?.[1];
    tools.push(
      policy
        ? { type: TOOLSET, default_config: { permission_policy: { type: policy } } }
        : { type: TOOLSET },
    );
  }

  const emitted = new Set<string>();
  for (const m of section.matchAll(JSON_FENCE_RE)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch (err) {
      throw new Error(
        `invalid JSON in a '## Tools' fenced block: ${(err as Error).message}`,
      );
    }
    tools.push(parsed);
    const name = (parsed as { name?: unknown }).name;
    if (typeof name === "string") emitted.add(name);
  }

  for (const m of section.matchAll(DECLARED_CUSTOM_RE)) {
    if (!emitted.has(m[1])) {
      throw new Error(
        `custom tool '${m[1]}' is declared in '## Tools' but has no fenced json block — declared tools must render, not silently disappear`,
      );
    }
  }
  return tools;
}
