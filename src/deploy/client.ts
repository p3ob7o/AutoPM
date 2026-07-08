import Anthropic from "@anthropic-ai/sdk";

// The narrow platform surface deploy consumes. One seam: tests inject an
// in-memory fake; production wraps the SDK. List methods return plain arrays
// (the adapter drains pagination) so fakes stay trivial.

export interface PlatformEnvironment {
  id: string;
  name: string;
  archived_at: string | null;
  config: Record<string, unknown>;
}

export interface PlatformVault {
  id: string;
  display_name: string;
  archived_at: string | null;
  metadata: Record<string, string>;
}

export interface PlatformCredential {
  id: string;
  display_name: string | null;
  archived_at: string | null;
  auth: { type: string };
}

export interface PlatformMemoryStore {
  id: string;
  name: string;
  archived_at: string | null;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PlatformAgent {
  id: string;
  name: string;
  version: number;
  archived_at: string | null;
  model: { id: string; speed?: string };
  system: string;
  tools: unknown[];
  mcp_servers: unknown[];
  skills: unknown[];
  multiagent: { type: string; agents: unknown[] } | null;
  metadata: Record<string, string>;
}

export interface PlatformDeployment {
  id: string;
  name: string;
  status: string;
  archived_at: string | null;
  metadata: Record<string, string>;
  agent: { id: string; version?: number };
  environment_id: string;
  schedule: Record<string, unknown> | null;
  initial_events: unknown[];
  vault_ids: string[];
}

export interface DeployClient {
  listEnvironments(): Promise<PlatformEnvironment[]>;
  createEnvironment(params: {
    name: string;
    config: Record<string, unknown>;
    metadata?: Record<string, string>;
  }): Promise<PlatformEnvironment>;
  updateEnvironment(id: string, params: { config: Record<string, unknown> }): Promise<PlatformEnvironment>;

  listVaults(): Promise<PlatformVault[]>;
  createVault(params: { display_name: string; metadata?: Record<string, string> }): Promise<PlatformVault>;
  listCredentials(vaultId: string): Promise<PlatformCredential[]>;
  createCredential(vaultId: string, params: {
    display_name: string;
    auth: Record<string, unknown>;
    metadata?: Record<string, string>;
  }): Promise<PlatformCredential>;

  listMemoryStores(): Promise<PlatformMemoryStore[]>;
  createMemoryStore(params: {
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<PlatformMemoryStore>;
  createMemory(storeId: string, params: { path: string; content: string }): Promise<void>;

  listAgents(): Promise<PlatformAgent[]>;
  createAgent(params: Record<string, unknown>): Promise<PlatformAgent>;
  updateAgent(id: string, params: Record<string, unknown>): Promise<PlatformAgent>;

  listDeployments(): Promise<PlatformDeployment[]>;
  createDeployment(params: Record<string, unknown>): Promise<PlatformDeployment>;
  updateDeployment(id: string, params: Record<string, unknown>): Promise<PlatformDeployment>;
  pauseDeployment(id: string): Promise<PlatformDeployment>;
}

/** HTTP 409 from a create = the resource already exists; callers re-list and reuse (§13). */
export function isConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { status?: number }).status === 409;
}

async function drain<T>(page: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of page) out.push(item);
  return out;
}

export function sdkDeployClient(apiKey: string): DeployClient {
  const client = new Anthropic({ apiKey });
  const b = client.beta;
  // The SDK's response types carry union configs and branded promises; the
  // narrow Platform* shapes are structural subsets, so casts go through
  // `unknown` at this one seam.
  return {
    listEnvironments: () => drain(b.environments.list()) as unknown as Promise<PlatformEnvironment[]>,
    createEnvironment: (p) => b.environments.create(p as never) as unknown as Promise<PlatformEnvironment>,
    updateEnvironment: (id, p) => b.environments.update(id, p as never) as unknown as Promise<PlatformEnvironment>,
    listVaults: () => drain(b.vaults.list()) as unknown as Promise<PlatformVault[]>,
    createVault: (p) => b.vaults.create(p) as unknown as Promise<PlatformVault>,
    listCredentials: (vaultId) => drain(b.vaults.credentials.list(vaultId)) as unknown as Promise<PlatformCredential[]>,
    createCredential: (vaultId, p) => b.vaults.credentials.create(vaultId, p as never) as unknown as Promise<PlatformCredential>,
    listMemoryStores: () => drain(b.memoryStores.list()) as unknown as Promise<PlatformMemoryStore[]>,
    createMemoryStore: (p) => b.memoryStores.create(p) as unknown as Promise<PlatformMemoryStore>,
    createMemory: async (storeId, p) => { await b.memoryStores.memories.create(storeId, p); },
    listAgents: () => drain(b.agents.list()) as unknown as Promise<PlatformAgent[]>,
    createAgent: (p) => b.agents.create(p as never) as unknown as Promise<PlatformAgent>,
    updateAgent: (id, p) => b.agents.update(id, p as never) as unknown as Promise<PlatformAgent>,
    listDeployments: () => drain(b.deployments.list()) as unknown as Promise<PlatformDeployment[]>,
    createDeployment: (p) => b.deployments.create(p as never) as unknown as Promise<PlatformDeployment>,
    updateDeployment: (id, p) => b.deployments.update(id, p as never) as unknown as Promise<PlatformDeployment>,
    pauseDeployment: (id) => b.deployments.pause(id) as unknown as Promise<PlatformDeployment>,
  };
}
