import { test, expect, describe } from "bun:test";
import { rm, mkdtemp, cp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { render } from "../../src/render/index.ts";
import { collectTools } from "../../src/render/tools.ts";

describe("collectTools", () => {
  test("returns [] when there is no ## Tools section", () => {
    expect(collectTools("## Role\nSomething.\n")).toEqual([]);
  });

  test("collects the platform toolset and its declared permission policy", () => {
    const body = "## Tools\n- `agent_toolset_20260401` — default permission `always_allow`.\n";
    expect(collectTools(body)).toEqual([
      { type: "agent_toolset_20260401", default_config: { permission_policy: { type: "always_allow" } } },
    ]);
  });

  test("emits a bare toolset entry when no policy is declared on its line", () => {
    const body = "## Tools\n- `agent_toolset_20260401`.\n";
    expect(collectTools(body)).toEqual([{ type: "agent_toolset_20260401" }]);
  });

  test("throws when a declared custom tool has no fenced json block", () => {
    const body = "## Tools\n- Custom tool `escalate_to_human` — use when confidence is low.\n";
    expect(() => collectTools(body)).toThrow(
      /custom tool 'escalate_to_human' is declared in '## Tools' but has no fenced json block/,
    );
  });

  test("a mis-tagged fence does not satisfy a declared custom tool", () => {
    const body = [
      "## Tools",
      "- Custom tool `ping`.",
      "",
      "```JSON5",
      '{ "type": "custom", "name": "ping", "description": "d", "input_schema": { "type": "object" } }',
      "```",
    ].join("\n");
    expect(() => collectTools(body)).toThrow(/custom tool 'ping'/);
  });

  test("collects custom tools from fenced json blocks", () => {
    const body = [
      "## Tools",
      "- Custom tool `ping`.",
      "",
      "```json",
      '{ "type": "custom", "name": "ping", "description": "d", "input_schema": { "type": "object" } }',
      "```",
      "",
      "## Notes",
      "```json",
      '{ "outside": "the Tools section — ignored" }',
      "```",
    ].join("\n");
    expect(collectTools(body)).toEqual([
      { type: "custom", name: "ping", description: "d", input_schema: { type: "object" } },
    ]);
  });

  test("throws a pointed error on invalid JSON in a Tools fence", () => {
    const body = "## Tools\n```json\n{ not json }\n```\n";
    expect(() => collectTools(body)).toThrow(/invalid JSON in a '## Tools' fenced block/);
  });
});

describe("tools through render", () => {
  async function inTempFixture(fn: (work: string) => Promise<void>) {
    const work = await mkdtemp(join(tmpdir(), "autopm-tools-"));
    try {
      await cp("tests/fixtures/mini", work, { recursive: true });
      await fn(work);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  test("a custom tool that fails the CreateAgent contract fails render loudly", async () => {
    await inTempFixture(async (work) => {
      const p = join(work, "template/agents/Product/agent.md");
      const txt = await readFile(p, "utf8");
      // Drop the required `description` field from the fixture's custom tool.
      await Bun.write(p, txt.replace('"description": "Page the {{project.name}} operator.",', ""));
      await expect(render({ repoRoot: work, instance: "demo" })).rejects.toThrow(
        /agent 'product'.*CreateAgent contract/,
      );
    });
  });
});

// The real template must render real tools: DOMPROD-8's deploy-readiness
// contract is that escalate_to_human reaches the emitted CreateAgent tools[].
test("the real Product agent declares the toolset and escalate_to_human", async () => {
  const raw = await readFile("template/agents/Product/agent.md", "utf8");
  const { content } = matter(raw);
  const tools = collectTools(content) as Array<Record<string, unknown>>;

  expect(tools[0]).toEqual({
    type: "agent_toolset_20260401",
    default_config: { permission_policy: { type: "always_allow" } },
  });
  const custom = tools.find((t) => t.type === "custom") as Record<string, any>;
  expect(custom.name).toBe("escalate_to_human");
  expect(custom.description).toContain("failed acceptance twice");
  expect(custom.input_schema.required).toEqual(["severity", "summary", "proposed_action"]);
  expect(Object.keys(custom.input_schema.properties)).toEqual([
    "severity", "summary", "context", "proposed_action",
  ]);
});
