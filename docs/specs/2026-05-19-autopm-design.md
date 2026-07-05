---
title: AutoPM — design spec
type: doc
created: 2026-05-19
updated: 2026-07-05
tags: [autopm, spec, design, managed-agents, leandomainsearch]
---

# AutoPM — Design Spec

The reusable autonomous-product-team template, plus its first instance
(LeanDomainSearch), running on Anthropic Claude Managed Agents.

This spec is the **definition of done** for the AutoPM system design.
Implementation sequencing lives in the shipping plan (eleven named
milestones, Foundation → Ledger), tracked in Linear; the per-issue rhythm
is documented in `AGENTS.md`.

**Amended 2026-07-05** (TOTORO-252): every platform assumption re-verified
against the live Managed Agents documentation; roster rechartered (Product
owns WHAT/WHY and results; the Orchestrator — formerly "Project" — owns
WHO/WHEN); sandbox model restructured around first-class environments;
cron triggers moved onto native scheduled deployments; independence scrub
(AutoPM references no operator-personal systems).

## 1. Goal and non-goals

**Goal.** A team of nine cooperating Claude Managed Agents that runs a
software product end-to-end across nine disciplines (Product, Code,
Quality, Design, Marketing, Support, Research, Orchestrator, Finance).
**Product decides WHAT to build and owns the results** — it authors the
acceptance rubric before work starts and judges the outcome after. **The
Orchestrator decides WHO and WHEN** — routing, sequencing, and convening.
The team definition is **reusable** across multiple products; the
LeanDomainSearch instance is the first deployment.

**Non-goals (this spec).**

- Actual content of LeanDomainSearch's KPIs, audience definitions, memory
  bootstrap content, or product canon. We scaffold the files; content
  arrives with the North star milestone.
- The LeanDomainSearch product repo's home (github.com org/repo vs a
  mirror). Managed sandboxes reach github.com only; the call is tracked
  as its own Foundation decision.
- Implementation order, dates, exit criteria — that belongs in the
  shipping plan, not this design.

## 2. Source material

The design is grounded in a Managed Agents research corpus produced
2026-05-13 and a full platform re-verification performed 2026-07-05
against Anthropic's live documentation (overview, reference, MCP tunnels,
pricing, API release notes). The corpus is operator-private and is cited
**textually, never by path or link** — AutoPM carries no references into
any personal system. Corpus-internal names used in citations:

- `01-overview` — platform capabilities and limits.
- `02-architecture/02b-api-cookbook` — Python/TS/curl primitives.
  **Historical**: predates scheduled deployments and env-var credentials.
- `03-memory` — memory store mechanics.
- `04-tools-mcp` — tools, custom tools, MCP, skills.
- `05-orchestration` — coordinator, rubric grading, self-correction.
- `06-pricing-limits` — $0.08/session-hour, token rates, hard limits.
  Economics reconfirmed on the official pricing page 2026-07-05.
- `08a-team-architecture` — full 9-agent roster with system prompts.
- `08b-memory-schema` — store schema.
- `08c-build-plan` — generic phasing, gates, shadow-mode discipline.
- `08e-reference-dispatcher` — **historical**: predates deployments.

The durable parts are 08a/08b/08c and 06. Where this spec deviates from
the corpus, the deviation is called out in-line.

## 3. Naming

The research used personified names. AutoPM uses **role-based names** so
the template is reusable across instances:

| Research name | AutoPM role | Config slug |
|---|---|---|
| Frida (PM-Orchestrator) | **Product** | `product` |
| Eli (Engineering) | **Code** | `code` |
| Atlas (QA) | **Quality** | `quality` |
| Daria (Design) | **Design** | `design` |
| Mira (Marketing) | **Marketing** | `marketing` |
| Sasha (Support) | **Support** | `support` |
| Patti (User Research) | **Research** | `research` |
| Pierre (Project Management) | **Orchestrator** | `orchestrator` |
| Felix (Financial Reporting) | **Finance** | `finance` |

**Roster recharter (2026-07-05).** The research's "Frida" bundled product
judgment with delivery mechanics; AutoPM splits them:

- **Product** owns WHAT and WHY, and owns the results: roadmap,
  prioritization, what "done" means. It authors the outcome definition
  and acceptance rubric for every piece of delegated work (the platform's
  Outcomes feature is its ownership instrument), reviews delivered
  results — accepts, rejects, or sends back — and stewards product canon,
  the decisions log, metrics, and outcome retros.
- **Orchestrator** (rechartered from "Project") owns WHO and WHEN:
  routing judgment, sequencing, capacity. It owns the trigger→agent
  routing table, holds the `multiagent` coordinator configuration,
  convenes multi-agent sessions, and carries Linear housekeeping, status
  digests, budget-cap enforcement, librarian duty, and process retros.

No tenth agent: the Orchestrator absorbs the old Project charter. The
template directory renames accordingly (`template/agents/Orchestrator/`).

## 4. Models

**All agents default to `claude-opus-4-8`** (launched 2026-05-28; same
price and API surface as Opus 4.7, strictly better). Rationale
unchanged: rule out model quality as a variable while the system is
being debugged — max-model-first, AB-test down per role only once the
team is stable (post-Ledger).

