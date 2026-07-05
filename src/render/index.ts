import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { ConfigSchema, AgentFrontmatterSchema, ROLE_NAMES, type Config, type RoleName } from "./schema.ts";
import { buildContext, resolve, resolveModel } from "./placeholders.ts";
import { logger } from "../lib/logger.ts";

export interface RenderOptions { repoRoot: string; instance: string; }

export interface RenderedAgent {
  role: RoleName;
  displayName: string;
  model: string;
  sandbox: { mode: string; provider?: string; endpoint?: string };
  multiAgent: "coordinator" | "none";
  systemPrompt: string;
  body: string;
}

export interface RenderResult { agents: RenderedAgent[]; }

function loadConfig(repoRoot: string, instance: string): Config {
  const path = join(repoRoot, "instances", instance, "config.yaml");
  if (!existsSync(path)) throw new Error(`missing config.yaml at ${path}`);
  return ConfigSchema.parse(parseYaml(readFileSync(path, "utf8")));
}

function extractSystemPrompt(body: string): string {
  const idx = body.indexOf("## System Prompt");
  if (idx === -1) throw new Error("agent.md missing '## System Prompt' section");
  const after = body.slice(idx);
  const fence = after.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
  if (!fence) throw new Error("agent.md '## System Prompt' has no fenced block");
  return fence[1];
}

export async function render(opts: RenderOptions): Promise<RenderResult> {
  const { repoRoot, instance } = opts;
  const config = loadConfig(repoRoot, instance);

  const agentsDir = join(repoRoot, "template", "agents");
  const roleDirs = existsSync(agentsDir)
    ? (await readdir(agentsDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  const outDir = join(repoRoot, "instances", instance, ".rendered");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, "agents"), { recursive: true });

  const agents: RenderedAgent[] = [];

  for (const dir of roleDirs) {
    const file = join(agentsDir, dir, "agent.md");
    if (!existsSync(file)) continue;
    const { data, content } = matter(await readFile(file, "utf8"));
    const fm = AgentFrontmatterSchema.parse(data);
    const role = fm.role.toLowerCase() as RoleName;
    if (!ROLE_NAMES.includes(role)) throw new Error(`agent ${dir}: role '${fm.role}' is not a known role`);

    const ctx = buildContext(config, role, fm.model_default);
    const body = resolve(content, ctx);
    const systemPrompt = resolve(extractSystemPrompt(content), ctx);
    const sbRole = config.sandbox.roles?.[role];
    const rendered: RenderedAgent = {
      role,
      displayName: fm.role,
      model: resolveModel(config, role, fm.model_default),
      sandbox: {
        mode: sbRole?.mode ?? config.sandbox.default,
        provider: sbRole?.provider,
        endpoint: sbRole?.endpoint,
      },
      multiAgent: fm.multi_agent,
      systemPrompt,
      body,
    };
    agents.push(rendered);
    await writeFile(join(outDir, "agents", `${role}.json`), JSON.stringify(rendered, null, 2));
  }

  // Memory bootstrap: resolve every instances/<x>/memory/*.md if present.
  const memDir = join(repoRoot, "instances", instance, "memory");
  if (existsSync(memDir)) {
    await mkdir(join(outDir, "memory"), { recursive: true });
    const memCtx = buildContext(config, "product", config.models?.product ?? "claude-opus-4-7");
    for (const f of await readdir(memDir)) {
      if (!f.endsWith(".md")) continue;
      const resolved = resolve(await readFile(join(memDir, f), "utf8"), memCtx);
      await writeFile(join(outDir, "memory", f.replace(/\.md$/, ".txt")), resolved);
    }
  }

  const manifest = {
    project: config.project,
    agents: agents.map((a) => a.role),
    mcp_servers: Object.keys(config.mcp),
    vault_refs: Object.values(config.vault),
    sandbox: config.sandbox,
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  logger.info("render complete", { instance, agents: agents.length });
  return { agents };
}
