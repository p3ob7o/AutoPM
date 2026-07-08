import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { CreateAgentSchema, type CreateAgent, type Manifest } from "../render/schema.ts";
import type { DeployClient, PlatformAgent } from "./client.ts";
import { isConflict } from "./client.ts";
import type { DeployedState } from "./state.ts";
import { isSubset } from "./compare.ts";

// Agents deploy from the renderer's emitted .agent.yaml — never hand-written
// shapes (§13 Contract 1). Specialists go first; the Orchestrator goes last
// and its coordinator roster is resolved HERE: the rendered roster is only
// {type:"self"}, and deploy appends each live specialist's agent ID (§10), so
// the roster never references an agent that does not exist.
//
// Platform reality (verified in the DOMPROD-10 smoke): the roster is
// MATERIALIZED on write — {type:"self"} comes back as a concrete
// {type:"agent", id, version} and unversioned refs get version-pinned. So
// roster drift is compared semantically against the materialized form, and a
// specialist version bump makes the pin stale, which re-pins the roster on
// the next deploy. Updates create new versions; unchanged agents are left
// alone so a second run no-ops.

interface AgentReport { created: string[]; updated: string[]; unchanged: string[] }

interface RosterPin { id: string; version: number }

function desiredParams(spec: CreateAgent, roster: RosterPin[] | null): Record<string, unknown> {
  return {
    name: spec.name,
    model: { id: spec.model },
    system: spec.system,
    tools: spec.tools,
    mcp_servers: spec.mcp_servers,
    skills: spec.skills,
    ...(roster
      ? {
          multiagent: {
            type: "coordinator",
            agents: [
              { type: "self" },
              ...roster.map((p) => ({ type: "agent", id: p.id, version: p.version })),
            ],
          },
        }
      : {}),
    metadata: spec.metadata,
  };
}

/** The materialized roster the platform echoes: self resolved to own id, pins explicit. */
function rosterMatches(actual: PlatformAgent, pins: RosterPin[]): boolean {
  const ma = actual.multiagent;
  if (!ma || ma.type !== "coordinator") return false;
  const entries = ma.agents as Array<{ type?: string; id?: string; version?: number }>;
  if (entries.length !== pins.length + 1) return false;
  const [self, ...rest] = entries;
  if (self?.id !== actual.id) return false;
  return pins.every((p, i) => rest[i]?.id === p.id && rest[i]?.version === p.version);
}

async function ensureAgent(
  client: DeployClient,
  params: Record<string, unknown>,
  pins: RosterPin[] | null,
  instance: string,
  report: AgentReport,
): Promise<PlatformAgent> {
  const name = params.name as string;
  const matches = (a: PlatformAgent) =>
    a.name === name && !a.archived_at && a.metadata.autopm_instance === instance;

  let existing = (await client.listAgents()).find(matches);
  if (!existing) {
    try {
      const created = await client.createAgent(params);
      report.created.push(`agent ${name} v${created.version}`);
      return created;
    } catch (err) {
      if (!isConflict(err)) throw err;
      existing = (await client.listAgents()).find(matches);
      if (!existing) throw new Error(`agent ${name}: 409 on create but not found on re-list`);
    }
  }
  // The roster is compared against its materialized echo, everything else as
  // a plain subset of what we declared.
  const { multiagent: _ma, ...content } = params;
  const clean = isSubset(content, existing) && (pins === null || rosterMatches(existing, pins));
  if (clean) {
    report.unchanged.push(`agent ${name} v${existing.version}`);
    return existing;
  }
  const updated = await client.updateAgent(existing.id, { version: existing.version, ...params });
  report.updated.push(`agent ${name} v${existing.version} → v${updated.version}`);
  return updated;
}

export async function ensureAgents(
  client: DeployClient,
  manifest: Manifest,
  renderedDir: string,
  state: DeployedState,
  report: AgentReport,
): Promise<void> {
  const specs = new Map<string, CreateAgent>();
  for (const entry of manifest.agents) {
    const raw = await readFile(join(renderedDir, entry.file), "utf8");
    specs.set(entry.role, CreateAgentSchema.parse(parseYaml(raw)));
  }

  const specialists = manifest.agents.filter((a) => a.role !== "orchestrator");
  const orchestrator = manifest.agents.find((a) => a.role === "orchestrator");

  for (const entry of specialists) {
    const agent = await ensureAgent(client, desiredParams(specs.get(entry.role)!, null), null, state.instance, report);
    state.agents[entry.role] = { id: agent.id, version: agent.version, name: agent.name };
  }

  if (orchestrator) {
    const pins: RosterPin[] = specialists.map((entry) => ({
      id: state.agents[entry.role]!.id,
      version: state.agents[entry.role]!.version,
    }));
    const agent = await ensureAgent(
      client, desiredParams(specs.get("orchestrator")!, pins), pins, state.instance, report,
    );
    state.agents.orchestrator = { id: agent.id, version: agent.version, name: agent.name };
  }
}
