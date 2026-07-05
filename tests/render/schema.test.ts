import { test, expect, describe } from "bun:test";
import {
  ConfigSchema, AgentFrontmatterSchema, CreateAgentSchema,
  ModelId, ROLE_NAMES, resolveEnvironment,
} from "../../src/render/schema.ts";

const valid = {
  project: {
    name: "LeanDomainSearch",
    slug: "leandomainsearch",
    repo: "git@github.com:acme/leandomainsearch.git",
    domain: "https://leandomainsearch.com",
    description: "Domain search tool.",
  },
  vault: { github: "op://a/g/cred", linear: "op://a/l/cred", anthropic: "op://a/an/cred" },
  mcp: { github: { url: "https://api.githubcopilot.com/mcp/" } },
  webhooks: { base_url: "https://x.example.com", routes: { pr_opened: "/wh/pr" } },
  budget: { monthly_cap_usd: 800 },
  scheduler: { timezone: "Europe/Lisbon" },
};

describe("ConfigSchema", () => {
  test("accepts a valid config and defaults environments to one shared cloud 'default'", () => {
    const parsed = ConfigSchema.parse(valid);
    expect(parsed.environments.definitions.default?.type).toBe("cloud");
    expect(parsed.environments.definitions.default?.networking).toEqual({
      policy: "limited", allow_mcp_servers: true, allowed_hosts: [],
    });
    expect(parsed.budget.alarm_threshold_pct).toBe(75);
  });

  test("rejects a bad slug", () => {
    expect(() => ConfigSchema.parse({ ...valid, project: { ...valid.project, slug: "Bad Slug" } })).toThrow();
  });

  test("rejects an unknown role in models", () => {
    expect(() => ConfigSchema.parse({ ...valid, models: { wizard: "claude-opus-4-8" } })).toThrow();
  });

  test("ModelId covers the §4 set and nothing else", () => {
    for (const id of [
      "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5",
      "claude-sonnet-4-6", "claude-haiku-4-5", "claude-fable-5",
    ] as const) {
      expect(ModelId.parse(id)).toBe(id);
    }
    expect(() => ModelId.parse("claude-opus-4-6")).toThrow();
  });

  test("accepts named environments with per-role assignment", () => {
    const parsed = ConfigSchema.parse({
      ...valid,
      environments: {
        definitions: {
          default: { type: "cloud" },
          workers: { type: "self_hosted", networking: { policy: "open" } },
        },
        roles: { code: "workers" },
      },
    });
    expect(parsed.environments.roles?.code).toBe("workers");
    expect(parsed.environments.definitions.workers?.networking.allow_mcp_servers).toBe(true);
  });

  test("rejects a role assigned to an undefined environment", () => {
    expect(() => ConfigSchema.parse({
      ...valid,
      environments: { definitions: { default: { type: "cloud" } }, roles: { code: "workers" } },
    })).toThrow(/not in environments.definitions/);
  });

  test("rejects the legacy sandbox block", () => {
    expect(() => ConfigSchema.parse({ ...valid, sandbox: { default: "managed" } })).toThrow(/sandbox/);
  });

  test("rejects tunnel_id on an mcp server (§6A: no such field)", () => {
    expect(() => ConfigSchema.parse({
      ...valid,
      mcp: { github: { url: "https://api.githubcopilot.com/mcp/", tunnel_id: "tnl_abc" } },
    })).toThrow(/tunnel_id/);
  });
});

describe("resolveEnvironment", () => {
  test("unassigned roles fall back to 'default'", () => {
    const parsed = ConfigSchema.parse(valid);
    expect(resolveEnvironment(parsed, "product")).toEqual({ name: "default", type: "cloud" });
  });

  test("explicit assignment wins", () => {
    const parsed = ConfigSchema.parse({
      ...valid,
      environments: {
        definitions: { default: { type: "cloud" }, workers: { type: "self_hosted" } },
        roles: { code: "workers" },
      },
    });
    expect(resolveEnvironment(parsed, "code")).toEqual({ name: "workers", type: "self_hosted" });
  });

  test("throws when an unassigned role has no 'default' definition to fall back to", () => {
    const parsed = ConfigSchema.parse({
      ...valid,
      environments: { definitions: { main: { type: "cloud" } }, roles: { product: "main" } },
    });
    expect(() => resolveEnvironment(parsed, "code")).toThrow(/'default'/);
  });
});

describe("AgentFrontmatterSchema", () => {
  const fm = {
    title: "Product Agent",
    type: "autopm-agent",
    created: "2026-05-21",
    updated: "2026-07-06",
    role: "Product",
    model_default: "claude-opus-4-8",
    session_length: { typical: "5-30 min" },
    multi_agent: "none",
    tags: ["autopm", "agent", "product"],
  };

  test("accepts the §7 shape", () => {
    expect(AgentFrontmatterSchema.parse(fm).model_default).toBe("claude-opus-4-8");
  });

  test("rejects the legacy sandbox_default key (§7: placement is instance config)", () => {
    expect(() => AgentFrontmatterSchema.parse({ ...fm, sandbox_default: "managed" })).toThrow(/sandbox_default/);
  });

  test("rejects wrong type literal", () => {
    expect(() => AgentFrontmatterSchema.parse({ ...fm, type: "doc" })).toThrow();
  });
});

describe("CreateAgentSchema", () => {
  const minimal = {
    name: "demo-product",
    model: "claude-opus-4-8",
    system: "You are the Product agent.",
    tools: [],
    mcp_servers: [],
    skills: [],
    metadata: { autopm_instance: "demo", autopm_role: "product" },
  };

  test("accepts a minimal specialist agent", () => {
    expect(CreateAgentSchema.parse(minimal).name).toBe("demo-product");
  });

  test("accepts a coordinator with a self roster", () => {
    const parsed = CreateAgentSchema.parse({
      ...minimal,
      multiagent: { type: "coordinator", agents: [{ type: "self" }] },
    });
    expect(parsed.multiagent?.agents).toHaveLength(1);
  });

  test("rejects an unknown model id", () => {
    expect(() => CreateAgentSchema.parse({ ...minimal, model: "gpt-6" })).toThrow();
  });

  test("rejects an empty system prompt", () => {
    expect(() => CreateAgentSchema.parse({ ...minimal, system: "" })).toThrow();
  });

  test("rejects stray fields — the YAML is flat CreateAgent, nothing else", () => {
    expect(() => CreateAgentSchema.parse({ ...minimal, sandbox: "cloud" })).toThrow(/sandbox/);
  });
});

test("ROLE_NAMES: nine roles, 'project' rechartered to 'orchestrator' (§3)", () => {
  expect(ROLE_NAMES).toEqual([
    "product", "code", "quality", "design", "marketing",
    "support", "research", "orchestrator", "finance",
  ]);
});
