import { test, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import { AgentFrontmatterSchema } from "../../src/render/schema.ts";
import { extractSection, collectMemoryStores } from "../../src/render/sections.ts";
import { collectTools } from "../../src/render/tools.ts";
import { collectCronTriggers, cronExpressionFor } from "../../src/render/triggers.ts";
import { ExecutionPlanSchema } from "../../src/lib/execution-plan.ts";

// DOMPROD-14 deploy-readiness contract for the real Orchestrator template.

const load = async () => matter(await readFile("template/agents/Orchestrator/agent.md", "utf8"));

test("the Orchestrator is the coordinator on claude-opus-4-8", async () => {
  const { data } = await load();
  const fm = AgentFrontmatterSchema.parse(data);
  expect(fm.role).toBe("Orchestrator");
  expect(fm.multi_agent).toBe("coordinator");
  expect(fm.model_default).toBe("claude-opus-4-8");
});

test("memory stores are exactly the §9 read-only trio", async () => {
  const { content } = await load();
  expect(collectMemoryStores(content).map((s) => s.name).sort()).toEqual([
    "decisions-log", "product-canon", "team-roster",
  ]);
});

test("declares the three scheduled triggers, each with a valid cron expression", async () => {
  const { content } = await load();
  const triggers = collectCronTriggers(content).sort();
  expect(triggers).toEqual(["cron.daily.0500", "cron.daily.0900", "cron.weekly.monday.1000"]);
  expect(cronExpressionFor("cron.daily.0500")).toBe("0 5 * * *");
  expect(cronExpressionFor("cron.daily.0900")).toBe("0 9 * * *");
  expect(cronExpressionFor("cron.weekly.monday.1000")).toBe("0 10 * * 1");
});

test("declares the toolset with its policy and escalate_to_human", async () => {
  const { content } = await load();
  const tools = collectTools(content) as Array<Record<string, any>>;
  expect(tools[0]).toEqual({
    type: "agent_toolset_20260401",
    default_config: { permission_policy: { type: "always_allow" } },
  });
  const custom = tools.find((t) => t.type === "custom");
  expect(custom?.name).toBe("escalate_to_human");
  expect(custom?.description).toContain("rejected twice");
  expect(custom?.input_schema.required).toEqual(["severity", "summary", "proposed_action"]);
});

test("the ## Execution Plan example validates against ExecutionPlanSchema", async () => {
  const { content } = await load();
  const section = extractSection(content, "Execution Plan");
  expect(section).not.toBeNull();
  const fence = section!.match(/```json\s*\n([\s\S]*?)\n```/);
  expect(fence).not.toBeNull();
  const example = ExecutionPlanSchema.parse(JSON.parse(fence![1]));
  expect(example.steps.length).toBeGreaterThanOrEqual(2);
  // The example must model both honesty cases: a convened deployed role and
  // a manual fallback with its blocker named.
  const modes = example.steps.map((s) => s.execution);
  expect(modes).toContain("convene");
  expect(modes).toContain("manual_fallback");
  const fallback = example.steps.find((s) => s.execution === "manual_fallback")!;
  expect(fallback.blockers.length).toBeGreaterThanOrEqual(1);
});

test("the system prompt carries the charter boundaries and the artifact contract", async () => {
  const { content } = await load();
  const prompt = extractSection(content, "System Prompt")!;
  const flat = prompt.replace(/\s+/g, " ");
  expect(flat).toContain("Never invent a role");
  expect(prompt).toContain("execution-plan.json");
  expect(prompt).toContain("manual_fallback");
  expect(prompt).toContain("{{budget.monthly_cap_usd}}");
  expect(prompt).not.toMatch(/CRITICAL|you MUST/);
});
