import { test, expect, describe } from "bun:test";
import { ConfigSchema } from "../../src/render/schema.ts";
import { buildContext, collectTokens, resolve } from "../../src/render/placeholders.ts";

const config = ConfigSchema.parse({
  project: { name: "LeanDomainSearch", slug: "leandomainsearch", repo: "git@x:y.git", domain: "https://lds.com", description: "Tool." },
  models: { code: "claude-sonnet-4-6" },
  vault: { github: "op://x/y/GH", linear: "op://x/y/LIN", anthropic: "op://x/y/AN" },
  mcp: { github: { url: "https://gh.mcp/" } },
  sandbox: { default: "managed", roles: { code: { mode: "self_hosted", provider: "cloudflare", endpoint: "https://sbx" } } },
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
  test("resolves role-relative tokens for Product (managed default)", () => {
    const ctx = buildContext(config, "product", "claude-opus-4-7");
    expect(resolve("{{role}} on {{model}} sandbox {{sandbox_mode}}", ctx)).toBe("Product on claude-opus-4-7 sandbox managed");
  });

  test("resolves per-role model + sandbox override for Code", () => {
    const ctx = buildContext(config, "code", "claude-opus-4-7");
    expect(resolve("{{model}}/{{sandbox_mode}}/{{sandbox_provider}}", ctx)).toBe("claude-sonnet-4-6/self_hosted/cloudflare");
  });

  test("resolves project, vault, mcp, webhook, budget tokens", () => {
    const ctx = buildContext(config, "product", "claude-opus-4-7");
    expect(resolve("{{project.name}} {{project.canon_path}} {{vault.github}} {{mcp.github.url}} {{webhook.pr_opened}} {{budget.monthly_cap_usd}}", ctx))
      .toBe("LeanDomainSearch /mnt/memory/product-canon op://x/y/GH https://gh.mcp/ https://hook.example.com/wh/pr.opened 800");
  });

  test("throws on an undeclared token", () => {
    const ctx = buildContext(config, "product", "claude-opus-4-7");
    expect(() => resolve("{{wizard.spell}}", ctx)).toThrow(/unknown placeholder: wizard.spell/);
  });
});
