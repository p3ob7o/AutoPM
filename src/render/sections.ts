// Shared agent.md section parsing: an H2 heading marks a section; the section
// body runs to the next H2 (or end of file).

export function extractSection(body: string, heading: string): string | null {
  const m = body.match(new RegExp(`^## ${heading}\\s*$`, "m"));
  if (!m || m.index === undefined) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

const STORE_NAME_RE = /^[a-z0-9-]+$/;

export interface MemoryStoreRef { name: string; why: string }

/**
 * Stores declared in an agent's `## Memory Stores` table (§7). The name is
 * the deploy contract: store name = mount directory (§9), so anything that
 * cannot be a mount directory fails loudly. The `Why` column feeds the
 * platform store `description` — the platform injects it into the system
 * prompt of any agent the store is attached to, so it is written for the
 * model (§13 Contract 2).
 */
export function collectMemoryStores(body: string): MemoryStoreRef[] {
  const section = extractSection(body, "Memory Stores");
  if (!section) return [];
  const out = new Map<string, string>();
  for (const line of section.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    // "| name | access | why |" → drop the empty edge cells around the pipes.
    const cells = t.split("|").map((c) => c.trim());
    if (cells[0] === "") cells.shift();
    if (cells[cells.length - 1] === "") cells.pop();
    const first = (cells[0] ?? "").replace(/^`|`$/g, "");
    if (!first || first === "Store" || /^[-: ]+$/.test(first) || first.startsWith("(") || first === "—") continue;
    if (!STORE_NAME_RE.test(first)) {
      throw new Error(`invalid memory store name '${first}' in ## Memory Stores — store name = mount directory (§9), expected kebab-case`);
    }
    if (!out.has(first)) out.set(first, cells[2] ?? "");
  }
  return [...out.entries()].map(([name, why]) => ({ name, why }));
}
