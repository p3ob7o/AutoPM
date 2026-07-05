import { Hono } from "hono";
import { logger } from "../lib/logger.ts";

export interface RunOptions { repoRoot: string; instance: string; }

/** Builds the Hono app (routes are added by the runtime plan). */
export function buildApp(): Hono {
  const app = new Hono();
  app.get("/healthz", (c) => c.json({ ok: true }));
  return app;
}

export async function run(opts: RunOptions): Promise<never> {
  logger.warn("run not implemented", { instance: opts.instance });
  throw new Error("run not implemented — see the runtime plan");
}
