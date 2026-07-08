import { test, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { AgentFrontmatterSchema, ROLE_NAMES } from "../../src/render/schema.ts";
import { collectMemoryStores } from "../../src/render/sections.ts";

// The real template must stay parseable under the final schema — template
// drift (legacy keys, unknown model, coordinator outside the Orchestrator)
// fails here, not at the first render of a real instance.
test("every template/agents/<Role>/agent.md parses under the final frontmatter schema", async () => {
  const agentsDir = "template/agents";
  const dirs = (await readdir(agentsDir, { withFileTypes: true })).filter((d) => d.isDirectory());
  expect(dirs.length).toBeGreaterThanOrEqual(1);

  for (const d of dirs) {
    const raw = await readFile(join(agentsDir, d.name, "agent.md"), "utf8");
    const fm = AgentFrontmatterSchema.parse(matter(raw).data);
    expect(ROLE_NAMES).toContain(fm.role.toLowerCase() as (typeof ROLE_NAMES)[number]);
    if (fm.multi_agent === "coordinator") expect(fm.role).toBe("Orchestrator");
  }
});

test("the Product agent defaults to claude-opus-4-8 and is not the coordinator (§7)", async () => {
  const raw = await readFile("template/agents/Product/agent.md", "utf8");
  const fm = AgentFrontmatterSchema.parse(matter(raw).data);
  expect(fm.model_default).toBe("claude-opus-4-8");
  expect(fm.multi_agent).toBe("none");
});

test("the Product agent's Memory Stores table parses to the §9 stores it declares", async () => {
  const raw = await readFile("template/agents/Product/agent.md", "utf8");
  const { content } = matter(raw);
  expect(collectMemoryStores(content).map((s) => s.name).sort()).toEqual([
    "decisions-log", "finance-actuals", "product-canon", "team-roster",
  ]);
});
