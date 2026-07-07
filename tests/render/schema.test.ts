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
  vault: { github: "env:GITHUB_TOKEN", linear: "env:LINEAR_API_KEY", anthropic: "env:ANTHROPIC_API_KEY" },
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

  test("accepts populated fields in the real SDK shapes", () => {
    const parsed = CreateAgentSchema.parse({
      ...minimal,
      tools: [
        { type: "agent_toolset_20260401" },
        { type: "mcp_toolset", mcp_server_name: "github" },
        { type: "custom", name: "escalate_to_human", description: "Page a human operator.", input_schema: { type: "object" } },
      ],
      mcp_servers: [{ type: "url", name: "github", url: "https://api.githubcopilot.com/mcp/" }],
      skills: [
        { type: "anthropic", skill_id: "xlsx" },
        { type: "custom", skill_id: "skill_01XJ5abc", version: "3" },
      ],
      multiagent: {
        type: "coordinator",
        agents: [{ type: "self" }, "agent_01ABC", { type: "agent", id: "agent_01DEF", version: 2 }],
      },
    });
    expect(parsed.multiagent?.agents).toHaveLength(3);
    expect(parsed.skills).toHaveLength(2);
  });

  test("rejects an MCP server entry without its 'url' type discriminator", () => {
    expect(() => CreateAgentSchema.parse({
      ...minimal,
      mcp_servers: [{ name: "github", url: "https://api.githubcopilot.com/mcp/" }],
    })).toThrow();
  });

  test("rejects skill entries that are not type + skill_id", () => {
    expect(() => CreateAgentSchema.parse({ ...minimal, skills: [{ id: "xlsx" }] })).toThrow();
    expect(() => CreateAgentSchema.parse({ ...minimal, skills: [{ skill_id: "xlsx" }] })).toThrow();
  });

  test("rejects the pre-review {agent_id} roster shape", () => {
    expect(() => CreateAgentSchema.parse({
      ...minimal,
      multiagent: { type: "coordinator", agents: [{ agent_id: "agent_01ABC" }] },
    })).toThrow();
  });

  test("rejects an mcp_toolset tool without mcp_server_name", () => {
    expect(() => CreateAgentSchema.parse({ ...minimal, tools: [{ type: "mcp_toolset" }] })).toThrow();
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
