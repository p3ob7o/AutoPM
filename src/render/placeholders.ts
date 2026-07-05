import type { Config, RoleName } from "./schema.ts";

const ROLE_DISPLAY: Record<RoleName, string> = {
  product: "Product", code: "Code", quality: "Quality", design: "Design",
  marketing: "Marketing", support: "Support", research: "Research",
  project: "Project", finance: "Finance",
};

export interface PlaceholderContext {
  config: Config;
  role: RoleName;
  resolvedModel: string;
}

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function collectTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) out.add(m[1]);
  return [...out];
}

/** Effective model for a role: per-role config override wins over the agent's default. */
export function resolveModel(config: Config, role: RoleName, modelDefault: string): string {
  return config.models?.[role] ?? modelDefault;
}

export function buildContext(config: Config, role: RoleName, modelDefault: string): PlaceholderContext {
  return { config, role, resolvedModel: resolveModel(config, role, modelDefault) };
}

function lookup(token: string, ctx: PlaceholderContext): string {
  const { config, role } = ctx;
  const sb = config.sandbox.roles?.[role];
  switch (token) {
    case "role": return ROLE_DISPLAY[role];
    case "model": return ctx.resolvedModel;
    case "sandbox_mode": return sb?.mode ?? config.sandbox.default;
    case "sandbox_provider": return sb?.provider ?? "";
    case "sandbox_endpoint": return sb?.endpoint ?? "";
    case "project.name": return config.project.name;
    case "project.slug": return config.project.slug;
    case "project.repo": return config.project.repo;
    case "project.domain": return config.project.domain;
    case "project.description": return config.project.description;
    case "project.canon_path": return "/mnt/memory/product-canon";
    case "budget.monthly_cap_usd": return String(config.budget.monthly_cap_usd);
    case "scheduler.timezone": return config.scheduler.timezone;
  }
  if (token.startsWith("vault.")) {
    const name = token.slice("vault.".length) as keyof Config["vault"];
    const v = config.vault[name];
    if (v == null) throw new Error(`unknown placeholder: ${token} (no vault entry)`);
    return v;
  }
  if (token.startsWith("mcp.")) {
    const rest = token.slice("mcp.".length);
    const [name, field] = rest.split(".");
    const entry = config.mcp[name];
    if (!entry) throw new Error(`unknown placeholder: ${token} (no mcp server)`);
    if (field === "url") return entry.url;
    if (field === "tunnel_id") return entry.tunnel_id ?? "";
    throw new Error(`unknown placeholder: ${token} (bad mcp field)`);
  }
  if (token.startsWith("webhook.")) {
    const event = token.slice("webhook.".length);
    const route = config.webhooks.routes[event];
    if (!route) throw new Error(`unknown placeholder: ${token} (no webhook route)`);
    return config.webhooks.base_url.replace(/\/$/, "") + route;
  }
  throw new Error(`unknown placeholder: ${token}`);
}

export function resolve(text: string, ctx: PlaceholderContext): string {
  return text.replace(TOKEN_RE, (_full, token: string) => lookup(token.trim(), ctx));
}
