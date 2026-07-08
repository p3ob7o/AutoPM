import type { Manifest } from "../render/schema.ts";
import type { DeployClient } from "./client.ts";
import { isConflict } from "./client.ts";
import type { DeployedState } from "./state.ts";
import { logger } from "../lib/logger.ts";

// Secrets: manifest vault refs are `env:VAR_NAME` (DOMPROD-4 — no external
// secret manager). Values are read from the deploy host's environment at the
// last moment, handed straight to the create call, and never logged or
// persisted.

export interface ResolvedSecret {
  name: string;      // manifest vault entry name, e.g. "github"
  envVar: string;    // e.g. "GITHUB_TOKEN"
  value: string;     // never log, never persist
}

export function envVarOf(ref: string): string {
  if (!ref.startsWith("env:")) throw new Error(`vault ref '${ref}' is not env:VAR_NAME`);
  return ref.slice("env:".length);
}

/** Validates every vault ref against `env`; throws one error naming ALL missing vars. */
export function resolveVaultSecrets(
  manifest: Manifest,
  env: Record<string, string | undefined>,
): Map<string, ResolvedSecret> {
  const out = new Map<string, ResolvedSecret>();
  const missing: string[] = [];
  for (const entry of manifest.vault) {
    const envVar = envVarOf(entry.ref);
    const value = env[envVar];
    if (!value) missing.push(envVar);
    else out.set(entry.name, { name: entry.name, envVar, value });
  }
  if (missing.length) {
    throw new Error(
      `missing environment variable(s) for vault refs: ${missing.join(", ")} — set them in the deploy host's .env`,
    );
  }
  return out;
}

/**
 * v1 credential mapping: a vault entry whose name matches an MCP server
 * becomes a `static_bearer` credential against that server's URL. Entries
 * with no MCP pairing (e.g. `anthropic` — consumed by the dispatcher itself,
 * not by sessions) are validated locally and recorded as type `local`; no
 * platform credential is created for them. Existing credentials are reused
 * as-is: token rotation is out of v1 scope.
 */
export async function ensureVaultAndCredentials(
  client: DeployClient,
  manifest: Manifest,
  secrets: Map<string, ResolvedSecret>,
  state: DeployedState,
  report: { created: string[]; unchanged: string[] },
): Promise<void> {
  const slug = manifest.project.slug;
  const displayName = `autopm-${slug}`;

  let vault = (await client.listVaults()).find((v) => v.display_name === displayName && !v.archived_at);
  if (!vault) {
    try {
      vault = await client.createVault({ display_name: displayName, metadata: { autopm_instance: state.instance } });
      report.created.push(`vault ${displayName}`);
    } catch (err) {
      if (!isConflict(err)) throw err;
      vault = (await client.listVaults()).find((v) => v.display_name === displayName && !v.archived_at);
      if (!vault) throw new Error(`vault ${displayName}: 409 on create but not found on re-list`);
      report.unchanged.push(`vault ${displayName}`);
    }
  } else {
    report.unchanged.push(`vault ${displayName}`);
  }
  state.vault.id = vault.id;

  const existing = await client.listCredentials(vault.id);
  for (const entry of manifest.vault) {
    const secret = secrets.get(entry.name);
    if (!secret) throw new Error(`vault entry '${entry.name}' has no resolved secret`); // unreachable after resolveVaultSecrets
    const mcp = manifest.mcp_servers.find((m) => m.name === entry.name);
    if (!mcp) {
      state.vault.credentials[entry.name] = { id: null, type: "local" };
      report.unchanged.push(`credential ${entry.name} (local — no MCP pairing)`);
      continue;
    }
    const found = existing.find((c) => c.display_name === entry.name && !c.archived_at);
    if (found) {
      state.vault.credentials[entry.name] = { id: found.id, type: "static_bearer" };
      report.unchanged.push(`credential ${entry.name}`);
      continue;
    }
    const created = await client.createCredential(vault.id, {
      display_name: entry.name,
      auth: { type: "static_bearer", token: secret.value, mcp_server_url: mcp.url },
      metadata: { autopm_instance: state.instance },
    });
    state.vault.credentials[entry.name] = { id: created.id, type: "static_bearer" };
    report.created.push(`credential ${entry.name}`);
    logger.info("credential created", { name: entry.name, envVar: secret.envVar, mcp: mcp.url });
  }
}