The config `ModelId` enum stays an enum (typo protection on a field that
silently costs money) and covers at least:

| Model | ID | Position in AutoPM |
|---|---|---|
| Claude Opus 4.8 | `claude-opus-4-8` | **Default for all nine roles** |
| Claude Sonnet 5 | `claude-sonnet-5` | Heads the AB-test shortlist for specialist roles (Code, Quality, Design, Marketing, Research) once the team is stable |
| Claude Haiku 4.5 | `claude-haiku-4-5` | Later candidate for lighter roles (Support, Orchestrator status digests, Finance) |
| Claude Opus 4.7 | `claude-opus-4-7` | Previous default; active, kept for rollback |
| Claude Fable 5 | `claude-fable-5` | **Deliberate later experiment, Product only**: 2× cost, always-on thinking, refusal classifiers, workspace-level 30-day-retention requirement, and a ~3-week availability incident (June 2026) — not the foundation of a 24/7 team yet |

Per-role model overrides live in `instances/<x>/config.yaml: models.<role>`.

Authoring consequence: Opus 4.8 follows instructions more literally than
the models the research prompts were written against and under-reaches
for tools by default. Keep system prompts lean; give every tool and MCP
entry an explicit when-to-use line; no "CRITICAL: you MUST" scaffolding.

## 5. Repo layout

```
AutoPM/                                  # standalone repo: github.com/p3ob7o/AutoPM
├── README.md                            # what AutoPM is, how to use it
├── CHANGELOG.md
├── AGENTS.md                            # working agreements (Linear/GitHub split, rhythm)
├── .gitignore                           # includes instances/*/.rendered/
├── package.json                         # @anthropic-ai/sdk, hono, zod, gray-matter, …
├── tsconfig.json
├── bun.lock
│
├── template/                            # reusable team, project-agnostic
│   ├── README.md
│   ├── agents/
│   │   ├── Product/agent.md
│   │   ├── Code/agent.md
│   │   ├── Quality/agent.md
│   │   ├── Design/agent.md
│   │   ├── Marketing/agent.md
│   │   ├── Support/agent.md
│   │   ├── Research/agent.md
│   │   ├── Orchestrator/agent.md
│   │   └── Finance/agent.md
│   ├── memory-schema.md                 # 10 stores: ownership, access, retention
│   ├── orchestration.md                 # delegation rules, multi-agent sessions, rubrics
│   ├── triggers.md                      # event taxonomy (three classes, §11)
│   ├── operations.md                    # design principles, eval gates, cost discipline
│   ├── tools-and-mcp.md                 # catalog of tools/MCP servers assumed
│   ├── build-plan.md                    # generic phased rollout (which agents first)
│   └── placeholders.md                  # canonical placeholder vocabulary
│
├── instances/
│   └── leandomainsearch/
│       ├── README.md
│       ├── config.yaml
│       ├── goals.md                     # seeded in the North star milestone
│       ├── metrics.md                   # seeded in the North star milestone
│       ├── operating-rhythm.md
│       ├── build-plan.md                # instance-specific phasing w/ dates
│       ├── memory/                      # bootstrap content per writable store
│       │   ├── product-canon.md
│       │   ├── engineering-conventions.md
│       │   ├── quality-runbook.md
│       │   ├── design-system.md
│       │   ├── brand-voice.md
│       │   ├── support-macros.md
│       │   └── research-protocol.md
│       └── agents/                      # OPTIONAL per-agent overrides
│           └── <Role>/overrides.md      # only when needed
│
├── src/
│   ├── render/
│   │   ├── index.ts
│   │   ├── placeholders.ts              # {{project.name}} substitution
│   │   └── schema.ts                    # zod schemas
│   ├── deploy/
│   │   ├── agents.ts
│   │   ├── environments.ts
│   │   ├── memory.ts
│   │   ├── deployments.ts               # scheduled deployments (cron triggers)
│   │   ├── skills.ts
│   │   └── vault.ts
│   ├── runtime/
│   │   ├── server.ts                    # Hono server: third-party webhooks only
│   │   ├── webhooks/                    # per-event handlers
│   │   ├── sessions.ts                  # session lifecycle, archive
│   │   ├── triggers.ts                  # event → agent + brief routing
│   │   ├── escalation.ts                # human-in-the-loop (Slack app)
│   │   └── db.ts                        # persistence
│   ├── lib/
│   │   ├── anthropic.ts                 # SDK client
│   │   ├── config.ts
│   │   └── logger.ts
│   └── cli/
│       └── autopm.ts                    # autopm render | deploy | run
│
├── tests/
│   ├── render/                          # snapshot tests
│   ├── runtime/                         # webhook + trigger tests
│   └── fixtures/
│
└── docs/
    ├── specs/                           # this file lives here
    ├── decisions/                       # ADRs
    └── reference/
        ├── render.md                    # how template + instance assemble
        └── operating.md                 # run/monitor/update the team
```

## 6. Runtime stack

- **Language**: TypeScript.
- **Toolchain**: Bun (default). Trivially swappable to Node + pnpm.
- **HTTP server**: Hono. Runtime-agnostic (Node, Bun, Cloudflare Workers,
  Vercel, Lambda) so the dispatcher's host stays a late decision.
