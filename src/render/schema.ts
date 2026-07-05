import { z } from "zod";

export const ROLE_NAMES = [
  "product", "code", "quality", "design", "marketing",
  "support", "research", "project", "finance",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
const RoleEnum = z.enum(ROLE_NAMES);

export const ModelId = z.enum([
  "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5",
]);
export type ModelId = z.infer<typeof ModelId>;

export const SandboxMode = z.enum(["managed", "self_hosted"]);
export type SandboxMode = z.infer<typeof SandboxMode>;
export const SandboxProvider = z.enum(["cloudflare", "daytona", "modal", "vercel", "self"]);

const SandboxRoleConfig = z.object({
  mode: SandboxMode,
  provider: SandboxProvider.optional(),
  endpoint: z.string().url().optional(),
});

export const ConfigSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
    repo: z.string().min(1),
    domain: z.string().url(),
    description: z.string().min(1),
  }),
  models: z.record(RoleEnum, ModelId).optional(),
  vault: z.object({
    github: z.string().min(1),
    linear: z.string().min(1),
    helpdesk: z.string().optional(),
    anthropic: z.string().min(1),
  }),
  mcp: z.record(z.string(), z.object({
    url: z.string().url(),
    tunnel_id: z.string().optional(),
  })),
  sandbox: z.object({
    default: SandboxMode.default("managed"),
    roles: z.record(RoleEnum, SandboxRoleConfig).optional(),
  }).default({ default: "managed" }),
  webhooks: z.object({
    base_url: z.string().url(),
    routes: z.record(z.string(), z.string()),
  }),
  budget: z.object({
    monthly_cap_usd: z.number().int().positive(),
    alarm_threshold_pct: z.number().int().min(0).max(100).default(75),
  }),
  scheduler: z.object({ timezone: z.string().min(1) }),
});
export type Config = z.infer<typeof ConfigSchema>;

// YAML parsers coerce unquoted ISO dates (e.g. 2026-05-21) into Date objects;
// accept either and normalize to a YYYY-MM-DD string.
const DateString = z.union([z.string(), z.date()]).transform((v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v
);

export const AgentFrontmatterSchema = z.object({
  title: z.string(),
  type: z.literal("autopm-agent"),
  created: DateString,
  updated: DateString,
  role: z.string().min(1),
  model_default: ModelId,
  sandbox_default: SandboxMode,
  session_length: z.object({ typical: z.string() }),
  multi_agent: z.enum(["coordinator", "none"]),
  tags: z.array(z.string()),
});
export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;
