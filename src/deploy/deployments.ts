import type { Manifest } from "../render/schema.ts";
import type { DeployClient, PlatformDeployment } from "./client.ts";
import { isConflict } from "./client.ts";
import type { DeployedState } from "./state.ts";
import { isSubset } from "./compare.ts";

// Scheduled deployments (§11 class-1 triggers). v1 creates every deployment
// PAUSED: with the Console spend limit deferred (DOMPROD-46), a cron going
// live must be a deliberate act, not a deploy side effect. Unpause via
// `ant beta:deployments unpause <id>` when a milestone activates the trigger.
// Manual runs work while paused (verified in the DOMPROD-5 preflight), so
// paused deployments are still smoke-testable.
//
// Existing deployments are RECONCILED, not skipped: the platform pins the
// agent version at write time, so after an agent update the deployment would
// keep dispatching the old version forever. Drift in the agent pin, schedule,
// environment, initial events, or vault attachment updates the deployment in
// place. Pause state is the operator's — updates never touch `status`.

export function deploymentName(slug: string, event: string): string {
  return `${slug}-${event}`;
}

export function initialEventText(event: string, projectName: string): string {
  return `Scheduled trigger ${event} for ${projectName}. Follow the instructions your ## Triggers section defines for this event.`;
}

interface DesiredDeployment {
  // The API requires the discriminated selector form (agent.selector.type),
  // same as roster entries — a bare {id, version} object is rejected.
  agent: { type: "agent"; id: string; version: number };
  environment_id: string;
  initial_events: Array<Record<string, unknown>>;
  schedule: { type: "cron"; expression: string; timezone: string };
  vault_ids: string[];
}

function isReconciled(found: PlatformDeployment, desired: DesiredDeployment): boolean {
  return (
    isSubset(desired.agent, found.agent) &&
    found.environment_id === desired.environment_id &&
    isSubset(desired.schedule, found.schedule) &&
    isSubset(desired.initial_events, found.initial_events) &&
    isSubset([...desired.vault_ids].sort(), [...found.vault_ids].sort())
  );
}

export async function ensureDeployments(
  client: DeployClient,
  manifest: Manifest,
  state: DeployedState,
  report: { created: string[]; updated: string[]; unchanged: string[] },
): Promise<void> {
  const slug = manifest.project.slug;
  const existing = await client.listDeployments();
  // Sessions from a deployment get every platform credential in the instance
  // vault (the github static_bearer for MCP PR creation, and whatever later
  // milestones add). Local-only entries have no platform vault presence.
  const vaultIds = state.vault.id ? [state.vault.id] : [];

  for (const spec of manifest.deployments) {
    const name = deploymentName(slug, spec.event);
    const matches = (d: PlatformDeployment) =>
      d.name === name && !d.archived_at && d.metadata.autopm_instance === state.instance;

    const agent = state.agents[spec.role];
    if (!agent) throw new Error(`deployment ${name}: role '${spec.role}' has no deployed agent`);
    const envName = manifest.environments.roles[spec.role] ?? "default";
    const envId = state.environments[envName]?.id;
    if (!envId) throw new Error(`deployment ${name}: environment '${envName}' has no deployed id`);

    const desired: DesiredDeployment = {
      agent: { type: "agent", id: agent.id, version: agent.version },
      environment_id: envId,
      initial_events: [{
        type: "user.message",
        content: [{ type: "text", text: initialEventText(spec.event, manifest.project.name) }],
      }],
      schedule: { type: "cron", expression: spec.cron, timezone: spec.timezone },
      vault_ids: vaultIds,
    };

    let found = existing.find(matches);
    if (!found) {
      try {
        const created = await client.createDeployment({
          name,
          ...desired,
          metadata: { autopm_instance: state.instance, autopm_event: spec.event },
        });
        const paused = await client.pauseDeployment(created.id);
        state.deployments[spec.event] = { id: created.id, name, status: paused.status };
        report.created.push(`deployment ${name} (paused)`);
        continue;
      } catch (err) {
        if (!isConflict(err)) throw err;
        found = (await client.listDeployments()).find(matches);
        if (!found) throw new Error(`deployment ${name}: 409 on create but not found on re-list`);
      }
    }

    if (isReconciled(found, desired)) {
      state.deployments[spec.event] = { id: found.id, name, status: found.status };
      report.unchanged.push(`deployment ${name}`);
      continue;
    }
    const updated = await client.updateDeployment(found.id, { ...desired });
    state.deployments[spec.event] = { id: updated.id, name, status: updated.status };
    report.updated.push(`deployment ${name}`);
  }
}