- **Schema validation**: Zod.
- **Frontmatter parsing**: gray-matter.
- **Anthropic SDK**: `@anthropic-ai/sdk`. Pinned `^0.97.1` today, which
  on a 0.x version resolves patch-only — widening is a deliberate edit.
  **Move to `^0.110.0` when deploy work starts**: `beta.deployments` /
  `beta.deploymentRuns` arrived in 0.104.0, agent- and
  deployment-lifecycle webhook event types in 0.109.0; the range is
  additive-only. The explicit `managed-agents-2026-04-01` header pin in
  `src/lib/anthropic.ts` is redundant-but-harmless now that the SDK sets
  per-namespace beta headers; drop or keep at deploy time.

Managed Agents remains beta (header unchanged since April 2026;
"behaviors may be refined between releases") and is explicitly **not
ZDR- or HIPAA-BAA-eligible** — fine for LeanDomainSearch; re-evaluate
for any future instance handling regulated data.

## 6A. Execution environments

Where each agent's tool calls (bash/glob/grep/read/write/edit) physically
execute. **Sandbox choice is a property of the *environment*, not the
agent** — environments are first-class platform objects; each session
runs in one.

The instance config declares named environments and assigns roles to
them (§12):

- **`cloud`** (default) — tools execute in Anthropic's container
  (Ubuntu 22.04, x86_64, up to 8 GB RAM / 10 GB disk, multi-language
  runtimes pre-installed). Zero infra to operate.
- **`self_hosted`** — the agent orchestration loop stays on Anthropic,
  but tool execution moves to an **outbound-polling worker you run**
  (`EnvironmentWorker` in Python/TS/Go, or `ant beta:worker poll`)
  authenticated by an environment key. There are no provider/endpoint
  config fields — the worker *is* the integration. A real worker-host
  ecosystem exists (Cloudflare, Modal, E2B, GKE Agent Sandbox, Vercel,
  and others are documented hosts).

**Current self-hosted limitations (verified 2026-07-05):** no memory
stores, no `environment_variable` vault credentials, resource mounting
is on you. Flipping Code/Quality to a self-hosted environment today
would cost them their institutional-memory mounts — don't, until the
limitation lifts.

**v1 default:** one shared `cloud` environment for all nine roles. The
config schema, render output, and deploy plumbing carry the
role→environment mapping from day one, so moving a role later is a
config change, not a code change. Environment `networking` policy
(allowed hosts, MCP allowance) is the cost/exfiltration guardrail
`operations.md` documents.

**Related: MCP Tunnels** (research preview; management API at
`/v1/tunnels`, beta `mcp-tunnels-2026-06-22`; request-access;
Cloudflare as transport subprocessor; no uptime/continuity commitment).
Shape correction from the May draft: **there is no `tunnel_id` config
field anywhere.** A tunneled MCP server is addressed as an ordinary
`url` under your tunnel domain; the tunnel itself is infrastructure you
run in your network plus Console/API-side registration. Deployment
documentation belongs in `template/tools-and-mcp.md`; enrollment is
parked in §17.

## 6B. Deployment phases

Decided 2026-05-21; independence scrub 2026-07-05.

**AutoPM names only its own infrastructure.** Its own repo, its own
Anthropic API key with a hard Console spend limit, its own secret-manager
vault, its own LaunchAgent labels (`com.autopm.*`), its own Slack app,
its own heartbeat — shared with nothing. No milestone may take a
dependency on operator-personal systems.

- **v1 — operator-provided always-on host.** The dispatcher (§13 `run`)
  is a single process under AutoPM's own LaunchAgent
  (`com.autopm.dispatcher`), running from a standalone clone on an
  always-on macOS host. The host is interchangeable, never a dependency.
  The dispatcher's v1 scope is deliberately small:
  - **Third-party webhooks** (GitHub, Linear, helpdesk) → Hono routes.
    Inbound reachability via a public HTTPS endpoint (e.g. a Tailscale
    funnel while self-hosted); Hono is host-agnostic, so a small
    container platform is a drop-in replacement later, which also
    removes the need for a funnel.
  - **Session monitoring** — Anthropic webhooks (HMAC-signed, thin
    payloads, `session.status_*` + `deployment_run.*` events) if the
    public endpoint exists, else SSE watchers with the documented
    reconnect-with-consolidation pattern. Anthropic webhook endpoints
    must be publicly resolvable HTTPS:443 — private-IP resolution
    auto-disables the webhook.
  - **Escalation** — `escalate_to_human` round-trips through AutoPM's
    own Slack app (Socket Mode: outbound websocket, no public URL, so
    the escalation channel stays independent of the funnel), rendering
    Block Kit approve/reject actions that return as
    `user.custom_tool_result`.
  - **Cron is not in the dispatcher.** All scheduled triggers run as
    native platform deployments (§11).
  - All roles run in the shared `cloud` environment in v1 — no
    self-hosted worker infra exists, and `cloud` is the default anyway
    (§6A). API key from AutoPM's own vault, hard spend limit set in the
    Console before anything runs.
