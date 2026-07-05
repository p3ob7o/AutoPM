#!/usr/bin/env bun
import { join } from "node:path";
import { render } from "../render/index.ts";
import { deploy } from "../deploy/index.ts";
import { run } from "../runtime/server.ts";
import { logger } from "../lib/logger.ts";

const USAGE = `Usage: autopm <command> <instance> [options]

Commands:
  render <instance>            Validate template+instance and emit .rendered/
  deploy <instance> [--dry-run]  Provision agents/memory/skills (not implemented)
  run    <instance>            Start the live dispatcher (not implemented)
`;

function fail(msg: string): never {
  console.error(msg);
  console.error(USAGE);
  process.exit(1);
}

const [cmd, instance, ...rest] = process.argv.slice(2);
const repoRoot = process.cwd();

if (!cmd) fail("Usage: autopm — no command given");

try {
  switch (cmd) {
    case "render": {
      if (!instance) fail("render requires an <instance>");
      const result = await render({ repoRoot, instance });
      logger.info("rendered", { instance, agents: result.agents.length, out: join("instances", instance, ".rendered") });
      break;
    }
    case "deploy": {
      if (!instance) fail("deploy requires an <instance>");
      await deploy({ repoRoot, instance, dryRun: rest.includes("--dry-run") });
      break;
    }
    case "run": {
      if (!instance) fail("run requires an <instance>");
      await run({ repoRoot, instance });
      break;
    }
    default:
      fail(`unknown command: ${cmd}`);
  }
} catch (err) {
  logger.error("command failed", { cmd, error: (err as Error).message });
  process.exit(1);
}
