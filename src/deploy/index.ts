import { logger } from "../lib/logger.ts";

export interface DeployOptions { repoRoot: string; instance: string; dryRun: boolean; }

export async function deploy(opts: DeployOptions): Promise<never> {
  logger.warn("deploy not implemented", { instance: opts.instance, dryRun: opts.dryRun });
  throw new Error("deploy not implemented — see the deploy plan (Phase 1: ship Quality)");
}