- **v2 — hosted infrastructure.** Once v1 is proven, migrate the
  dispatcher to hosted/company infrastructure (candidate substrates:
  Atomic, or Claude Platform on AWS — the full Managed Agents surface
  runs there since 2026-05-29). At that point consider flipping
  Code/Quality to a self-hosted environment **only if** the
  memory-store limitation (§6A) has lifted, move secrets to the target
  vault, and repoint webhooks. Because the runtime is Hono and
  execution placement is config-only, this migration is configuration +
  redeploy, not a rewrite.

## 7. Per-agent file shape

Every `template/agents/<Role>/agent.md` follows the same structure:

```markdown
---
title: <Role> Agent
type: autopm-agent
created: 2026-05-19
updated: 2026-07-05
role: <Role>
model_default: claude-opus-4-8
session_length:
  typical: "<range>"
multi_agent: coordinator | none       # coordinator on Orchestrator only
tags: [autopm, agent, <role-lowercase>]
---

## Role
Who they are, what they own, what they don't do.

## Workflow
Numbered playbook for the primary task type.

## System Prompt
```text
You are the {{role}} agent for {{project.name}}. …
```

## Tools
- agent_toolset_20260401 with permission policies
- Custom tools (input schemas defined separately), each with an explicit
  when-to-use line

## MCP Servers
| Name | URL | Permission policy |
|---|---|---|
| github | {{mcp.github.url}} | default-allow; merge_pr always-ask |

## Skills
- Anthropic skills: …
- Custom skills (from template/skills/): …

## Memory Stores
| Store | Access | Why |
|---|---|---|

## Triggers
- Event → spawn-rule.

## Rubric
(Optional, only for graded outputs.)

## Notes
Caveats, why-this-way, research citations (textual).
```

Notes on the shape:

- There is **no sandbox/environment key in agent frontmatter** —
  execution placement is instance configuration (§6A, §12), not an
  agent property. Agent prose should not state its sandbox.
- `multi_agent: coordinator` belongs to the Orchestrator only (§10).

**Mapping to the platform.** Render's output is mechanical; each agent.md
section maps to a CreateAgent field or deploy-time resource:

| agent.md | Platform |
|---|---|
| `## System Prompt` fenced block | `system` |
| `## Tools` | `tools[]` (toolset + custom tool definitions) |
| `## MCP Servers` | `mcp_servers[]` + toolset permission entries |
| `## Skills` | `skills[]` |
| frontmatter `multi_agent` | `multiagent: {type: "coordinator", agents: […]}` (Orchestrator only) |
| frontmatter `model_default` (⊕ config `models.<role>`) | `model` |
| `## Memory Stores` | session `resources[]` (stores attach at session create) |
| `## Triggers` | scheduled deployments (`cron.*`) or dispatcher routes (§11) |
| `## Rubric` | outcome rubric file — uploaded at deploy, referenced by `file_id` in `user.define_outcome` |

**Override convention.** If
`instances/<x>/agents/<Role>/overrides.md` exists and contains an H2
`## System Prompt Append` or `## Notes Append`, the render tool appends
that section's body to the corresponding section of the template's
agent.md. No other section overrides are supported. If you need
deeper per-instance customization, the template itself is wrong.

## 8. Placeholder vocabulary

Canonical list lives in `template/placeholders.md`, kept in sync with the
resolver (`src/render/placeholders.ts`). Render fails loudly on any
undeclared placeholder. Tokens are resolved **per-agent**: role-relative
tokens (`{{model}}`, `{{sandbox_mode}}`) resolve relative to the agent
being rendered. Memory bootstrap files are resolved in the Product
role's context.

| Placeholder | Source | Example |
|---|---|---|
| `{{role}}` | agent frontmatter `role` (display name) | `Product` |
| `{{model}}` | `config.models[thisRole]` ?? agent `model_default` | `claude-opus-4-8` |
| `{{sandbox_mode}}` | type of the environment this role is assigned to (`environments.roles[thisRole]` → definition `type`) | `cloud` |
| `{{project.name}}` | `config.project.name` | `LeanDomainSearch` |
| `{{project.slug}}` | `config.project.slug` | `leandomainsearch` |
| `{{project.repo}}` | `config.project.repo` | `git@github.com:acme/leandomainsearch.git` |
| `{{project.domain}}` | `config.project.domain` | `https://leandomainsearch.com` |
| `{{project.description}}` | `config.project.description` | multi-line string |
| `{{project.canon_path}}` | static | `/mnt/memory/product-canon` |
| `{{vault.<name>}}` | `config.vault[name]` | `op://AutoPM-LDS/github/credential` |
| `{{mcp.<name>.url}}` | `config.mcp[name].url` | `https://api.githubcopilot.com/mcp/` |
| `{{webhook.<event>}}` | `config.webhooks.base_url` + `routes[event]` (third-party events only, §11) | `https://autopm-lds.example.com/wh/github/pr.opened` |
| `{{budget.monthly_cap_usd}}` | `config.budget.monthly_cap_usd` | `800` |
| `{{scheduler.timezone}}` | `config.scheduler.timezone` — feeds every scheduled deployment's IANA timezone | `Europe/Lisbon` |

