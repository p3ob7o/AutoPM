// §11 class-1 triggers: every `cron.*` event in an agent's `## Triggers`
// section becomes a scheduled-deployment spec in the manifest. The event name
// encodes the schedule — `cron.daily.HHMM` or `cron.weekly.<weekday>.HHMM`
// (24h, in `scheduler.timezone`).

const WEEKDAY: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const TIME_RE = /^([01]\d|2[0-3])([0-5]\d)$/;

export function cronExpressionFor(event: string): string {
  const parts = event.split(".");
  if (parts[0] === "cron" && parts[1] === "daily" && parts.length === 3) {
    const t = parts[2].match(TIME_RE);
    if (t) return `${Number(t[2])} ${Number(t[1])} * * *`;
  }
  if (parts[0] === "cron" && parts[1] === "weekly" && parts.length === 4) {
    const dow = WEEKDAY[parts[2]];
    const t = parts[3].match(TIME_RE);
    if (dow !== undefined && t) return `${Number(t[2])} ${Number(t[1])} * * ${dow}`;
  }
  throw new Error(
    `unrecognized cron trigger '${event}' — expected cron.daily.HHMM or cron.weekly.<weekday>.HHMM (24h)`,
  );
}

/** The `## Triggers` section body (up to the next H2), or null when absent. */
function triggersSection(body: string): string | null {
  const m = body.match(/^## Triggers\s*$/m);
  if (!m || m.index === undefined) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

const CRON_TOKEN_RE = /`(cron\.[a-z0-9.]+)`/g;

/** Distinct `cron.*` events declared in an agent's `## Triggers` section. */
export function collectCronTriggers(body: string): string[] {
  const section = triggersSection(body);
  if (!section) return [];
  const out = new Set<string>();
  for (const m of section.matchAll(CRON_TOKEN_RE)) out.add(m[1]);
  return [...out];
}
