import type { Manifest } from "../render/schema.ts";
import type { DeployClient } from "./client.ts";
import { isConflict } from "./client.ts";
import type { DeployedState } from "./state.ts";

// Scheduled deployments (§11 class-1 triggers). v1 creates every deployment
// PAUSED: with the Console spend limit deferred (DOMPROD-46), a cron going
// live must be a deliberate act, not a deploy side effect. Unpause via
// `ant beta:deployments unpause <id>` when a milestone activates the trigger.
// Manual runs work while paused (verified in the DOMPROD-5 preflight), so
// paused deployments are still smoke-testable.

export function deploymentName(slug: string, event: string): string {
  return `${slug}-${event}`;
}

export function initialEventText(event: string, projectName: string): string {
  return `Scheduled trigger ${event} for ${projectName}. Follow the instructions your ## Triggers section defines for this event.`;
}

export async function ensureDeployments(
  client: DeployClient,
  manifest: Manifest,
  state: DeployedState,
  report: { created: string[]; unchanged: string[] },
): Promise<void> {
  const slug = manifest.project.slug;
  const existing = await client.listDeployments();

  for (const spec of manifest.deployments) {
    const name = deploymentName(slug, spec.event);
    const matches = (d: { name: string; archived_at: string | null; metadata: Record<string, string> }) =>
      d.name === name && !d.archived_at && d.metadata.autopm_instance === state.instance;

    let found = existing.find(matches);
    if (!found) {
      const agentId = state.agents[spec.role]?.id;
      if (!agentId) throw new Error(`deployment ${name}: role '${spec.role}' has no deployed agent`);
      const envName = manifest.environments.roles[spec.role] ?? "default";
      const envId = state.environments[envName]?.id;
      if (!envId) throw new Error(`deployment ${name}: environment '${envName}' has no deployed id`);
      try {
        const created = await client.createDeployment({
          name,
          agent: agentId,
          environment_id: envId,
          initial_events: [{
            type: "user.message",
            content: [{ type: "text", text: initialEventText(spec.event, manifest.project.name) }],
          }],
          schedule: { type: "cron", expression: spec.cron, timezone: spec.timezone },
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
    state.deployments[spec.event] = { id: found.id, name, status: found.status };
    report.unchanged.push(`deployment ${name}`);
  }
}
