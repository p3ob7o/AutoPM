import type { Manifest } from "../render/schema.ts";
import type { DeployClient } from "./client.ts";
import { isConflict } from "./client.ts";
import type { DeployedState } from "./state.ts";
import { isSubset } from "./compare.ts";

// Environments are workspace-unique by name, so the platform name is
// namespaced `<slug>-<manifest name>` — a bare "default" would collide with
// every other instance in the workspace. Networking is ALWAYS set explicitly:
// the platform default is `unrestricted` (verified in the DOMPROD-5
// preflight), and the manifest's `limited` policy is the cost/exfiltration
// guardrail (§6A).

export function desiredEnvConfig(def: Manifest["environments"]["definitions"][string]): Record<string, unknown> {
  if (def.type !== "cloud") {
    throw new Error(
      `environment type '${def.type}' is out of deploy v1 scope — v1 provisions cloud environments only (§6B)`,
    );
  }
  const networking = def.networking.policy === "open"
    ? { type: "unrestricted" }
    : {
        type: "limited",
        allow_mcp_servers: def.networking.allow_mcp_servers,
        allowed_hosts: def.networking.allowed_hosts,
      };
  return { type: "cloud", networking };
}

export async function ensureEnvironments(
  client: DeployClient,
  manifest: Manifest,
  state: DeployedState,
  report: { created: string[]; updated: string[]; unchanged: string[] },
): Promise<void> {
  const slug = manifest.project.slug;
  const existing = await client.listEnvironments();

  for (const [name, def] of Object.entries(manifest.environments.definitions)) {
    const platformName = `${slug}-${name}`;
    const config = desiredEnvConfig(def);
    let env = existing.find((e) => e.name === platformName && !e.archived_at);
    if (!env) {
      try {
        env = await client.createEnvironment({
          name: platformName,
          config,
          metadata: { autopm_instance: state.instance },
        });
        report.created.push(`environment ${platformName}`);
      } catch (err) {
        if (!isConflict(err)) throw err;
        env = (await client.listEnvironments()).find((e) => e.name === platformName && !e.archived_at);
        if (!env) throw new Error(`environment ${platformName}: 409 on create but not found on re-list`);
        report.unchanged.push(`environment ${platformName}`);
      }
    } else if (!isSubset(config, env.config)) {
      env = await client.updateEnvironment(env.id, { config });
      report.updated.push(`environment ${platformName}`);
    } else {
      report.unchanged.push(`environment ${platformName}`);
    }
    state.environments[name] = { id: env.id, platform_name: platformName };
  }
}
