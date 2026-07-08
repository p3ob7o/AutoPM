import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Manifest } from "../render/schema.ts";
import type { DeployClient } from "./client.ts";
import type { DeployedState } from "./state.ts";
import { logger } from "../lib/logger.ts";

// Memory stores: names are NOT unique platform-wide, so lookups match
// name + autopm_instance metadata. Seeding happens exactly once, on create —
// re-runs never overwrite grown memory (`autopm seed-memory --force` is the
// deliberate path for that, §13). The description is written for the model:
// the platform injects it into attached agents' system prompts.

export async function ensureMemoryStores(
  client: DeployClient,
  manifest: Manifest,
  renderedDir: string,
  state: DeployedState,
  report: { created: string[]; unchanged: string[] },
): Promise<void> {
  const existing = await client.listMemoryStores();

  for (const store of manifest.memory_stores) {
    const found = existing.find(
      (s) => s.name === store.name && !s.archived_at && s.metadata?.autopm_instance === state.instance,
    );
    if (found) {
      state.memory_stores[store.name] = {
        id: found.id,
        seeded: state.memory_stores[store.name]?.seeded ?? false,
      };
      if (store.description && found.description !== store.description) {
        // Renaming/re-describing live stores has platform-side effects; v1
        // surfaces drift instead of mutating.
        logger.warn("memory store description drift (not updated by v1)", {
          store: store.name,
          manifest: store.description,
          platform: found.description ?? "",
        });
      }
      report.unchanged.push(`memory store ${store.name}`);
      continue;
    }

    const created = await client.createMemoryStore({
      name: store.name,
      description: store.description || undefined,
      metadata: { autopm_instance: state.instance },
    });
    let seeded = false;
    if (store.seed) {
      const content = await readFile(join(renderedDir, store.seed), "utf8");
      await client.createMemory(created.id, { path: "/seed.md", content });
      seeded = true;
    }
    state.memory_stores[store.name] = { id: created.id, seeded };
    report.created.push(`memory store ${store.name}${seeded ? " (seeded)" : ""}`);
  }
}
