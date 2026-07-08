import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// .deployed.json — id + version of every provisioned resource (§13), keyed by
// manifest name so re-runs resolve platform resources without guessing.
// Secret values NEVER appear here.

export interface DeployedState {
  instance: string;
  deployed_at: string;
  environments: Record<string, { id: string; platform_name: string }>;
  vault: {
    id: string | null;
    credentials: Record<string, { id: string | null; type: "static_bearer" | "local" }>;
  };
  memory_stores: Record<string, { id: string; seeded: boolean }>;
  agents: Record<string, { id: string; version: number; name: string }>;
  deployments: Record<string, { id: string; name: string; status: string }>;
}

export function emptyState(instance: string): DeployedState {
  return {
    instance,
    deployed_at: "",
    environments: {},
    vault: { id: null, credentials: {} },
    memory_stores: {},
    agents: {},
    deployments: {},
  };
}

function statePath(repoRoot: string, instance: string): string {
  return join(repoRoot, "instances", instance, ".deployed.json");
}

export function readState(repoRoot: string, instance: string): DeployedState {
  const path = statePath(repoRoot, instance);
  if (!existsSync(path)) return emptyState(instance);
  try {
    return { ...emptyState(instance), ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    // A corrupt state file must not brick deploys — idempotency falls back to
    // list-by-name lookups and the file is rewritten on success.
    return emptyState(instance);
  }
}

export async function writeState(repoRoot: string, instance: string, state: DeployedState): Promise<void> {
  state.deployed_at = new Date().toISOString();
  await writeFile(statePath(repoRoot, instance), JSON.stringify(state, null, 2) + "\n");
}
