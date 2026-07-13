import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { rm, mkdtemp, cp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deploy } from "../../src/deploy/index.ts";
import { FakePlatform } from "./fake-client.ts";

// Secrets used by the mini fixture's vault refs. Values are deliberately
// distinctive so hygiene tests can grep for leaks.
const ENV = {
  GITHUB_TOKEN: "ghp_TESTSECRET_github",
  LINEAR_API_KEY: "lin_TESTSECRET_linear",
  ANTHROPIC_API_KEY: "TESTSECRET-anthropic-key",
};

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "autopm-deploy-"));
  await cp("tests/fixtures/mini", work, { recursive: true });
});
afterEach(async () => { await rm(work, { recursive: true, force: true }); });

const run = (client: FakePlatform, extra: Partial<Parameters<typeof deploy>[0]> = {}) =>
  deploy({ repoRoot: work, instance: "demo", dryRun: false, client, env: ENV, ...extra });

describe("deploy", () => {
  test("first run creates everything in dependency order; .deployed.json records ids", async () => {
    const fake = new FakePlatform();
    const report = await run(fake);

    expect(fake.environments.map((e) => e.name)).toEqual(["demoproduct-default"]);
    expect(fake.vaults.map((v) => v.display_name)).toEqual(["autopm-demoproduct"]);
    // github pairs with the github MCP server → static_bearer; linear and
    // anthropic have no MCP pairing → local, no platform credential.
    const creds = fake.credentials.get(fake.vaults[0]!.id)!;
    expect(creds.map((c) => c.display_name)).toEqual(["github"]);
    expect(fake.stores.map((s) => s.name).sort()).toEqual(["decisions-log", "product-canon", "team-roster"]);
    expect(fake.agents.map((a) => a.name).sort()).toEqual(["demoproduct-orchestrator", "demoproduct-product"]);
    expect(fake.deployments.map((d) => d.name).sort()).toEqual([
      "demoproduct-cron.daily.0900", "demoproduct-cron.weekly.monday.1000",
    ]);
    expect(report.created.length).toBeGreaterThanOrEqual(8);
    expect(report.updated).toEqual([]);

    const statePath = join(work, "instances/demo/.deployed.json");
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.environments.default.id).toBe(fake.environments[0]!.id);
    expect(state.agents.product.version).toBe(1);
    expect(state.agents.orchestrator.version).toBe(1);
    expect(state.vault.credentials.anthropic).toEqual({ id: null, type: "local" });
    expect(state.memory_stores["product-canon"].seeded).toBe(true);
  });

  test("second run makes zero mutating calls (idempotent no-op)", async () => {
    const fake = new FakePlatform();
    await run(fake);
    const before = fake.mutatingCalls();

    const report = await run(fake);
    expect(fake.mutatingCalls()).toBe(before);
    expect(report.created).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.unchanged.length).toBeGreaterThanOrEqual(9);
  });

  test("environments always get explicit networking — never the platform default", async () => {
    const fake = new FakePlatform();
    await run(fake);
    expect(fake.environments[0]!.config).toEqual({
      type: "cloud",
      networking: { type: "limited", allow_mcp_servers: true, allowed_hosts: [] },
    });
  });

  test("409 on create is treated as exists-reuse", async () => {
    const fake = new FakePlatform();
    // Pre-existing environment under the platform name, unknown to state.
    await fake.createEnvironment({
      name: "demoproduct-default",
      config: { type: "cloud", networking: { type: "limited", allow_mcp_servers: true, allowed_hosts: [] } },
    });
    fake.conflictOnCreate.add("demoproduct-default");

    const report = await run(fake);
    expect(fake.environments).toHaveLength(1);
    expect(report.unchanged).toContain("environment demoproduct-default");
  });

  test("a missing env var stops the deploy before any platform call", async () => {
    const fake = new FakePlatform();
    const { LINEAR_API_KEY: _omit, ...partial } = ENV;
    expect(run(fake, { env: partial })).rejects.toThrow(/LINEAR_API_KEY/);
    expect(fake.mutatingCalls()).toBe(0);
    expect(existsSync(join(work, "instances/demo/.deployed.json"))).toBe(false);
  });

  test("dry-run prints the plan and makes zero platform calls", async () => {
    const fake = new FakePlatform();
    const lines: string[] = [];
    const orig = console.log;
    console.log = (s: unknown) => { lines.push(String(s)); };
    try {
      await run(fake, { dryRun: true, env: { ...ENV, GITHUB_TOKEN: undefined } });
    } finally {
      console.log = orig;
    }
    expect(Object.keys(fake.calls)).toEqual([]);
    const plan = lines.join("\n");
    expect(plan).toContain("dry-run — no API calls");
    expect(plan).toContain("credential github: env:GITHUB_TOKEN (MISSING) → static_bearer");
    expect(plan).toContain("credential anthropic: env:ANTHROPIC_API_KEY (set) → local");
    expect(plan).toContain("deployment demoproduct-cron.daily.0900: 0 9 * * * Europe/Lisbon (created paused)");
    // Dry-run never prints secret values.
    for (const v of Object.values(ENV)) expect(plan).not.toContain(v);
  });

  test("secret values reach the platform call and nothing else — not state, not logs", async () => {
    const fake = new FakePlatform();
    const logged: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (s: unknown) => { logged.push(String(s)); };
    console.error = (s: unknown) => { logged.push(String(s)); };
    try {
      await run(fake);
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    expect(fake.credentialPayloads[0]).toEqual({
      type: "static_bearer",
      token: ENV.GITHUB_TOKEN,
      mcp_server_url: "https://api.githubcopilot.com/mcp/",
    });
    const state = await readFile(join(work, "instances/demo/.deployed.json"), "utf8");
    const allOutput = logged.join("\n");
    for (const v of Object.values(ENV)) {
      expect(state).not.toContain(v);
      expect(allOutput).not.toContain(v);
    }
  });

  test("orchestrator roster materializes to self + live specialist pins", async () => {
    const fake = new FakePlatform();
    await run(fake);
    const orch = fake.agents.find((a) => a.name === "demoproduct-orchestrator")!;
    const product = fake.agents.find((a) => a.name === "demoproduct-product")!;
    // The platform materializes {type:"self"} into a concrete versioned ref.
    expect(orch.multiagent).toEqual({
      type: "coordinator",
      agents: [
        { type: "agent", id: orch.id, version: 1 },
        { type: "agent", id: product.id, version: 1 },
      ],
    });
  });

  test("agent drift updates in place, bumps the version, and re-pins the orchestrator roster", async () => {
    const fake = new FakePlatform();
    await run(fake);
    // Simulate platform-side drift on the product agent's system prompt.
    const product = fake.agents.find((a) => a.name === "demoproduct-product")!;
    product.system = "tampered";

    const report = await run(fake);
    // Product updates v1→v2; its roster pin in the orchestrator goes stale
    // (pinned v1), so the orchestrator re-pins in the same run — and the two
    // deployments dispatch the orchestrator, whose deployment pin is now
    // stale too, so they reconcile as well.
    expect(report.updated).toEqual([
      "agent demoproduct-product v1 → v2",
      "agent demoproduct-orchestrator v1 → v2",
      "deployment demoproduct-cron.daily.0900",
      "deployment demoproduct-cron.weekly.monday.1000",
    ]);
    expect(report.created).toEqual([]);
    const state = JSON.parse(await readFile(join(work, "instances/demo/.deployed.json"), "utf8"));
    expect(state.agents.product.version).toBe(2);
    const orch = fake.agents.find((a) => a.name === "demoproduct-orchestrator")!;
    expect((orch.multiagent!.agents[1] as { version: number }).version).toBe(2);
    expect(fake.deployments.every((d) => d.agent.version === 2)).toBe(true);
    // Reconciling a deployment never touches its pause state.
    expect(fake.deployments.every((d) => d.status === "paused")).toBe(true);

    // And the run after the re-pin is a clean no-op again.
    const third = await run(fake);
    expect(third.updated).toEqual([]);
    expect(third.created).toEqual([]);
  });

  test("memory stores seed exactly once, on create", async () => {
    const fake = new FakePlatform();
    await run(fake);
    const canon = fake.stores.find((s) => s.name === "product-canon")!;
    expect(fake.memories.get(canon.id)).toHaveLength(1);
    expect(fake.memories.get(canon.id)![0]!.path).toBe("/seed.md");
    expect(fake.memories.get(canon.id)![0]!.content).toContain("DemoProduct");
    expect(canon.description).toBe("mission, strategy, goals");

    await run(fake);
    expect(fake.memories.get(canon.id)).toHaveLength(1); // never reseeded
  });

  test("deployments are created paused with the manifest cron and a trigger message", async () => {
    const fake = new FakePlatform();
    await run(fake);
    expect(fake.deployments.every((d) => d.status === "paused")).toBe(true);
    const daily = fake.deploymentPayloads.find((p) => p.name === "demoproduct-cron.daily.0900")!;
    expect(daily.schedule).toEqual({ type: "cron", expression: "0 9 * * *", timezone: "Europe/Lisbon" });
    const events = daily.initial_events as Array<{ type: string; content: Array<{ text: string }> }>;
    expect(events[0]!.type).toBe("user.message");
    expect(events[0]!.content[0]!.text).toContain("cron.daily.0900");
    // The agent pin is explicit — typed selector with id + version — so
    // drift is detectable.
    const orch = fake.agents.find((a) => a.name === "demoproduct-orchestrator")!;
    expect(daily.agent).toEqual({ type: "agent", id: orch.id, version: 1 });
  });

  test("deployments attach the instance vault so scheduled sessions can use its credentials", async () => {
    const fake = new FakePlatform();
    await run(fake);
    const vault = fake.vaults[0]!;
    for (const payload of fake.deploymentPayloads) {
      expect(payload.vault_ids).toEqual([vault.id]);
    }
    expect(fake.deployments.every((d) => d.vault_ids.length === 1 && d.vault_ids[0] === vault.id)).toBe(true);
  });

  test("platform-side deployment drift (schedule tampered) reconciles back to the manifest", async () => {
    const fake = new FakePlatform();
    await run(fake);
    const daily = fake.deployments.find((d) => d.name === "demoproduct-cron.daily.0900")!;
    daily.schedule = { type: "cron", expression: "30 4 * * *", timezone: "UTC", last_run_at: null, upcoming_runs_at: [] };

    const report = await run(fake);
    expect(report.updated).toEqual(["deployment demoproduct-cron.daily.0900"]);
    expect(daily.schedule).toMatchObject({ type: "cron", expression: "0 9 * * *", timezone: "Europe/Lisbon" });

    const third = await run(fake);
    expect(third.updated).toEqual([]);
  });
});
