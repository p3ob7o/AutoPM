import { test, expect, describe } from "bun:test";
import { collectMemoryStores, extractSection } from "../../src/render/sections.ts";

describe("extractSection", () => {
  const body = "## Role\nintro\n\n## Memory Stores\ntable here\n\n## Notes\ntail";

  test("returns the section body up to the next H2", () => {
    expect(extractSection(body, "Memory Stores")?.trim()).toBe("table here");
  });

  test("returns null when the section is absent", () => {
    expect(extractSection(body, "Triggers")).toBeNull();
  });
});

describe("collectMemoryStores", () => {
  test("collects deduped store names, ignoring header/separator/none rows and other sections", () => {
    const body = `
## Memory Stores
| Store | Access | Why |
|---|---|---|
| product-canon | read-only | canon |
| \`decisions-log\` | read-write | decisions |
| (none required) | — | — |
| product-canon | read-only | duplicate row, deduped |

## Notes
| finance-actuals | read-only | a table row outside the Memory Stores section |
`;
    expect(collectMemoryStores(body).sort()).toEqual(["decisions-log", "product-canon"]);
  });

  test("returns [] when there is no Memory Stores section", () => {
    expect(collectMemoryStores("## Role\nNothing.")).toEqual([]);
  });

  test("throws on a store name that cannot be a mount directory (§9)", () => {
    const body = "## Memory Stores\n| Store | Access | Why |\n|---|---|---|\n| Bad Store | r/o | nope |\n";
    expect(() => collectMemoryStores(body)).toThrow(/invalid memory store name/);
  });
});
