import type {
  DeployClient, PlatformAgent, PlatformCredential, PlatformDeployment,
  PlatformEnvironment, PlatformMemoryStore, PlatformVault,
} from "../../src/deploy/client.ts";

// In-memory platform double. Counts every call so tests can assert "second
// run makes zero mutating calls". `conflictOnCreate` simulates the 409
// exists-reuse path (§13).

export class FakePlatform implements DeployClient {
  environments: PlatformEnvironment[] = [];
  vaults: PlatformVault[] = [];
  credentials = new Map<string, PlatformCredential[]>();
  stores: PlatformMemoryStore[] = [];
  memories = new Map<string, Array<{ path: string; content: string }>>();
  agents: PlatformAgent[] = [];
  deployments: PlatformDeployment[] = [];

  calls: Record<string, number> = {};
  conflictOnCreate = new Set<string>(); // resource names that 409 on create

  private seq = 0;
  private id(prefix: string): string { return `${prefix}_${String(++this.seq).padStart(4, "0")}`; }
  private count(method: string): void { this.calls[method] = (this.calls[method] ?? 0) + 1; }

  mutatingCalls(): number {
    return Object.entries(this.calls)
      .filter(([m]) => m.startsWith("create") || m.startsWith("update") || m.startsWith("pause"))
      .reduce((n, [, c]) => n + c, 0);
  }

  private conflict(name: string): Error & { status: number } {
    return Object.assign(new Error(`conflict: ${name} exists`), { status: 409 });
  }

  async listEnvironments(): Promise<PlatformEnvironment[]> {
    this.count("listEnvironments");
    return [...this.environments];
  }

  async createEnvironment(params: { name: string; config: Record<string, unknown>; metadata?: Record<string, string> }): Promise<PlatformEnvironment> {
    this.count("createEnvironment");
    if (this.conflictOnCreate.has(params.name)) throw this.conflict(params.name);
    if (this.environments.some((e) => e.name === params.name && !e.archived_at)) throw this.conflict(params.name);
    const env: PlatformEnvironment = { id: this.id("env"), name: params.name, archived_at: null, config: params.config };
    this.environments.push(env);
    return env;
  }

  async updateEnvironment(id: string, params: { config: Record<string, unknown> }): Promise<PlatformEnvironment> {
    this.count("updateEnvironment");
    const env = this.environments.find((e) => e.id === id);
    if (!env) throw new Error(`no environment ${id}`);
    env.config = params.config;
    return env;
  }

  async listVaults(): Promise<PlatformVault[]> {
    this.count("listVaults");
    return [...this.vaults];
  }

  async createVault(params: { display_name: string; metadata?: Record<string, string> }): Promise<PlatformVault> {
    this.count("createVault");
    if (this.conflictOnCreate.has(params.display_name)) throw this.conflict(params.display_name);
    const vault: PlatformVault = { id: this.id("vlt"), display_name: params.display_name, archived_at: null, metadata: params.metadata ?? {} };
    this.vaults.push(vault);
    this.credentials.set(vault.id, []);
    return vault;
  }

  async listCredentials(vaultId: string): Promise<PlatformCredential[]> {
    this.count("listCredentials");
    return [...(this.credentials.get(vaultId) ?? [])];
  }

  async createCredential(vaultId: string, params: { display_name: string; auth: Record<string, unknown>; metadata?: Record<string, string> }): Promise<PlatformCredential> {
    this.count("createCredential");
    const cred: PlatformCredential = {
      id: this.id("crd"),
      display_name: params.display_name,
      archived_at: null,
      auth: { type: params.auth.type as string },
    };
    this.credentials.get(vaultId)?.push(cred);
    // Record what auth payload arrived so hygiene tests can inspect it.
    this.credentialPayloads.push(params.auth);
    return cred;
  }
  credentialPayloads: Array<Record<string, unknown>> = [];

  async listMemoryStores(): Promise<PlatformMemoryStore[]> {
    this.count("listMemoryStores");
    return [...this.stores];
  }

