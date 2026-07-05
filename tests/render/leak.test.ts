import { test, expect } from "bun:test";
import { rm, mkdtemp, cp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "../../src/render/index.ts";

// TOTORO-253 leak gate: none of the May-era fields may ever reach rendered
// output, and no unresolved placeholder may survive render.
const BANNED = [
  "sandbox_provider",
  "sandbox_endpoint",
  "tunnel_id",
  "sandbox.roles",
  '"sandbox"',
  "sandbox:",
];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

test("rendered output carries no legacy fields and no unresolved placeholders", async () => {
  const work = await mkdtemp(join(tmpdir(), "autopm-leak-"));
  try {
    await cp("tests/fixtures/mini", work, { recursive: true });
    await render({ repoRoot: work, instance: "demo" });

    const files = await walk(join(work, "instances/demo/.rendered"));
    expect(files.length).toBeGreaterThanOrEqual(4); // 2 agent YAMLs + manifest + ≥1 memory seed

    for (const f of files) {
      const content = await readFile(f, "utf8");
      for (const needle of BANNED) {
        if (content.includes(needle)) throw new Error(`legacy field '${needle}' leaked into ${f}`);
      }
      if (content.includes("{{")) throw new Error(`unresolved placeholder in ${f}`);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