Dropped from the May vocabulary (schema change tracked separately):
`{{sandbox_provider}}`, `{{sandbox_endpoint}}` (no such platform fields —
§6A), `{{mcp.<name>.tunnel_id}}` (no such config field — §6A). Keep
`{{sandbox_mode}}` only as the role→environment-type lookup; agent prose
rarely needs it (§7).

`{{vault.<name>}}`, `{{mcp.<name>.url}}`, and `{{webhook.<event>}}` fail
render if the named entry is absent from `config.yaml` — a missing
credential or route should stop a deploy, not silently render blank.
Secret *references* only; values are resolved at deploy time from the
operator's secret manager and never enter the repo or the sandbox.

## 9. Memory schema

Defined in `template/memory-schema.md`. Ten stores, mapped per-agent in
each agent.md `Memory Stores` table.

| Store | Owner | Mode | Retention | Seed required? |
|---|---|---|---|---|
| `product-canon` | Product | r/o for all; Product writes via promotion | 90d versioned | yes |
| `decisions-log` | Product | r/w Product; r/o others | 365d | no (grows) |
| `team-roster` | template-rendered | r/o all | static | yes (auto) |
| `engineering-conventions` | Code | r/w Code; r/o Quality | 90d versioned | yes |
| `quality-runbook` | Quality | r/w Quality; r/o Code | 90d versioned | yes |
| `design-system` | Design | r/w Design; r/o Code, Marketing | 90d | yes |
| `brand-voice` | Marketing | r/w Marketing; r/o Support, Design | 90d | yes |
| `support-macros` | Support | r/w Support | 90d versioned | yes |
| `research-protocol` | Research | r/w Research; r/o Product | 90d | yes |
| `finance-actuals` | Finance | r/w Finance; r/o Product | 30d | no (grows) |

Platform mechanics (confirmed 2026-07-05): stores FUSE-mount at
`/mnt/memory/<store-name>/` with `access` enforced at the filesystem
level; `instructions` ≤ 4,096 chars are injected into the system prompt;
seed via `memories.create`; versions + `redact` give audit and rollback;
8 stores/session, 100 KB/memory, stores attach at session create only.

Two contracts to keep explicit:

- **Store name = mount directory.** `{{project.canon_path}}` resolving to
  `/mnt/memory/product-canon` depends on the store being *named*
  `product-canon`. Deploy creates stores with exactly the §9 names.
- **Retention is the librarian's job, not the platform's.** The API has
  versions and redaction, no TTL. The retention windows above are
  implemented by the Orchestrator's librarian duty (§11), with the
  memory-versions API as the audit/rollback surface. The platform's
  "Dreams" feature (research preview) may later absorb the mechanical
  half (dedup, stale-entry replacement); the human-gated canon-promotion
  half stays ours.

## 10. Orchestration

Defined in `template/orchestration.md`. Key rules:

- **Product decides and accepts; the Orchestrator routes and convenes.**
  Product authors the outcome definition and acceptance rubric for every
  piece of delegated work *before* it starts, and reviews the result
  after — accept, reject, or send back. The Orchestrator decides which
  specialist gets which work, in what order, and convenes any
  multi-agent session. Neither executes specialist work itself.
- **The Orchestrator is the coordinator.** It holds the platform
  `multiagent: {type: "coordinator", agents: […]}` configuration; its
  roster references the other eight roles (+ `{type: "self"}`) and grows
  as agents deploy. Most work happens in single-specialist sessions;
  multi-agent sessions are reserved for cross-cutting work (planning,
  retros, multi-feature delivery).
- **One session = one task.** Failures isolate, cost is predictable,
  sessions get archived when done.
- **1-level multi-agent only** (platform limits, confirmed current:
  20-agent roster, 25 threads, 1 level). The Orchestrator convenes
  specialists; specialists can't spawn sub-coordinators.
- **Rubric-grade every customer-facing output.** Outcomes wiring:
  Product's rubric renders to a file, uploads at deploy, and is
  referenced via `user.define_outcome` (rubric `text` or `file_id`;
  `max_iterations` default 3, max 20; grader progress visible as
  `span.outcome_evaluation_*` events). A session kicks off with the
  outcome **or** a message, never both.
- **Critical writes are always-ask.** Production DB writes, customer
  emails, money movement, public posts, `merge_pr` — all gated.
- **Budget enforcement is the Orchestrator's, pre-flight.** It checks
  projected spend against the cap before convening work and refuses
  over-cap plans; refusals escalate. (Finance reports and alarms — §11;
  the Console hard limit is the mechanical backstop.)
- **Escalate to human** — via `escalate_to_human` → the AutoPM Slack app
  (§6B) — when budget would be exceeded, a decision contradicts canon, a
  customer issue is too sensitive, or confidence is low.

## 11. Triggers

Defined in `template/triggers.md`. **The routing table is owned by the
Orchestrator.** Three trigger classes:

