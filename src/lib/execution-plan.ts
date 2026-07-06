// The execution plan is the Orchestrator's handoff artifact: a schema'd
// contract, not prose. Downstream consumers depend on these exact fields —
// the Playbook gate reads the deployed-vs-fallback flags, Linear ticket
// creation upserts on `plan_id` + step `id`, the routing table and weekly
// planning audit from the same records. Any prose summary renders *from*
// this artifact, never the other way round.

import { z } from "zod";
import { ROLE_NAMES } from "../render/schema.ts";

const RoleEnum = z.enum(ROLE_NAMES);

export const ExecutionStepSchema = z.object({
  /** Stable within the plan; `plan_id` + `id` is the ticket-upsert key. */
  id: z.string().min(1),
  role: RoleEnum,
  /**
   * Deployability, stated honestly: `convene` only for a deployed agent;
   * a chartered-but-undeployed role is `manual_fallback` — a plan that
   * implies automation that does not exist is invalid by charter.
   */
  execution: z.enum(["convene", "manual_fallback"]),
  /** Step ids that must complete first — the plan's ordering, made explicit. */
  depends_on: z.array(z.string()).default([]),
  brief: z.object({
    inputs: z.array(z.string().min(1)).min(1),
    expected_outputs: z.array(z.string().min(1)).min(1),
    /** Rubric file reference for graded work; null = ungated, needs a stated reason. */
    rubric_file: z.string().min(1).nullable(),
  }).strict(),
  projected_spend_usd: z.number().nonnegative(),
  blockers: z.array(z.string().min(1)).default([]),
  /** Filled in once ticket creation runs; null until then. */
  linear_issue_id: z.string().min(1).nullable().default(null),
}).strict();
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const ExecutionPlanSchema = z.object({
  plan_id: z.string().min(1),
  /** Decisions-log entry / session or deployment-run ID the plan answers. */
  source_recommendation: z.string().min(1),
  steps: z.array(ExecutionStepSchema).min(1),
  /** Plan total — must equal the sum of the step projections. */
  projected_spend_usd: z.number().nonnegative(),
  budget_cap_usd: z.number().positive(),
  notes: z.string().optional(),
}).strict().superRefine((plan, ctx) => {
  const ids = new Set<string>();
  for (const [i, s] of plan.steps.entries()) {
    if (ids.has(s.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps", i, "id"],
        message: `duplicate step id '${s.id}' — plan_id + step id is the ticket-upsert key and must be unique`,
      });
    }
    ids.add(s.id);
  }

  for (const [i, s] of plan.steps.entries()) {
    for (const dep of s.depends_on) {
      if (dep === s.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", i, "depends_on"],
          message: `step '${s.id}' depends on itself`,
        });
      } else if (!ids.has(dep)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", i, "depends_on"],
          message: `step '${s.id}' depends on unknown step '${dep}'`,
        });
      }
    }
  }

  // Dependency cycles make "ordered" a lie; reject them outright.
  const deps = new Map(plan.steps.map((s) => [s.id, s.depends_on]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): boolean => {
    if (state.get(id) === "done") return false;
    if (state.get(id) === "visiting") return true;
    state.set(id, "visiting");
    for (const dep of deps.get(id) ?? []) {
      if (deps.has(dep) && visit(dep)) return true;
    }
    state.set(id, "done");
    return false;
  };
  for (const s of plan.steps) {
    if (visit(s.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: `dependency cycle involving step '${s.id}'`,
      });
      break;
    }
  }

  const sum = plan.steps.reduce((acc, s) => acc + s.projected_spend_usd, 0);
  if (Math.abs(sum - plan.projected_spend_usd) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["projected_spend_usd"],
      message: `plan total ${plan.projected_spend_usd} does not equal the sum of step projections (${sum}) — budget honesty is part of the contract`,
    });
  }
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
