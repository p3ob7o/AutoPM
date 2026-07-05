import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { rm, mkdtemp, cp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "../../src/render/index.ts";

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "autopm-"));
  await cp("tests/fixtures/mini", work, { recursive: true });
});
afterEach(async () => { await rm(work, { recursive: true, force: true }); });

describe("render", () => {
  test("renders the demo instance and emits agent JSON with resolved placeholders", async () => {
    const result = await render({ repoRoot: work, instance: "demo" });
    expect(result.agents).toHaveLength(1);

    const agentJson = JSON.parse(await readFile(join(work, "instances/demo/.rendered/agents/product.json"), "utf8"));
    expect(agentJson.displayName).toBe("Product");
    expect(agentJson.model).toBe("claude-opus-4-7");
    expect(agentJson.sandbox.mode).toBe("managed");
    expect(agentJson.systemPrompt).toContain("You are the Product agent for DemoProduct (https://demo.example.com).");
    expect(agentJson.systemPrompt).toContain("Budget cap: 500 USD/month.");
    expect(agentJson.systemPrompt).not.toContain("{{");

    const manifest = JSON.parse(await readFile(join(work, "instances/demo/.rendered/manifest.json"), "utf8"));
    expect(manifest.project.slug).toBe("demoproduct");
    expect(manifest.agents).toContain("product");
  });

  test("throws a clear error when config.yaml is missing", async () => {
    await rm(join(work, "instances/demo/config.yaml"));
    await expect(render({ repoRoot: work, instance: "demo" })).rejects.toThrow(/config.yaml/);
  });

  test("throws when an agent file uses an undeclared placeholder", async () => {
    const p = join(work, "template/agents/Product/agent.md");
    const txt = await readFile(p, "utf8");
    await Bun.write(p, txt.replace("{{project.name}}", "{{project.wizard}}"));
    await expect(render({ repoRoot: work, instance: "demo" })).rejects.toThrow(/unknown placeholder: project.wizard/);
  });
});
