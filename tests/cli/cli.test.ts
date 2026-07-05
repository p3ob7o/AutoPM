import { test, expect, describe } from "bun:test";

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", "src/cli/autopm.ts", ...args], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { code, stdout, stderr };
}

describe("cli", () => {
  test("no args prints usage and exits non-zero", async () => {
    const r = await runCli([]);
    expect(r.code).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("Usage: autopm");
  });

  test("deploy is a stub that says so", async () => {
    const r = await runCli(["deploy", "leandomainsearch", "--dry-run"]);
    expect(r.stdout + r.stderr).toContain("not implemented");
  });

  test("run is a stub that says so", async () => {
    const r = await runCli(["run", "leandomainsearch"]);
    expect(r.stdout + r.stderr).toContain("not implemented");
  });
});
