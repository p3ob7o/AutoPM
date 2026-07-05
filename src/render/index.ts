import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  AgentFrontmatterSchema, ConfigSchema, CreateAgentSchema, ManifestSchema,
  ROLE_NAMES, resolveEnvironment,
  type Config, type CreateAgent, type EnvironmentType, type Manifest, type RoleName,
} from "./schema.ts";
import { buildContext, resolve, resolveModel } from "./placeholders.ts";
import { collectMemoryStores } from "./sections.ts";
import { collectCronTriggers, cronExpressionFor } from "./triggers.ts";
import { logger } from "../lib/logger.ts";

export interface RenderOptions { repoRoot: string; instance: string; }

export interface RenderedAgent {
  role: RoleName;
  displayName: string;
  model: string;
  environment: { name: string; type: EnvironmentType };
  multiAgent: "coordinator" | "none";
  systemPrompt: string;
  body: string;
  cronTriggers: string[];
  memoryStores: string[];
}

export interface RenderResult { agents: RenderedAgent[]; manifest: Manifest; }

function loadConfig(repoRoot: string, instance: string): Config {
  const path = join(repoRoot, "instances", instance, "config.yaml");
  if (!existsSync(path)) throw new Error(`missing config.yaml at ${path}`);
  try {
    return ConfigSchema.parse(parseYaml(readFileSync(path, "utf8")));
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
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
  const seen = new Set<RoleName>();

  for (const dir of roleDirs.sort()) {
    const file = join(agentsDir, dir, "agent.md");
    if (!existsSync(file)) continue;
    const { data, content } = matter(await readFile(file, "utf8"));
    let fm;
    try {
      fm = AgentFrontmatterSchema.parse(data);
    } catch (err) {
      throw new Error(`${file}: ${(err as Error).message}`);
    }
    const role = fm.role.toLowerCase() as RoleName;
    if (!ROLE_NAMES.includes(role)) throw new Error(`agent ${dir}: role '${fm.role}' is not a known role`);
    if (seen.has(role)) throw new Error(`agent ${dir}: role '${role}' is defined by more than one template directory`);
    seen.add(role);

    const ctx = buildContext(config, role, fm.model_default);
    const body = resolve(content, ctx);
    const systemPrompt = resolve(extractSystemPrompt(content), ctx);
    const environment = resolveEnvironment(config, role);
    const model = resolveModel(config, role, fm.model_default);
    const cronTriggers = collectCronTriggers(body);
    let memoryStores: string[];
    try {
      memoryStores = collectMemoryStores(body);
    } catch (err) {
      throw new Error(`agent '${role}': ${(err as Error).message}`);
    }

    // Contract 1 (§13): validate the CreateAgent shape before writing.
    // tools/mcp_servers/skills stay empty until the agent-authoring milestones
    // land their section parsers; empty arrays are valid CreateAgent input.
    let createAgent: CreateAgent;
    try {
      createAgent = CreateAgentSchema.parse({
        name: `${config.project.slug}-${role}`,
        model,
        system: systemPrompt,
        tools: [],
        mcp_servers: [],
        skills: [],
        ...(fm.multi_agent === "coordinator"
          ? { multiagent: { type: "coordinator", agents: [{ type: "self" }] } }
          : {}),
        metadata: { autopm_instance: instance, autopm_role: role },
      });
    } catch (err) {
      throw new Error(`agent '${role}': emitted YAML fails the CreateAgent contract: ${(err as Error).message}`);
    }
    await writeFile(join(outDir, "agents", `${role}.agent.yaml`), stringifyYaml(createAgent));

    agents.push({
      role,
      displayName: fm.role,
      model,
      environment,
      multiAgent: fm.multi_agent,
      systemPrompt,
      body,
      cronTriggers,
      memoryStores,
    });
  }

  // Memory bootstrap: seed files resolve in the Product role's context (§8);
  // store name = file stem = mount directory (§9).
  const seeds = new Map<string, string>();
  const memDir = join(repoRoot, "instances", instance, "memory");
  if (existsSync(memDir)) {
    await mkdir(join(outDir, "memory"), { recursive: true });
    const productModel = agents.find((a) => a.role === "product")?.model ?? "claude-opus-4-8";
    const memCtx = buildContext(config, "product", productModel);
    for (const f of (await readdir(memDir)).sort()) {
      if (!f.endsWith(".md")) continue;
      const store = f.replace(/\.md$/, "");
      const resolved = resolve(await readFile(join(memDir, f), "utf8"), memCtx);
      await writeFile(join(outDir, "memory", `${store}.txt`), resolved);
      seeds.set(store, `memory/${store}.txt`);
    }
  }

  // The manifest lists every store the agents' `## Memory Stores` tables
  // reference, not just the seeded ones — grows-over-time stores like
  // decisions-log ship with seed: null but must still be provisioned.
  const storeNames = new Set<string>(seeds.keys());
  for (const a of agents) for (const s of a.memoryStores) storeNames.add(s);
  const memoryStores: Manifest["memory_stores"] = [...storeNames].sort().map((name) => ({
    name,
    mount: `/mnt/memory/${name}`,
    seed: seeds.get(name) ?? null,
  }));

  // §11 class-1: one scheduled-deployment spec per declared cron.* trigger.
  const deployments: Manifest["deployments"] = [];
  for (const a of agents) {
    for (const event of a.cronTriggers) {
      try {
        deployments.push({
          event,
          role: a.role,
          cron: cronExpressionFor(event),
          timezone: config.scheduler.timezone,
        });
      } catch (err) {
        throw new Error(`agent '${a.role}' ## Triggers: ${(err as Error).message}`);
      }
    }
  }

  // Contract 2 (§13): validate the structured manifest before writing.
  let manifest: Manifest;
  try {
    manifest = ManifestSchema.parse({
      project: config.project,
      agents: agents.map((a) => ({
        role: a.role,
        name: `${config.project.slug}-${a.role}`,
        model: a.model,
        environment: a.environment.name,
        file: `agents/${a.role}.agent.yaml`,
      })),
      environments: {
        definitions: config.environments.definitions,
        roles: Object.fromEntries(agents.map((a) => [a.role, a.environment.name])),
      },
      vault: Object.entries(config.vault)
        .filter(([, ref]) => ref != null)
        .map(([name, ref]) => ({ name, ref })),
      mcp_servers: Object.entries(config.mcp).map(([name, entry]) => ({ name, url: entry.url })),
      memory_stores: memoryStores,
      deployments,
      webhook_checklist: Object.entries(config.webhooks.routes).map(([event, route]) => ({
        event,
        url: config.webhooks.base_url.replace(/\/$/, "") + route,
      })),
    });
  } catch (err) {
    throw new Error(`manifest fails the deploy contract: ${(err as Error).message}`);
  }
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  logger.info("render complete", { instance, agents: agents.length, deployments: deployments.length });
  return { agents, manifest };
}
