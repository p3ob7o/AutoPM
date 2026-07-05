import { test, expect, describe } from "bun:test";
import { collectCronTriggers, cronExpressionFor } from "../../src/render/triggers.ts";

describe("cronExpressionFor", () => {
  test("cron.daily.HHMM", () => {
    expect(cronExpressionFor("cron.daily.0900")).toBe("0 9 * * *");
    expect(cronExpressionFor("cron.daily.0300")).toBe("0 3 * * *");
    expect(cronExpressionFor("cron.daily.2330")).toBe("30 23 * * *");
  });

  test("cron.weekly.<weekday>.HHMM", () => {
    expect(cronExpressionFor("cron.weekly.monday.1000")).toBe("0 10 * * 1");
    expect(cronExpressionFor("cron.weekly.sunday.0500")).toBe("0 5 * * 0");
    expect(cronExpressionFor("cron.weekly.saturday.1815")).toBe("15 18 * * 6");
  });

  test("rejects unrecognized shapes loudly", () => {
    for (const bad of [
      "cron.hourly.15", "cron.daily.2500", "cron.daily.09000",
      "cron.weekly.funday.1000", "cron.daily", "cron.weekly.monday",
    ]) {
      expect(() => cronExpressionFor(bad)).toThrow(/unrecognized cron trigger/);
    }
  });
});

describe("collectCronTriggers", () => {
  const body = `
## Role
Ignores \`cron.daily.0800\` mentioned outside the Triggers section.

## Triggers
- \`cron.daily.0900\` → status digest.
- \`cron.weekly.monday.1000\` → weekly planning.
- \`cron.daily.0900\` → duplicate, deduped.
- \`budget.alarm\` → not a cron trigger.
- \`manual.orchestrator\` → not a cron trigger.

## Notes
Also ignores \`cron.daily.0700\` here.
`;

  test("collects distinct cron.* events from the Triggers section only", () => {
    expect(collectCronTriggers(body).sort()).toEqual(["cron.daily.0900", "cron.weekly.monday.1000"]);
  });

  test("returns [] when there is no Triggers section", () => {
    expect(collectCronTriggers("## Role\nNothing here.")).toEqual([]);
  });
});
