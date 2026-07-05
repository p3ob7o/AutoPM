import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { rm, mkdtemp, cp, readFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { render } from "../../src/render/index.ts";
import { CreateAgentSchema, ManifestSchema } from "../../src/render/schema.ts";

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "autopm-"));
  await cp("tests/fixtures/mini", work, { recursive: true });
});
afterEach(async () => { await rm(work, { recursive: true, force: true }); });

const rendered = (...p: string[]) => join(work, "instances/demo/.rendered", ...p);

describe("render", () => {
  test("emits schema-valid CreateAgent YAML for every agent (contract 1)", async () => {
    const result = await render({ repoRoot: work, instance: "demo" });
    expect(result.agents).toHaveLength(2);

    const product = CreateAgentSchema.parse(parseYaml(await readFile(rendered("agents/product.agent.yaml"), "utf8")));
    expect(product.name).toBe("demoproduct-product");
    expect(product.model).toBe("claude-opus-4-8");
    expect(product.system).toContain("You are the Product agent for DemoProduct (https://demo.example.com).");
    expect(product.system).toContain("in a cloud environment");
    expect(product.system).not.toContain("{{");
    expect(product.multiagent).toBeUndefined();
    expect(product.metadata).toEqual({ autopm_instance: "demo", autopm_role: "product" });

    const orch = CreateAgentSchema.parse(parseYaml(await readFile(rendered("agents/orchestrator.agent.yaml"), "utf8")));
    expect(orch.name).toBe("demoproduct-orchestrator");
    expect(orch.model).toBe("claude-sonnet-5");
    expect(orch.multiagent).toEqual({ type: "coordinator", agents: [{ type: "self" }] });
  });

  test("emits a structured manifest that satisfies the deploy contract (contract 2)", async () => {
    await render({ repoRoot: work, instance: "demo" });
    const manifest = ManifestSchema.parse(JSON.parse(await readFile(rendered("manifest.json"), "utf8")));

    expect(manifest.project.slug).toBe("demoproduct");
    expect(manifest.agents.map((a) => a.role).sort()).toEqual(["orchestrator", "product"]);
    expect(manifest.agents.find((a) => a.role === "orchestrator")).toEqual({
      role: "orchestrator",
      name: "demoproduct-orchestrator",
      model: "claude-sonnet-5",
      environment: "default",
      file: "agents/orchestrator.agent.yaml",
    });

    expect(manifest.environments.roles).toEqual({ orchestrator: "default", product: "default" });
    expect(manifest.environments.definitions.default?.type).toBe("cloud");

    expect(manifest.deployments).toEqual([
      { event: "cron.daily.0900", role: "orchestrator", cron: "0 9 * * *", timezone: "Europe/Lisbon" },
      { event: "cron.weekly.monday.1000", role: "orchestrator", cron: "0 10 * * 1", timezone: "Europe/Lisbon" },
    ]);

    expect(manifest.memory_stores).toEqual([
      { name: "decisions-log", mount: "/mnt/memory/decisions-log", seed: null },
      { name: "product-canon", mount: "/mnt/memory/product-canon", seed: "memory/product-canon.txt" },
      { name: "team-roster", mount: "/mnt/memory/team-roster", seed: null },
    ]);
    expect(manifest.webhook_checklist).toEqual([
      { event: "pr_opened", url: "https://hook.demo.example.com/wh/pr.opened" },
    ]);
    expect(manifest.vault).toEqual([
      { name: "github", ref: "op://x/y/GH" },
      { name: "linear", ref: "op://x/y/LIN" },
      { name: "anthropic", ref: "op://x/y/AN" },
    ]);
  });

  test("resolves memory seeds in the Product context", async () => {
    await render({ repoRoot: work, instance: "demo" });
    const seed = await readFile(rendered("memory/product-canon.txt"), "utf8");
    expect(seed).toContain("Product canon — DemoProduct");
    expect(seed).toContain("run on claude-opus-4-8");
    expect(seed).not.toContain("{{");
  });

  test("throws a clear error when config.yaml is missing", async () => {
    await rm(join(work, "instances/demo/config.yaml"));
    await expect(render({ repoRoot: work, instance: "demo" })).rejects.toThrow(/config.yaml/);
  });

  test("rejects a config that still carries the legacy sandbox block", async () => {
    await appendFile(join(work, "instances/demo/config.yaml"), "sandbox:\n  default: managed\n");
    await expect(render({ repoRoot: work, instance: "demo" })).rejects.toThrow(/sandbox/);
  });

  test("throws when an agent file uses an undeclared placeholder", async () => {
    const p = join(work, "template/agents/Product/agent.md");
    const txt = await readFile(p, "utf8");
    await Bun.write(p, txt.replace("{{project.name}}", "{{project.wizard}}"));
    await expect(render({ repoRoot: work, instance: "demo" })).rejects.toThrow(/unknown placeholder: project.wizard/);
  });
});
