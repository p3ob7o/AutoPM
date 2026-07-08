// Drift detection against platform responses: the server adds fields we never
// sent (`configs: []`, `default_config.enabled`, timestamps), so equality is
// subset-shaped — everything WE declare must match; extra server fields are
// fine. Arrays compare pairwise and ordered (tool order is part of the
// contract we emit).

export function isSubset(desired: unknown, actual: unknown): boolean {
  if (desired === null || typeof desired !== "object") return desired === actual;
  if (Array.isArray(desired)) {
    if (!Array.isArray(actual) || actual.length !== desired.length) return false;
    return desired.every((d, i) => isSubset(d, actual[i]));
  }
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(desired as Record<string, unknown>).every(([k, v]) =>
    isSubset(v, (actual as Record<string, unknown>)[k]),
  );
}