**Class 1 — scheduled: native platform deployments.** Every `cron.*`
trigger is a scheduled deployment (cron expression + IANA timezone from
`scheduler.timezone`), not our infrastructure: per-run audit records,
pause/unpause/archive, auto-pause on non-recoverable failure, manual
`run` for smoke-testing (works while paused), ≤10 s jitter, minute
granularity. Run outcomes are observable via `deployment_run.*` webhook
events. No missed-tick logic on our side. Event names encode their
schedule — `cron.daily.HHMM` or `cron.weekly.<weekday>.HHMM` (24h, in
`scheduler.timezone`); render derives each deployment's cron expression
mechanically from the name.

| Event | Lands on |
|---|---|
| `cron.daily.0900` | Orchestrator (status digest) |
| `cron.weekly.monday.1000` | Orchestrator (convenes weekly planning; Product leads WHAT) |
| `cron.daily.0300` | Finance (spend report) |
| `cron.daily.0500` | Orchestrator (librarian duty: curates scratchpads → canon proposals, archives stale notes) |

**Class 2 — third-party webhooks: our dispatcher.** Hono routes
(`webhooks.routes`, §12) receive, verify, build a brief, and create a
session:

| Event | Source | Lands on |
|---|---|---|
| `pr.opened` | GitHub webhook | Quality |
| `pr.review_requested_human` | GitHub | Product |
| `linear.issue_assigned_to_code` | Linear | Code |
| `support.ticket_received` | helpdesk | Support |
| `interview.transcript_uploaded` | manual / meeting-notes source | Research |

**Class 3 — internal.**

| Event | Source | Lands on |
|---|---|---|
| `budget.alarm` | Finance | Product (reassess priorities: descope, pause, rescope) + Slack |
| `manual.<role>` | CLI (`autopm run <role> --brief`) | named role via `sessions.create` |

Each event documents payload shape, brief construction, retry policy,
and which agent receives it. `webhooks.routes` config keys exist only
for class 2.

## 12. Instance schema

`instances/<x>/config.yaml` (final shape; the zod schema and render
pipeline move to this in the follow-up schema issue):

```yaml
project:
  name: <string>                # required
  slug: <kebab>                 # required
  repo: <git URL>               # required (github.com — managed sandboxes reach no private hosts)
  domain: <URL>                 # required
  description: <multi-line>     # required

models:                         # per-role override; omitted role → agent model_default
  product: <claude model ID>
  code: …
  quality: …
  design: …
  marketing: …
  support: …
  research: …
  orchestrator: …
  finance: …

environments:
  definitions:                  # named environments; names are workspace-unique at deploy
    default:
      type: cloud               # cloud | self_hosted
      networking:
        policy: limited         # limited | open
        allow_mcp_servers: true
        allowed_hosts: []       # explicit egress allowlist — the cost/exfil guardrail
  roles:                        # per-role assignment; omitted role → `default`
    # code: default             # (example: a future self-hosted env would be named here)

vault:                          # secret *references* into AutoPM's own vault; resolved at deploy
  github: <secret ref>          # required
  linear: <secret ref>          # required
  helpdesk: <secret ref>        # optional, required if Support deployed
  anthropic: <secret ref>       # required

mcp:
  github: { url: <URL> }
  linear: { url: <URL> }
  # …additional MCP servers as needed. Tunneled servers are plain URLs
  # under your tunnel domain — there is no tunnel field (§6A).

webhooks:                       # class-2 (third-party) events only — §11
  base_url: <URL>               # required for live runtime
  routes:
    pr_opened: /wh/github/pr.opened
    ticket_received: /wh/helpdesk/ticket
    # …

budget:
  monthly_cap_usd: <int>
  alarm_threshold_pct: <int>    # default 75

scheduler:
  timezone: <IANA TZ>           # e.g. "Europe/Lisbon" — every deployment's timezone
```

Other instance files:

- `goals.md` — north-star, KPIs, audience, monetization, scope.
- `metrics.md` — what's measured, where dashboards live, SLAs.
- `operating-rhythm.md` — sprint cadence, retro cadence, release
  cadence.
- `build-plan.md` — instance-specific sequencing (dates, sprints, exit
  criteria) that overlays the generic `template/build-plan.md`.
- `memory/<store>.md` — one file per writable memory store flagged
  "seed required" in §9. Body becomes the initial memory content.
- `agents/<Role>/overrides.md` — optional, only when an agent needs an
  instance-specific tail.

## 13. CLI and runtime contract

Three subcommands:

### `autopm render <instance>`

Pure transform; no API calls.

1. Loads `template/` and `instances/<instance>/`.
2. Validates with Zod: placeholder coverage (every `{{…}}` in
   template/instance is declared in `placeholders.md`); frontmatter
   shapes; `config.yaml` schema; memory bootstrap files cover every
   `seed required` store.
3. Substitutes placeholders.
4. Emits `instances/<instance>/.rendered/` (gitignored) — two contracts:
   - **Per-agent CreateAgent-shaped YAML** —
     `agents/<role>.agent.yaml` (flat `name` / `model` / `system` /
     `tools` / `mcp_servers` / `skills` / `multiagent` / `metadata`;
     `name` is `<project.slug>-<role>`, `metadata` carries
     `autopm_instance` + `autopm_role`), the version-controlled
     definition the platform's own workflow expects
     (`ant beta:agents create < file`, `update --version N`).
   - **Structured manifest** — `manifest.json`: environment definitions
     + role assignments, vault entries to create, memory-store names +
     seed sources, deployment specs (cron expression + timezone +
     initial event per `cron.*` trigger), and the webhook-registration
     checklist.
   - Plus `memory/<store>.txt` (final seed content),
     `rubrics/<Role>.md` (outcome rubric files, §7 mapping), and
     `skills/<id>/…` (custom skill bundles).
