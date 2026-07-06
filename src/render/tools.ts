// ## Tools section → CreateAgent `tools[]` (§7). Two entry kinds render:
// the platform toolset (any line naming `agent_toolset_20260401`) and custom
// tools — one fenced ```json block per tool, written in the CreateAgent
// custom-tool shape (`type`/`name`/`description`/`input_schema`). Shape
// validation happens once, in the CreateAgent contract check at render time.

import { extractSection } from "./sections.ts";

const JSON_FENCE_RE = /```json\s*\n([\s\S]*?)\n```/g;

export function collectTools(body: string): unknown[] {
  const section = extractSection(body, "Tools");
  if (!section) return [];
  const tools: unknown[] = [];
  if (section.includes("agent_toolset_20260401")) {
    tools.push({ type: "agent_toolset_20260401" });
  }
  for (const m of section.matchAll(JSON_FENCE_RE)) {
    try {
      tools.push(JSON.parse(m[1]));
    } catch (err) {
      throw new Error(
        `invalid JSON in a '## Tools' fenced block: ${(err as Error).message}`,
      );
    }
  }
  return tools;
}
