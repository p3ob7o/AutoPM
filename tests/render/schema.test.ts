import { test, expect, describe } from "bun:test";
import { ConfigSchema, AgentFrontmatterSchema, ROLE_NAMES } from "../../src/render/schema.ts";

describe("ConfigSchema", () => {
  const valid = {
    project: {
      name: "LeanDomainSearch",
      slug: "leandomainsearch",
      repo: "git@github.a8c.com:Automattic/leandomainsearch.git",
      domain: "https://leandomainsearch.com",
      description: "Domain search tool.",
    },
    vault: { github: "op://x/y/GH", linear: "op://x/y/LIN", anthropic: "op://x/y/AN" },
    mcp: { github: { url: "https://api.githubcopilot.com/mcp/" } },
    webhooks: { base_url: "https://x.example.com", routes: { pr_opened: "/wh/pr" } },
    budget: { monthly_cap_usd: 800 },
    scheduler: { timezone: "Europe/Lisbon" },
  };

  test("accepts a valid config and defaults sandbox to managed", () => {
    const parsed = ConfigSchema.parse(valid);
    expect(parsed.sandbox.default).toBe("managed");
    expect(parsed.budget.alarm_threshold_pct).toBe(75);
  });

  test("rejects a bad slug", () => {
    expect(() => ConfigSchema.parse({ ...valid, project: { ...valid.project, slug: "Bad Slug" } })).toThrow();
  });

  test("rejects an unknown role in models", () => {
    expect(() => ConfigSchema.parse({ ...valid, models: { wizard: "claude-opus-4-7" } })).toThrow();
  });

  test("accepts per-role sandbox override", () => {
    const parsed = ConfigSchema.parse({
      ...valid,
      sandbox: { default: "managed", roles: { code: { mode: "self_hosted", provider: "cloudflare", endpoint: "https://sbx.example.com" } } },
    });
    expect(parsed.sandbox.roles?.code?.mode).toBe("self_hosted");
  });
});

describe("AgentFrontmatterSchema", () => {
  test("accepts valid frontmatter", () => {
    const fm = {
      title: "Product Agent",
      type: "autopm-agent",
      created: "2026-05-21",
      updated: "2026-05-21",
      role: "Product",
      model_default: "claude-opus-4-7",
      sandbox_default: "managed",
      session_length: { typical: "5-30 min" },
      multi_agent: "coordinator",
      tags: ["autopm", "agent", "product"],
    };
    expect(AgentFrontmatterSchema.parse(fm).role).toBe("Product");
  });

  test("rejects wrong type literal", () => {
    expect(() => AgentFrontmatterSchema.parse({ type: "doc" })).toThrow();
  });
});

test("ROLE_NAMES has all nine roles", () => {
  expect(ROLE_NAMES).toEqual(["product", "code", "quality", "design", "marketing", "support", "research", "project", "finance"]);
});
