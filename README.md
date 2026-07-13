---
title: AutoPM — an autonomous product team, rendered and deployed
type: doc
created: 2026-05-13
updated: 2026-07-13
tags: [autopm, managed-agents, autonomous-product]
---

# AutoPM

AutoPM turns a product-agnostic team template into a running, autonomous
product team of managed agents on the Claude Developer Platform. One
repository holds the reusable template; each product the team runs lives in
its own instance configuration. Render validates and emits the deployable
artifacts; deploy provisions them idempotently.

## How it fits together

| Piece | What it is |
|---|---|
| `template/` | The product-agnostic team: one `agent.md` per chartered role, placeholder vocabulary, shared docs. Placeholders like `{{project.name}}` — never a concrete product. |
| `instances/<slug>/` | Everything product-specific: `config.yaml` (project, models, environments, secret references, MCP servers, webhooks, budget), memory seed files. |
| `src/render/` | `autopm render <instance>` — resolves placeholders, validates two contracts (CreateAgent-shaped agent YAML, structured deploy manifest), emits `instances/<slug>/.rendered/`. |
| `src/deploy/` | `autopm deploy <instance> [--dry-run]` — idempotent provisioning from the manifest: environments → vault + credentials → memory stores → agents → scheduled deployments (created paused). Records ids in `.deployed.json`. |
| `src/runtime/` | `autopm run <instance>` — the live dispatcher (third-party webhooks, session monitoring, escalations). In progress. |
| `docs/specs/` | The system's definition. Design changes land here in the same PR as the code. |

Secrets never enter the repo: `config.yaml` carries references in the form
`env:VAR_NAME`, resolved at deploy time from the deploy host's environment
(the operator's gitignored `.env` — see `.env.example`).

## Toolchain

```sh
bun install
bun test            # must be green before merge
bun run typecheck   # ditto
bun run render <instance>
bun run deploy <instance> [--dry-run]
```

## Working on this repo

See [AGENTS.md](AGENTS.md) for the ground rules: where work is tracked, the
per-issue rhythm, branching, and public-readiness constraints. The design
spec under `docs/specs/` is the authority for how the system behaves.
