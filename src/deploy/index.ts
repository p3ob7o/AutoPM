import { join } from "node:path";
import { render } from "../render/index.ts";
import type { Manifest } from "../render/schema.ts";
import { logger } from "../lib/logger.ts";
import { sdkDeployClient, type DeployClient } from "./client.ts";
import { readState, writeState, type DeployedState } from "./state.ts";
import { resolveVaultSecrets, envVarOf, ensureVaultAndCredentials } from "./vault.ts";
import { ensureEnvironments, desiredEnvConfig } from "./environments.ts";
import { ensureMemoryStores } from "./memory.ts";
import { ensureAgents } from "./agents.ts";
import { ensureDeployments, deploymentName } from "./deployments.ts";

// `autopm deploy <instance>` — idempotent provisioning from the rendered
// manifest (§13). Order: environments → vault + credentials → memory stores
// (+seed) → agents (Orchestrator last) → scheduled deployments (created
// paused). Two consecutive runs: the first creates, the second no-ops.

export interface DeployOptions {
  repoRoot: string;
  instance: string;
  dryRun: boolean;
  /** Test seams: injected platform client and environment map. */
  client?: DeployClient;
  env?: Record<string, string | undefined>;
}

export interface DeployReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  state: DeployedState;
}

function printPlan(manifest: Manifest, env: Record<string, string | undefined>, state: DeployedState): void {
  const slug = manifest.project.slug;
  const line = (s: string) => console.log(s);
  line(`deploy plan for instance '${state.instance}' (dry-run — no API calls)`);
  for (const [name, def] of Object.entries(manifest.environments.definitions)) {
    line(`  environment ${slug}-${name}: ${JSON.stringify(desiredEnvConfig(def))}`);
  }
  line(`  vault autopm-${slug}`);
  for (const entry of manifest.vault) {
    const envVar = envVarOf(entry.ref);
    const status = env[envVar] ? "set" : "MISSING";
    const kind = manifest.mcp_servers.some((m) => m.name === entry.name) ? "static_bearer" : "local";
    line(`  credential ${entry.name}: env:${envVar} (${status}) → ${kind}`);
  }
  for (const s of manifest.memory_stores) {
    line(`  memory store ${s.name}${s.seed ? ` seeded from ${s.seed}` : ""} — "${s.description}"`);
  }
  for (const a of manifest.agents) {
    line(`  agent ${a.name} (${a.model}) in environment ${slug}-${a.environment}`);
  }
  for (const d of manifest.deployments) {
    line(`  deployment ${deploymentName(slug, d.event)}: ${d.cron} ${d.timezone} (created paused)`);
  }
  line(`  webhook checklist (manual, out of deploy scope): ${manifest.webhook_checklist.length} entries`);
}

export async function deploy(opts: DeployOptions): Promise<DeployReport> {
  const { repoRoot, instance, dryRun } = opts;
  const env = opts.env ?? process.env;

  // Always re-render: cheap, deterministic, and guarantees the manifest and
  // agent YAML on disk match the template + config (§13 step 1).
  const { manifest } = await render({ repoRoot, instance });
  const renderedDir = join(repoRoot, "instances", instance, ".rendered");
  const state = readState(repoRoot, instance);

  if (dryRun) {
    printPlan(manifest, env, state);
    return { created: [], updated: [], unchanged: [], state };
  }

  // Secrets resolve before ANY platform call — a missing env var stops the
  // deploy while nothing has been touched.
  const secrets = resolveVaultSecrets(manifest, env);

  const client = opts.client ?? (() => {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — deploy needs the platform key in the environment");
    return sdkDeployClient(apiKey);
  })();

  const report: DeployReport = { created: [], updated: [], unchanged: [], state };
  await ensureEnvironments(client, manifest, state, report);
  await ensureVaultAndCredentials(client, manifest, secrets, state, report);
  await ensureMemoryStores(client, manifest, renderedDir, state, report);
  await ensureAgents(client, manifest, renderedDir, state, report);
  await ensureDeployments(client, manifest, state, report);
  await writeState(repoRoot, instance, state);

  logger.info("deploy complete", {
    instance,
    created: report.created.length,
    updated: report.updated.length,
    unchanged: report.unchanged.length,
  });
  for (const r of report.created) logger.info("created", { resource: r });
  for (const r of report.updated) logger.info("updated", { resource: r });
  return report;
}