5. Exit non-zero on any validation failure with a clear pointer to the
   offending file + line.

### `autopm deploy <instance> [--dry-run]`

Provisions in dependency order. Idempotent.

1. Re-runs render if `.rendered/` is stale.
2. Provisions: **environments** (names are workspace-unique — treat 409
   as "exists, reuse") → **vault + credentials** (secret refs resolved
   from the operator's secret manager at deploy time; three platform
   credential types: `mcp_oauth`, `static_bearer`,
   `environment_variable` with egress substitution scoped by
   `allowed_hosts` + `injection_location`) → **memory stores** (+seed;
   store `description` fields are written *for the model* — they inject
   into the system prompt) → **custom skills** → **eight specialist
   agents** → **Orchestrator last** (its coordinator roster references
   the specialists' IDs) → **scheduled deployments** (one per `cron.*`
   trigger; verify `upcoming_runs_at`; smoke-test via manual `run`) →
   **webhook registration** — Console-manual today, shipped as the
   manifest's documented checklist with the event subscriptions.
3. Note: the repo PAT feeds *two* consumers — the session
   `github_repository` resource (clone/push via the platform's git
   proxy) and the GitHub MCP vault credential (PR creation). PRs need
   both.
4. `--dry-run` prints the plan without making API calls.
5. Writes `instances/<instance>/.deployed.json` — **id + version** of
   every created resource (agents, environments, stores, skills,
   deployments, vault refs).
6. Re-running `deploy` on an already-deployed instance updates
   in place. Memory stores are NOT overwritten — separate
   `autopm seed-memory --force` for that.

### `autopm run <instance>`

Live dispatcher — deliberately small (§6B): third-party webhooks,
session monitoring, escalation. **No cron** (class-1 triggers are
platform deployments).

1. Starts Hono on `config.yaml: webhooks.base_url`'s port.
2. Loads `.deployed.json` for agent/environment/store IDs.
3. Registers handlers for every route in `config.yaml: webhooks.routes`
   (class-2 events only), with webhook-secret verification.
4. For each event: build a brief, create a session (agent id,
   environment, memory `resources[]`, vault ids, repo resource where
   relevant), monitor, write the outcome to `decisions-log` and the
   relevant working memory.
5. Session monitoring adopts the documented client patterns verbatim:
   stream-before-send; idle-gate on `stop_reason`
   (`requires_action` ≠ done); reconnect-with-consolidation (SSE has no
   replay); `processed_at` semantics; the post-idle status race. Prefer
   Anthropic webhooks over held SSE streams when the public endpoint
   exists (§6B). Print each session's Console trace URL in the
   heartbeat log.
6. Escalations round-trip through the AutoPM Slack app (§6B).
7. Heartbeat JSONL at `.runtime/heartbeat.jsonl`, readable by external
   monitors.
8. Graceful shutdown: stop accepting new events; let in-flight sessions
   complete or hand to continuation log.

## 14. Out of scope (this repo, this spec)

- **Anthropic-side account provisioning.** AutoPM assumes its dedicated
  API key exists with a hard Console spend limit, credentials live in
  AutoPM's own vault, and the beta is enabled.
- **Self-hosted environment worker-host selection** (Cloudflare / Modal /
  E2B / GKE / Vercel / self) and standing up the actual worker. The
  *capability* is in scope (config + render + deploy carry
  role→environment assignments); choosing and building a worker host is
  deferred, and gated on the memory-store limitation anyway (§6A).
- **MCP Tunnels enrollment.** Research preview, request-access,
  transport dependency on Cloudflare, no continuity commitment. Plain-URL
  shape means no schema impact; revisit when a private-MCP need
  materializes (§17).
- **Observability stack** beyond the heartbeat JSONL. Hook a real
  monitoring stack in later.
- **Actual LeanDomainSearch product knowledge** (KPIs, audience, memory
  bootstrap content, system-prompt overrides) — arrives with the North
  star milestone.
- **Migration of an existing PM workflow** (backlog, on-call rotation)
  into AutoPM. Separate effort once the team is live.

## 15. Git wiring

AutoPM is a **standalone repository**: `github.com/p3ob7o/AutoPM`
(private today; extracted from the operator's notes with history
squashed, 2026-07-05). It references no other repository and no
operator-personal system.

- **Linear owns the work, GitHub owns the artifacts** — the full working
  agreement, per-issue rhythm (issue → `totoro-N` branch → PR → merge),
  and repo ground rules live in `AGENTS.md`.
- `main` stays green: `bun test` and `bun run typecheck` pass before
  merge.
- Always-on pieces (the v1 dispatcher) run from a **standalone clone**
  on the host, outside any synced or personal directory — the host is
  interchangeable (§6B).
- Before any visibility flip to public: a final history squash and the
  repo-wide identifier scrub (tracked as its own issue) gate the change.

