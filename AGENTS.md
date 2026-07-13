# Agent instructions — AutoPM

Instructions for any coding agent (or human) working in this repository.

## Where work is tracked: Linear owns the work, GitHub owns the artifacts

Work on AutoPM is tracked in a **private Linear project** (issue prefix
`DOMPROD`, project *AutoPM* — 11 named milestones, Foundation → Ledger).
GitHub carries **code, pull requests, reviews, and releases only**.

> **Note:** older `TOTORO-N` references in merged PRs, commit messages, and
> branch names are the same issues under previous identifiers — Linear
> redirects them. All new work uses `DOMPROD-N`.

| Plane | Lives in |
|---|---|
| Milestones, issues, priorities, status, blocking relations | Linear (private) |
| Code, PRs, reviews, tags/releases, CI | This repository |
| Design spec + template docs | `docs/` in this repository |
| Planning/analysis documents | The operator's notes, outside the repo |

Deliberate non-uses — do not create:

- **GitHub milestones or projects** (pure duplication of Linear).
- **GitHub issues** (off while private; if the repo is public and external
  contributors appear, GitHub issues become an intake funnel that gets
  triaged *into* Linear — never a second tracker).

## The per-issue rhythm

1. Every change starts from a Linear issue (`DOMPROD-N`).
2. Branch off `main` using Linear's generated branch name
   (`domprod-N-short-slug`). The Linear ID in the branch name is mandatory.
3. Open a PR against `main`; reference the issue ID in the PR title or
   description (e.g. `Fixes DOMPROD-2`).
4. If the Linear↔GitHub integration is not attached to this repo, paste the
   PR URL into the Linear issue as a link, and move the issue manually
   (In Progress on branch, Done on merge).
5. `main` must stay green: `bun test` and `bun run typecheck` pass before
   merge. Never push directly to `main` for issue work; direct commits are
   acceptable only for repo meta-files like this one.

## Repo ground rules

- **Toolchain:** Bun. `bun install`, `bun test`, `bun run typecheck`.
- **Branching:** `main` is the default branch; never create `master`.
- **Project independence:** `template/` must stay product-agnostic —
  placeholders (`{{project.name}}`), never a concrete product name.
  Everything product-specific belongs under `instances/<slug>/`. Anything
  product-flavored found in `template/` is a bug.
- **Public-readiness:** this repository may become publicly visible. Never
  commit secrets (no tokens, keys, or credential values — secret *references*
  like `env:VAR_NAME` are resolved at deploy time from the deploy host's
  environment, loaded from the operator's gitignored `.env`) and never
  commit personal or company-internal identifiers: private hostnames, tailnet
  names, internal git hosts, personal vault paths, or machine names.
- **Design authority:** `docs/specs/` is the system's definition. Substantive
  design changes update the spec in the same PR as the code.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
