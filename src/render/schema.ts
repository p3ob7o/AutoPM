import { z } from "zod";

export const ROLE_NAMES = [
  "product", "code", "quality", "design", "marketing",
  "support", "research", "orchestrator", "finance",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
const RoleEnum = z.enum(ROLE_NAMES);

export const ModelId = z.enum([
  "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5",
  "claude-sonnet-4-6", "claude-haiku-4-5", "claude-fable-5",
]);
export type ModelId = z.infer<typeof ModelId>;

// §6A: execution placement is a property of the environment, not the agent.
export const EnvironmentType = z.enum(["cloud", "self_hosted"]);
export type EnvironmentType = z.infer<typeof EnvironmentType>;

const NetworkingSchema = z.object({
  policy: z.enum(["limited", "open"]).default("limited"),
  allow_mcp_servers: z.boolean().default(true),
  allowed_hosts: z.array(z.string()).default([]),
}).strict();

export const EnvironmentDefinition = z.object({
  type: EnvironmentType,
  networking: NetworkingSchema.default({}),
}).strict();
export type EnvironmentDefinition = z.infer<typeof EnvironmentDefinition>;

const EnvironmentsSchema = z.object({
  definitions: z.record(z.string(), EnvironmentDefinition),
  roles: z.record(RoleEnum, z.string()).optional(),
}).strict().superRefine((env, ctx) => {
  for (const [role, name] of Object.entries(env.roles ?? {})) {
    if (name !== undefined && !(name in env.definitions)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roles", role],
        message: `role '${role}' is assigned to environment '${name}', which is not in environments.definitions`,
      });
    }
  }
});

const ProjectSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  repo: z.string().min(1),
  domain: z.string().url(),
  description: z.string().min(1),
}).strict();

/** Secret reference — env:VAR_NAME only; values resolve from the deploy host's env (DOMPROD-4). */
export const VaultRef = z.string().regex(
  /^env:[A-Z_][A-Z0-9_]*$/,
  "vault refs must be env:VAR_NAME (e.g. env:GITHUB_TOKEN)",
);

export const ConfigSchema = z.object({
  project: ProjectSchema,
  models: z.record(RoleEnum, ModelId).optional(),
  environments: EnvironmentsSchema.default({ definitions: { default: { type: "cloud" } } }),
  vault: z.object({
    github: VaultRef,
    linear: VaultRef,
    helpdesk: VaultRef.optional(),
    anthropic: VaultRef,
  }).strict(),
  mcp: z.record(z.string(), z.object({ url: z.string().url() }).strict()),
  webhooks: z.object({
    base_url: z.string().url(),
    routes: z.record(z.string(), z.string()),
  }).strict(),
  budget: z.object({
    monthly_cap_usd: z.number().int().positive(),
    alarm_threshold_pct: z.number().int().min(0).max(100).default(75),
  }).strict(),
  scheduler: z.object({ timezone: z.string().min(1) }).strict(),
}).strict();
export type Config = z.infer<typeof ConfigSchema>;

export interface ResolvedEnvironment { name: string; type: EnvironmentType; }

/** §12: a role runs in its assigned environment; unassigned roles run in `default`. */
export function resolveEnvironment(config: Config, role: RoleName): ResolvedEnvironment {
  const name = config.environments.roles?.[role] ?? "default";
  const def = config.environments.definitions[name];
  if (!def) {
    throw new Error(
      `role '${role}' resolves to environment '${name}', which is not in environments.definitions — assign the role explicitly or add a 'default' definition`,
    );
  }
  return { name, type: def.type };
}

