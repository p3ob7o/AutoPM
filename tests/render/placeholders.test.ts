import { test, expect, describe } from "bun:test";
import { ConfigSchema } from "../../src/render/schema.ts";
import { buildContext, collectTokens, resolve } from "../../src/render/placeholders.ts";

const config = ConfigSchema.parse({
  project: { name: "LeanDomainSearch", slug: "leandomainsearch", repo: "git@x:y.git", domain: "https://lds.com", description: "Tool." },
  models: { code: "claude-sonnet-5" },
  environments: {
    definitions: {
      default: { type: "cloud" },
      workers: { type: "self_hosted", networking: { policy: "open" } },
    },
    roles: { code: "workers" },
  },
  vault: { github: "env:GITHUB_TOKEN", linear: "env:LINEAR_API_KEY", anthropic: "env:ANTHROPIC_API_KEY" },
  mcp: { github: { url: "https://gh.mcp/" } },
  webhooks: { base_url: "https://hook.example.com", routes: { pr_opened: "/wh/pr.opened" } },
  budget: { monthly_cap_usd: 800 },
  scheduler: { timezone: "Europe/Lisbon" },
});

describe("collectTokens", () => {
  test("finds all distinct tokens", () => {
    expect(collectTokens("a {{role}} b {{model}} c {{role}}").sort()).toEqual(["model", "role"]);
  });
});

describe("resolve", () => {
  test("resolves role-relative tokens for Product (default environment)", () => {
    const ctx = buildContext(config, "product", "claude-opus-4-8");
    expect(resolve("{{role}} on {{model}} in {{sandbox_mode}}", ctx)).toBe("Product on claude-opus-4-8 in cloud");
  });

  test("resolves per-role model override + environment assignment for Code", () => {
    const ctx = buildContext(config, "code", "claude-opus-4-8");
    expect(resolve("{{model}}/{{sandbox_mode}}", ctx)).toBe("claude-sonnet-5/self_hosted");
  });

  test("renders the rechartered Orchestrator display name (§3)", () => {
    const ctx = buildContext(config, "orchestrator", "claude-opus-4-8");
    expect(resolve("{{role}}", ctx)).toBe("Orchestrator");
  });

  test("resolves project, vault, mcp, webhook, budget tokens", () => {
    const ctx = buildContext(config, "product", "claude-opus-4-8");
    expect(resolve("{{project.name}} {{project.canon_path}} {{vault.github}} {{mcp.github.url}} {{webhook.pr_opened}} {{budget.monthly_cap_usd}}", ctx))
      .toBe("LeanDomainSearch /mnt/memory/product-canon env:GITHUB_TOKEN https://gh.mcp/ https://hook.example.com/wh/pr.opened 800");
  });

  test("dropped May tokens now fail render (§8)", () => {
    const ctx = buildContext(config, "code", "claude-opus-4-8");
    expect(() => resolve("{{sandbox_provider}}", ctx)).toThrow(/unknown placeholder: sandbox_provider/);
    expect(() => resolve("{{sandbox_endpoint}}", ctx)).toThrow(/unknown placeholder: sandbox_endpoint/);
    expect(() => resolve("{{mcp.github.tunnel_id}}", ctx)).toThrow(/unknown placeholder: mcp.github.tunnel_id/);
  });

  test("throws on an undeclared token", () => {
    const ctx = buildContext(config, "product", "claude-opus-4-8");
    expect(() => resolve("{{wizard.spell}}", ctx)).toThrow(/unknown placeholder: wizard.spell/);
  });
});