## 16. Acceptance criteria — initial scaffold (historical)

> **Status 2026-07-05:** the scaffold's code layer (criteria 1, 5, 6 and
> the render skeleton) shipped in May. The remaining authoring work
> (agents, cross-cutting docs, instance content) was folded into the
> shipping plan's milestones, **whose gates supersede these criteria**
> for everything after the scaffold. Kept for the record, with two
> criteria restated to match the amended design.

1. AutoPM is a standalone git repo with the layout in §5.
2. All nine `template/agents/<Role>/agent.md` files exist with the
   §7 structure populated from research, with placeholders for
   project-specific anchors.
3. All cross-cutting template files (`memory-schema.md`,
   `orchestration.md`, `triggers.md`, `operations.md`,
   `tools-and-mcp.md`, `build-plan.md`, `placeholders.md`) exist with
   content lifted from research and adapted to role-based naming.
4. `instances/leandomainsearch/` exists with `config.yaml` populated
   (placeholders where TBD), and stubs for `goals.md`, `metrics.md`,
   `operating-rhythm.md`, `build-plan.md`, and every required
   `memory/<store>.md`.
5. `src/` has the file skeleton with stub functions and full type
   signatures; `autopm render`, `autopm deploy --dry-run`, and
   `autopm run` exist as CLI entry points (even if implementation is
   incomplete).
6. `bun install` succeeds; `bun test` runs (zero tests is acceptable
   for this scaffold milestone).
7. `autopm render leandomainsearch` runs end-to-end without errors,
   producing `.rendered/` artifacts that the spec can validate
   structurally.
8. *(Restated 2026-07-05.)* AutoPM stands alone: its own repository
   (done — `github.com/p3ob7o/AutoPM`), no references into any
   operator-personal system.
9. *(Restated 2026-07-05, environment terms.)* `config.yaml` defines
   `environments.definitions` + `environments.roles`; every role
   defaults to one shared `cloud` environment; render resolves each
   role's assignment and the manifest carries the environment
   definitions and assignments. No tunnel field exists anywhere.

What is NOT in the acceptance criteria:

- Real LeanDomainSearch content (KPIs, audience, memory bootstrap).
- Actual Anthropic API calls succeeding (we never POST during scaffold;
  the platform smoke test is a Foundation-milestone gate).
- Hono server actually receiving real webhooks.
- Tests of any depth.

## 17. Open questions — status as of 2026-07-05

- ~~Exact org/repo for AutoPM.~~ **Resolved 2026-07-05**: standalone
  `github.com/p3ob7o/AutoPM`. (The LeanDomainSearch *product* repo's
  home is a separate open Foundation decision — managed sandboxes reach
  github.com only, so a private-host repo needs a mirror.)
- ~~Deploy target for the dispatcher.~~ **Decided 2026-05-21**: v1 on an
  operator-provided always-on host under AutoPM's own LaunchAgent;
  **updated 2026-07-05**: v2 candidates are Atomic or Claude Platform on
  AWS (full Managed Agents surface since 2026-05-29). See §6B.
- ~~Cron scheduler choice.~~ **Resolved by the platform (2026-06-09)**:
  native scheduled deployments run all `cron.*` triggers (§11). Nothing
  to choose.
- Whether `autopm run` is one process or split. Default: one process —
  reinforced by the dispatcher shrinking (§6B); revisit when load shows
  up.
- ~~Whether memory bootstrap files support templating.~~ **Shipped as
  designed**: the render tool substitutes placeholders in memory files
  too.
- Where the `decisions-log` mirror and runtime DB persist (SQLite?
  Postgres?). Default: SQLite — and the state it must hold shrank
  (deployment scheduling and webhook bookkeeping are platform-side now).
  Revisit before live deploy.
- Self-hosted environment worker host for Code/Quality. Reframed by the
  platform (§6A): the question is *which worker host*, and it is gated
  on the memory-store limitation lifting. Decide alongside v2.
- Whether to enroll in MCP Tunnels (research preview) and which
  private services would warrant a tunneled MCP server. Request access
  when a concrete need materializes; no schema impact (§6A).

## 18. Reference

- Research corpus: Managed Agents research, 2026-05-13
  (operator-private; cited textually — see §2).
- Platform re-verification: 2026-07-05, against Anthropic's live
  managed-agents overview + reference, MCP-tunnels docs, pricing page,
  and API release notes.
- Anthropic beta header: `managed-agents-2026-04-01` (unchanged since
  April 2026).
- Managed Agents updates, 2026-05-19 (self-hosted sandboxes public beta;
  MCP Tunnels research preview):
  https://claude.com/blog/claude-managed-agents-updates
- Reference architecture cited but NOT adopted:
  [vercel-labs/claude-managed-agents-starter](https://github.com/vercel-labs/claude-managed-agents-starter)
  — a single knowledge-chat agent that polls session events and
  pre-creates its agent out-of-band; useful comparison only. No
  open-source "autonomous product team on Managed Agents" exists as of
  2026-07-05; the first-party primitives (YAML agent definitions,
  coordinator rosters, scheduled deployments) all exist, and AutoPM is
  the assembly of them.