// YAML parsers coerce unquoted ISO dates (e.g. 2026-05-21) into Date objects;
// accept either and normalize to a YYYY-MM-DD string.
const DateString = z.union([z.string(), z.date()]).transform((v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v
);

// §7: there is no sandbox/environment key in agent frontmatter — placement is
// instance configuration. Strict, so a stray legacy key fails render loudly.
export const AgentFrontmatterSchema = z.object({
  title: z.string(),
  type: z.literal("autopm-agent"),
  created: DateString,
  updated: DateString,
  role: z.string().min(1),
  model_default: ModelId,
  session_length: z.object({ typical: z.string() }).strict(),
  multi_agent: z.enum(["coordinator", "none"]),
  tags: z.array(z.string()),
}).strict();
export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

const AGENT_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

// Contract 1 (§13): every emitted agents/<role>.agent.yaml is validated against
// this CreateAgent request shape before it is written — plausible-but-invalid
// YAML must fail at render time, not at `ant beta:agents create` time. Field
// shapes mirror AgentCreateParams in @anthropic-ai/sdk beta.agents (0.97.1):
// entries pin the discriminator + required fields, passthrough for optionals.

const AgentToolsetToolParams = z.object({
  type: z.literal("agent_toolset_20260401"),
  // §7/§10: the agent file's declared default permission policy must survive
  // into the emitted YAML — a toolset entry silently dropping it lets the
  // deployed agent diverge from the spec'd policy.
  default_config: z.object({
    permission_policy: z.object({
      type: z.enum(["always_allow", "always_ask"]),
    }).passthrough(),
  }).passthrough().optional(),
}).passthrough();

const McpToolsetToolParams = z.object({
  type: z.literal("mcp_toolset"),
  mcp_server_name: z.string().min(1).max(255),
}).passthrough();

const CustomToolParams = z.object({
  type: z.literal("custom"),
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(1024),
  input_schema: z.object({
    type: z.literal("object").optional(),
    properties: z.record(z.string(), z.unknown()).nullable().optional(),
    required: z.array(z.string()).optional(),
  }).passthrough(),
}).passthrough();

const SkillParams = z.discriminatedUnion("type", [
  z.object({ type: z.literal("anthropic"), skill_id: z.string().min(1), version: z.string().nullable().optional() }).strict(),
  z.object({ type: z.literal("custom"), skill_id: z.string().min(1), version: z.string().nullable().optional() }).strict(),
]);

// Roster entry: agent ID string, versioned {type:"agent"} reference, or self (§10).
const MultiagentRosterEntry = z.union([
  z.string().min(1),
  z.object({ type: z.literal("agent"), id: z.string().min(1), version: z.number().int().min(1).optional() }).strict(),
  z.object({ type: z.literal("self") }).strict(),
]);

export const CreateAgentSchema = z.object({
  name: z.string().regex(AGENT_NAME_RE, "agent name must be kebab-case").max(256),
  model: ModelId,
  system: z.string().min(1).max(100_000),
  tools: z.array(z.discriminatedUnion("type", [
    AgentToolsetToolParams, McpToolsetToolParams, CustomToolParams,
  ])),
  mcp_servers: z.array(z.object({
    name: z.string().min(1).max(255),
    type: z.literal("url"),
    url: z.string().url(),
  }).strict()).max(20),
  skills: z.array(SkillParams).max(20),
  multiagent: z.object({
    type: z.literal("coordinator"),
    agents: z.array(MultiagentRosterEntry).min(1).max(20),
  }).strict().optional(),
  metadata: z.record(z.string().max(64), z.string().max(512))
    .refine((m) => Object.keys(m).length <= 16, "metadata allows at most 16 pairs"),
}).strict();
export type CreateAgent = z.infer<typeof CreateAgentSchema>;

// Contract 2 (§13): the manifest is a structured deploy contract with explicit
// fields — never a catch-all bag.
export const ManifestSchema = z.object({
  project: ProjectSchema,
  agents: z.array(z.object({
    role: RoleEnum,
    name: z.string().regex(AGENT_NAME_RE),
    model: ModelId,
    environment: z.string().min(1),
    file: z.string().min(1),
  }).strict()),
  environments: z.object({
    definitions: z.record(z.string(), EnvironmentDefinition),
    roles: z.record(RoleEnum, z.string()),
  }).strict(),
  vault: z.array(z.object({
    name: z.string().min(1),
    ref: VaultRef,
  }).strict()),
  mcp_servers: z.array(z.object({
    name: z.string().min(1),
    url: z.string().url(),
  }).strict()),
  memory_stores: z.array(z.object({
    name: z.string().min(1),
    mount: z.string().startsWith("/mnt/memory/"),
    seed: z.string().nullable(),
  }).strict()),
  deployments: z.array(z.object({
    event: z.string().startsWith("cron."),
    role: RoleEnum,
    cron: z.string().min(1),
    timezone: z.string().min(1),
  }).strict()),
  webhook_checklist: z.array(z.object({
    event: z.string().min(1),
    url: z.string().url(),
  }).strict()),
}).strict();
export type Manifest = z.infer<typeof ManifestSchema>;
