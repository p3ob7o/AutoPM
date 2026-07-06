import { test, expect, describe } from "bun:test";
import { ExecutionPlanSchema } from "../../src/lib/execution-plan.ts";

const step = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  role: "design",
  execution: "convene",
  depends_on: [],
  brief: {
    inputs: ["the brief"],
    expected_outputs: ["the deliverable"],
    rubric_file: "rubrics/design.md",
  },
  projected_spend_usd: 5,
  blockers: [],
  linear_issue_id: null,
  ...over,
});

const plan = (over: Record<string, unknown> = {}) => ({
  plan_id: "p1",
  source_recommendation: "decisions-log/2026-07-06-weekly",
  steps: [step()],
  projected_spend_usd: 5,
  budget_cap_usd: 800,
  ...over,
});

describe("ExecutionPlanSchema", () => {
  test("accepts a valid single-step plan", () => {
    expect(ExecutionPlanSchema.parse(plan()).steps).toHaveLength(1);
  });

  test("accepts a manual_fallback step with a named blocker and a reasoned null rubric", () => {
    const p = plan({
      steps: [step({
        execution: "manual_fallback",
        blockers: ["Code agent not deployed until First build"],
        brief: {
          inputs: ["spec"],
          expected_outputs: ["PR"],
          rubric_file: null,
          rubric_absence_reason: "rubric authored at kickoff, not planning time",
        },
      })],
    });
    expect(ExecutionPlanSchema.parse(p).steps[0].execution).toBe("manual_fallback");
  });

  test("rejects a manual_fallback step with no named blocker", () => {
    const p = plan({
      steps: [step({ execution: "manual_fallback", blockers: [] })],
    });
    expect(() => ExecutionPlanSchema.parse(p)).toThrow(
      /manual_fallback requires at least one named blocker/,
    );
  });

  test("rejects an ungated step with no rubric_absence_reason", () => {
    const p = plan({
      steps: [step({
        brief: { inputs: ["x"], expected_outputs: ["y"], rubric_file: null },
      })],
    });
    expect(() => ExecutionPlanSchema.parse(p)).toThrow(
      /ungated work needs a stated reason/,
    );
  });

  test("rejects a graded step that also carries rubric_absence_reason", () => {
    const p = plan({
      steps: [step({
        brief: {
          inputs: ["x"],
          expected_outputs: ["y"],
          rubric_file: "rubrics/x.md",
          rubric_absence_reason: "should not be here",
        },
      })],
    });
    expect(() => ExecutionPlanSchema.parse(p)).toThrow(/mutually exclusive/);
  });

  test("rejects an invented role", () => {
    expect(() => ExecutionPlanSchema.parse(plan({ steps: [step({ role: "wizard" })] }))).toThrow();
  });

  test("rejects duplicate step ids (the ticket-upsert key)", () => {
    const p = plan({ steps: [step(), step()], projected_spend_usd: 10 });
    expect(() => ExecutionPlanSchema.parse(p)).toThrow(/duplicate step id 's1'/);
  });

  test("rejects a dependency on an unknown step", () => {
    const p = plan({ steps: [step({ depends_on: ["ghost"] })] });
    expect(() => ExecutionPlanSchema.parse(p)).toThrow(/depends on unknown step 'ghost'/);
  });

  test("rejects a self-dependency", () => {
    const p = plan({ steps: [step({ depends_on: ["s1"] })] });
    expect(() => ExecutionPlanSchema.parse(p)).toThrow(/depends on itself/);
  });

  test("rejects a dependency cycle", () => {
    const p = plan({
      steps: [
        step({ id: "a", depends_on: ["b"] }),
        step({ id: "b", depends_on: ["a"] }),
      ],
      projected_spend_usd: 10,
    });
    expect(() => ExecutionPlanSchema.parse(p)).toThrow(/dependency cycle/);
  });

  test("rejects a plan total that does not equal the sum of step projections", () => {
    const p = plan({ projected_spend_usd: 99 });
    expect(() => ExecutionPlanSchema.parse(p)).toThrow(/does not equal the sum of step projections/);
  });

  test("rejects unknown fields (strict contract)", () => {
    expect(() => ExecutionPlanSchema.parse(plan({ vibe: "good" }))).toThrow();
  });

  test("linear_issue_id defaults to null until ticket creation fills it", () => {
    const raw = plan();
    delete (raw.steps[0] as Record<string, unknown>).linear_issue_id;
    expect(ExecutionPlanSchema.parse(raw).steps[0].linear_issue_id).toBeNull();
  });
});