  async createMemoryStore(params: { name: string; description?: string; metadata?: Record<string, string> }): Promise<PlatformMemoryStore> {
    this.count("createMemoryStore");
    const store: PlatformMemoryStore = {
      id: this.id("mst"), name: params.name, archived_at: null,
      description: params.description, metadata: params.metadata,
    };
    this.stores.push(store);
    this.memories.set(store.id, []);
    return store;
  }

  async createMemory(storeId: string, params: { path: string; content: string }): Promise<void> {
    this.count("createMemory");
    this.memories.get(storeId)?.push(params);
  }

  async listAgents(): Promise<PlatformAgent[]> {
    this.count("listAgents");
    return [...this.agents];
  }

  // The real platform MATERIALIZES coordinator rosters on write (verified in
  // the DOMPROD-10 smoke): {type:"self"} → {type:"agent", id: <own>, version}
  // and unversioned refs get pinned to the referenced agent's version.
  private materializeRoster(
    multiagent: unknown,
    ownId: string,
    ownVersion: number,
  ): PlatformAgent["multiagent"] {
    if (!multiagent) return null;
    const ma = structuredClone(multiagent) as { type: string; agents: Array<Record<string, unknown>> };
    ma.agents = ma.agents.map((entry) => {
      if (entry.type === "self") return { type: "agent", id: ownId, version: ownVersion };
      const refId = entry.id as string;
      const ref = this.agents.find((a) => a.id === refId);
      return { type: "agent", id: refId, version: (entry.version as number) ?? ref?.version ?? 1 };
    });
    return ma as PlatformAgent["multiagent"];
  }

  async createAgent(params: Record<string, unknown>): Promise<PlatformAgent> {
    this.count("createAgent");
    const name = params.name as string;
    if (this.conflictOnCreate.has(name)) throw this.conflict(name);
    const id = this.id("agt");
    const agent = {
      id,
      version: 1,
      archived_at: null,
      ...structuredClone(params),
      // Server-added defaults the real platform echoes back (preflight-verified).
      tools: (structuredClone(params.tools) as unknown[] ?? []).map((t) => ({ configs: [], ...(t as object) })),
      multiagent: this.materializeRoster(params.multiagent, id, 1),
    } as unknown as PlatformAgent;
    this.agents.push(agent);
    return agent;
  }

  async updateAgent(id: string, params: Record<string, unknown>): Promise<PlatformAgent> {
    this.count("updateAgent");
    const idx = this.agents.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`no agent ${id}`);
    const prev = this.agents[idx]!;
    if (params.version !== prev.version) throw Object.assign(new Error("version mismatch"), { status: 409 });
    const { version: _v, ...rest } = params;
    const nextVersion = prev.version + 1;
    const next = {
      ...structuredClone(prev),
      ...structuredClone(rest),
      id: prev.id,
      version: nextVersion,
      multiagent: rest.multiagent !== undefined
        ? this.materializeRoster(rest.multiagent, prev.id, nextVersion)
        : prev.multiagent,
    } as unknown as PlatformAgent;
    this.agents[idx] = next;
    return next;
  }

  async listDeployments(): Promise<PlatformDeployment[]> {
    this.count("listDeployments");
    return [...this.deployments];
  }

  async createDeployment(params: Record<string, unknown>): Promise<PlatformDeployment> {
    this.count("createDeployment");
    const dep: PlatformDeployment = {
      id: this.id("dpl"),
      name: params.name as string,
      status: "active",
      archived_at: null,
      metadata: (params.metadata ?? {}) as Record<string, string>,
    };
    this.deployments.push(dep);
    this.deploymentPayloads.push(params);
    return dep;
  }
  deploymentPayloads: Array<Record<string, unknown>> = [];

  async pauseDeployment(id: string): Promise<PlatformDeployment> {
    this.count("pauseDeployment");
    const dep = this.deployments.find((d) => d.id === id);
    if (!dep) throw new Error(`no deployment ${id}`);
    dep.status = "paused";
    return dep;
  }
}
