---
title: AutoPM — design spec
type: doc
created: 2026-05-19
updated: 2026-05-20
tags: [autopm, spec, design, managed-agents, leandomainsearch]
---

# AutoPM — Design Spec

The reusable autonomous-product-team template, plus its first instance
(LeanDomainSearch), running on Anthropic Claude Managed Agents.

This spec is the **definition of done** for the AutoPM repo's initial
scaffolding. Implementation plan is produced separately from this spec by
the writing-plans flow.

## 1. Goal and non-goals

**Goal.** A team of nine cooperating Claude Managed Agents — orchestrated
by a Product agent — that runs a software product end-to-end across nine
disciplines (Product, Code, Quality, Design, Marketing, Support, Research,
Project, Finance). The team definition is **reusable** across multiple
products; the LeanDomainSearch instance is the first deployment.

**Non-goals (this spec).**

- Actual content of LeanDomainSearch's KPIs, audience definitions, memory
  bootstrap content, or product canon. We scaffold the files; you fill
  them in later sessions.
- Choosing the deploy target (Atomic / Vercel / Cloudflare / Modal). The
  runtime is built so any of these can host it; the call comes later.
- The actual GHE org/repo name for AutoPM. Placeholder used; you confirm.
- Implementation order, dates, exit criteria — that belongs in the
  implementation plan, not this design.

## 2. Source material

Research lives in `~/brain/research/ManagedAgents/`, produced
2026-05-13. Key inputs for this spec:

- `01-overview/` — platform capabilities and limits.
- `02-architecture/02-api-cookbook.md` — Python/TS/curl primitives.
- `03-memory/01-memory.md` — memory store mechanics.
- `04-tools-mcp/01-tools-skills-mcp.md` — tools, custom tools, MCP, skills.
- `05-orchestration/01-orchestration-and-outcomes.md` — coordinator,
  rubric grading, self-correction.
- `06-pricing-limits/01-pricing-and-limits.md` — $0.08/session-hour, token
  rates, hard limits.
- `08-team-design/08a-team-architecture.md` — full 9-agent roster with
  system prompts and tool wiring.
- `08-team-design/08b-memory-schema.md` — store schema.
- `08-team-design/08c-build-plan.md` — generic phasing.

Where this spec deviates from research, the deviation is called out
in-line.

## 3. Naming

The research used personified names (Frida, Eli, Atlas, Daria, Mira,
Sasha, Patti, Pierre, Felix). AutoPM uses **role-based names** so the
template is reusable across instances:

| Research name | AutoPM role |
|---|---|
| Frida (PM-Orchestrator) | **Product** |
| Eli (Engineering) | **Code** |
| Atlas (QA) | **Quality** |
| Daria (Design) | **Design** |
| Mira (Marketing) | **Marketing** |
| Sasha (Support) | **Support** |
| Patti (User Research) | **Research** |
| Pierre (Project Management) | **Project** |
| Felix (Financial Reporting) | **Finance** |

"Product" is the strategic orchestrator (Product Manager, Opus 4.7).
"Project" is the task-tracking manager (Project Manager). Distinct roles.

## 4. Models

**All agents start on `claude-opus-4-7`.** Rationale: rule out model
quality as a variable while the system is being debugged. Once the team
is stable, AB-test smaller models per role:

- Likely Sonnet 4.6 candidates: Code, Quality, Design, Marketing,
  Research.
- Likely Haiku 4.5 candidates: Support, Project, Finance.
- Product stays on Opus 4.7 (decision/strategy work).

Per-role model overrides live in `instances/<x>/config.yaml: models.<role>`.

## 5. Repo layout

```
AutoPM/                                  # standalone git repo
├── README.md                            # what AutoPM is, how to use it
├── CHANGELOG.md
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
│   │   ├── Project/agent.md
│   │   └── Finance/agent.md
│   ├── memory-schema.md                 # 10 stores: ownership, access, retention
│   ├── orchestration.md                 # delegation rules, multi-agent sessions, rubrics
│   ├── triggers.md                      # event taxonomy
│   ├── operations.md                    # design principles, eval gates, cost discipline
│   ├── tools-and-mcp.md                 # catalog of tools/MCP servers assumed
│   ├── build-plan.md                    # generic phased rollout (which agents first)
│   └── placeholders.md                  # canonical placeholder vocabulary
│
├── instances/
│   └── leandomainsearch/
│       ├── README.md
│       ├── config.yaml
│       ├── goals.md                     # TODO scaffold
│       ├── metrics.md                   # TODO scaffold
│       ├── operating-rhythm.md          # TODO scaffold
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
│   │   ├── memory.ts
│   │   ├── skills.ts
│   │   └── vault.ts
│   ├── runtime/
│   │   ├── server.ts                    # Hono webhook server
│   │   ├── webhooks/                    # per-event handlers
│   │   ├── sessions.ts                  # session lifecycle, archive
│   │   ├── triggers.ts                  # event → agent + brief routing
│   │   ├── escalation.ts                # human-in-the-loop
│   │   └── db.ts                        # persistence
│   ├── lib/
│   │   ├── anthropic.ts                 # SDK client w/ beta header pinned
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
  Vercel, Lambda) so the deploy target stays a late decision.
- **Schema validation**: Zod.
- **Frontmatter parsing**: gray-matter.
- **Anthropic SDK**: `@anthropic-ai/sdk` with beta header
  `managed-agents-2026-04-01` pinned in `src/lib/anthropic.ts`.

## 6A. Sandbox model

Where each agent's tool calls (bash/glob/grep/read/write/edit) physically
execute. Anthropic announced self-hosted sandboxes on 2026-05-19; AutoPM
treats the choice as a **first-class, per-role configuration dimension**,
not a deferred decision.

Two modes:

- **`managed`** (default) — tools execute in Anthropic's container
  (Ubuntu 22.04, x86_64, up to 8 GB RAM / 10 GB disk, multi-language
  runtimes pre-installed). Zero infra to operate. Agent loop and sandbox
  both live on Anthropic.
- **`self_hosted`** — the agent orchestration loop stays on Anthropic,
  but tool execution moves to a sandbox we control: our own
  infrastructure or a managed provider (Cloudflare, Daytona, Modal,
  Vercel). Lets an agent operate directly against private code and
  services without minting public-facing credentials.

**Why per-role.** Tool-heavy agents that touch the LDS codebase (Code,
Quality) benefit most from `self_hosted`: a sandbox pre-loaded with the
repo, env, internal CLIs, and private-service access. Agents that don't
shell out (Product, Design, Marketing, Support, Research, Project,
Finance) stay on `managed` — simpler and cheaper. **Atomic is a natural
`self_hosted` target** for an Automattic deployment.

**Scaffold default.** Every role defaults to `managed`. The config
schema, render output, and deploy plumbing all support `self_hosted`
from day one, so flipping Code/Quality to a self-hosted sandbox later is
a config change, not a code change. The actual provider (Atomic vs
Cloudflare vs Modal vs Vercel) is chosen when we pick the deploy target
— see §17. This mirrors the model strategy (§4): build the capability in
now, exercise it later.

**Related: MCP Tunnels** (research preview as of 2026-05-19, request
access at claude.com/form/claude-managed-agents). Lets agents reach MCP
servers inside a private network via an outbound-only gateway — no public
exposure, no inbound firewall rules. Supported in both Managed Agents and
the Messages API. Not a scaffold dependency, but the `mcp.<name>` config
(§12) reserves an optional `tunnel_id` field so a private MCP can be wired
in without a schema change once we have access.

## 6B. Deployment phases

Decided 2026-05-21.

- **v1 — Mac Studio (sol).** The dispatcher runs locally under a
  LaunchAgent, mirroring the brain pipeline's infra pattern
  (`com.gbrain.*` agents). Inbound webhooks (GitHub, Linear, helpdesk)
  reach the Hono server via Tailscale — `tailscale serve`/`funnel`,
  the same mechanism that already fronts gbrain MCP at
  `sol.taild9c5c6.ts.net`. Cron triggers use the local `crontab` hitting
  the webhook routes. **All roles run `managed` sandboxes in v1** — no
  self-hosted sandbox infra exists locally, and `managed` is the scaffold
  default anyway (§6A). Anthropic API key from `op://Totoro/...`.
- **v2 — Automattic infrastructure.** Once v1 is proven, migrate the
  dispatcher to Automattic infra (Atomic the likely target). At that
  point, flip Code/Quality to `self_hosted` sandboxes (Atomic-hosted),
  move secrets to the appropriate Automattic vault, and repoint webhooks.
  Because the runtime is Hono (runtime-agnostic) and sandbox mode is
  config-only, this migration is configuration + redeploy, not a rewrite.

The scaffold targets v1. Nothing in the scaffold hardcodes the Mac Studio
— it's just where v1 runs.

## 7. Per-agent file shape

Every `template/agents/<Role>/agent.md` follows the same structure:

```markdown
---
title: <Role> Agent
type: autopm-agent
created: 2026-05-19
updated: 2026-05-19
role: <Role>
model_default: claude-opus-4-7
sandbox_default: managed              # managed | self_hosted (advisory; config.yaml is authoritative)
session_length:
  typical: "<range>"
multi_agent: coordinator | none
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
- Custom tools (input schemas defined separately)
- Sandbox: `{{sandbox.<role>.mode}}` (see §6A). Code/Quality recommend
  `self_hosted`; all others `managed`.

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
Caveats, why-this-way, links to research.
```

**Override convention.** If
`instances/<x>/agents/<Role>/overrides.md` exists and contains an H2
`## System Prompt Append` or `## Notes Append`, the render tool appends
that section's body to the corresponding section of the template's
agent.md. No other section overrides are supported. If you need
deeper per-instance customization, the template itself is wrong.

## 8. Placeholder vocabulary

Canonical list lives in `template/placeholders.md`. Render tool fails
loudly on any undeclared placeholder.

| Placeholder | Source | Example |
|---|---|---|
| `{{project.name}}` | `config.yaml: project.name` | `LeanDomainSearch` |
| `{{project.slug}}` | `config.yaml: project.slug` | `leandomainsearch` |
| `{{project.repo}}` | `config.yaml: project.repo` | `git@github.a8c.com:Automattic/leandomainsearch.git` |
| `{{project.domain}}` | `config.yaml: project.domain` | `https://leandomainsearch.com` |
| `{{project.description}}` | `config.yaml: project.description` | multi-line string |
| `{{project.canon_path}}` | static | `/mnt/memory/product-canon` |
| `{{role}}` | per-agent frontmatter `role:` | `Product` |
| `{{model.<role>}}` | `config.yaml: models.<role>` (fallback: agent frontmatter `model_default`) | `claude-opus-4-7` |
| `{{vault.<name>}}` | `config.yaml: vault.<name>` | `op://Automattic/AutoPM-LDS/GITHUB_TOKEN` |
| `{{mcp.<name>.url}}` | `config.yaml: mcp.<name>.url` | `https://api.githubcopilot.com/mcp/` |
| `{{mcp.<name>.tunnel_id}}` | `config.yaml: mcp.<name>.tunnel_id` (optional; MCP Tunnels, research preview) | `tnl_abc123` |
| `{{sandbox.<role>.mode}}` | `config.yaml: sandbox.roles.<role>.mode` (fallback: agent frontmatter `sandbox_default`) | `managed` |
| `{{sandbox.<role>.provider}}` | `config.yaml: sandbox.roles.<role>.provider` (only if mode=self_hosted) | `cloudflare` |
| `{{sandbox.<role>.endpoint}}` | `config.yaml: sandbox.roles.<role>.endpoint` (only if mode=self_hosted) | `https://sbx.lds.a8c.com` |
| `{{webhook.routes.<event>}}` | `config.yaml: webhooks.routes.<event>` (joined with `base_url`) | `https://autopm-lds.example.a8c.com/wh/github/pr.opened` |
| `{{budget.monthly_cap_usd}}` | `config.yaml: budget.monthly_cap_usd` | `800` |
| `{{scheduler.timezone}}` | `config.yaml: scheduler.timezone` | `Europe/Lisbon` |

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

Subject to the platform's 8-stores-per-session limit. Each agent loads
only the subset relevant to its workflow — see per-agent `Memory Stores`
table.

## 10. Orchestration

Defined in `template/orchestration.md`. Key rules:

- **Product is a router, not a sole executive.** Most work happens in
  single-specialist sessions. Multi-agent sessions are reserved for
  cross-cutting work (planning, retros, multi-feature delivery).
- **One session = one task.** Failures isolate, cost is predictable,
  sessions get archived when done.
- **1-level multi-agent only** (platform limit). Product can spawn
  specialists but specialists can't spawn sub-coordinators.
- **Rubric-grade every customer-facing output.** Outcomes feature
  enforces quality gate before anything reaches a human or the public.
- **Critical writes are always-ask.** Production DB writes, customer
  emails, money movement, public posts, `merge_pr` — all gated.
- **Escalate to human** when budget would be exceeded, decision
  contradicts canon, customer issue is too sensitive, or low confidence.

## 11. Triggers

Defined in `template/triggers.md`. Event taxonomy:

| Event | Source | Lands on |
|---|---|---|
| `pr.opened` | GitHub webhook | Quality |
| `pr.review_requested_human` | GitHub | Product |
| `linear.issue_assigned_to_code` | Linear | Code |
| `support.ticket_received` | helpdesk | Support |
| `interview.transcript_uploaded` | manual / Granola-style | Research |
| `cron.daily.0900` | scheduler | Project |
| `cron.weekly.monday.1000` | scheduler | Product |
| `cron.daily.0300` | scheduler | Finance |
| `cron.daily.0500` | scheduler | Project (in "librarian" mode — curates memory: promotes scratchpads → canon, archives stale notes) |
| `manual.<role>` | CLI | named role |
| `budget.alarm` | Finance internal | Product |

Each event documents payload shape, brief construction, retry policy,
and which agent receives it.

## 12. Instance schema

`instances/<x>/config.yaml`:

```yaml
project:
  name: <string>                # required
  slug: <kebab>                 # required
  repo: <git URL>               # required
  domain: <URL>                 # required
  description: <multi-line>     # required

models:
  product: <claude model ID>    # default: agent.md model_default
  code: …
  quality: …
  design: …
  marketing: …
  support: …
  research: …
  project: …
  finance: …

vault:
  github: op://…                # required
  linear: op://…                # required
  helpdesk: op://…              # optional, required if Support deployed
  anthropic: op://…             # required

mcp:
  github: { url: <URL> }
  linear: { url: <URL> }
  # tunnel_id: <string>         # optional; MCP Tunnels (research preview) for private MCPs
  # …additional MCP servers as needed

sandbox:
  default: managed              # managed | self_hosted (team-wide fallback)
  roles:                        # per-role override; omitted role inherits `default`
    code:
      mode: self_hosted         # recommended for tool-heavy roles
      provider: cloudflare      # cloudflare | daytona | modal | vercel | self
      endpoint: <URL>           # provider/self endpoint, if applicable
    quality:
      mode: self_hosted
      provider: cloudflare
      endpoint: <URL>
    # all other roles default to `managed`

webhooks:
  base_url: <URL>               # required for live runtime
  routes:
    pr_opened: /wh/github/pr.opened
    ticket_received: /wh/helpdesk/ticket
    # …

budget:
  monthly_cap_usd: <int>
  alarm_threshold_pct: <int>    # default 75

scheduler:
  timezone: <IANA TZ>           # e.g. "Europe/Lisbon"
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
4. Emits `instances/<instance>/.rendered/` (gitignored):
   - `agents/<Role>.json` — ready-to-POST agent definitions.
   - `memory/<store>.txt` — final memory content.
   - `skills/<id>/…` — custom Anthropic Skill bundles.
   - `manifest.json` — provisioning checklist (vault entries, MCP
     registrations, …).
5. Exit non-zero on any validation failure with a clear pointer to the
   offending file + line.

### `autopm deploy <instance> [--dry-run]`

Provisions in dependency order. Idempotent.

1. Re-runs render if `.rendered/` is stale.
2. Provisions: vault credentials → MCP servers (incl. tunnel binding if
   `tunnel_id` set) → sandbox config per role → custom skills → memory
   stores → agents (Product last, since its multi-agent roster references
   the others). Each agent is created with its resolved `sandbox` mode;
   `self_hosted` roles get the provider/endpoint wired in at create time.
3. `--dry-run` prints the plan without making API calls.
4. Writes `instances/<instance>/.deployed.json` — IDs of every created
   resource (agent IDs, memory store IDs, skill IDs, vault refs).
5. Re-running `deploy` on an already-deployed instance updates
   in place. Memory stores are NOT overwritten — separate
   `autopm seed-memory --force` for that.

### `autopm run <instance>`

Live dispatcher.

1. Starts Hono on `config.yaml: webhooks.base_url`'s port.
2. Loads `.deployed.json` for agent IDs.
3. Registers handlers for every route in `config.yaml: webhooks.routes`.
4. Cron triggers default to **external scheduler** (e.g., Atomic cron,
   Cloudflare cron, plain crontab) hitting the webhook URL. Internal
   timer registration is supported but off by default.
5. For each event: build a brief, create a session, monitor, write
   outcome to `decisions-log` and the relevant working memory.
6. Heartbeat JSONL at `.runtime/heartbeat.jsonl` (mirrors brain pipeline
   pattern; readable by external monitors).
7. Graceful shutdown: stop accepting new events; let in-flight sessions
   complete or hand to continuation log.

## 14. Out of scope (this repo, this spec)

- **Anthropic-side billing setup, account provisioning, beta access**.
  AutoPM assumes the Anthropic project exists, credentials are in
  1Password, beta is enabled.
- **Choice of cron scheduler** (Atomic / Vercel cron / crontab). The
  runtime accepts external HTTP triggers; pick the scheduler when you
  pick the deploy target.
- **Self-hosted sandbox provider selection** (Atomic / Cloudflare /
  Daytona / Modal / Vercel) and standing up the actual sandbox image.
  The *capability* is in scope (config + render + deploy plumbing
  defaults to `managed` and supports `self_hosted`); choosing and
  building the provider is deferred. See §6A and §17.
- **MCP Tunnels enrollment.** Research preview, request-access. The
  `tunnel_id` config field is reserved; actually obtaining access and
  binding a private MCP is deferred.
- **Observability stack** beyond the heartbeat JSONL. Hook in Datadog /
  whatever Automattic uses, later.
- **Actual LeanDomainSearch product knowledge** (KPIs, audience,
  memory bootstrap content, system-prompt overrides).
- **Migration of an existing PM workflow** (Linear backlog, current
  on-call rotation, etc.) into AutoPM. Separate effort once Product
  agent is live.

## 15. Git wiring

**Phase A — today** (no GHE repo yet):

1. `git init` inside `~/brain/projects/AutoPM/`.
2. Add `projects/AutoPM` to `~/brain/.gitignore` so the brain's
   `git-sync.sh` (`*/2 * * * *`) doesn't grab AutoPM internals as
   untracked files.
3. Build out structure; commit locally in AutoPM only.

**Phase B — once Automattic GHE repo exists**:

1. Set AutoPM remote to `git@github.a8c.com:<org>/<repo>.git`
   (SSH per `~/.claude/CLAUDE.md`).
2. Push.
3. In brain: remove `projects/AutoPM` from `~/brain/.gitignore`;
   `git submodule add` with the SSH URL; commit `.gitmodules` +
   submodule pointer.
4. Going forward, brain tracks AutoPM's commit pointer; AutoPM tracks
   its own history independently.

**Remote URL** is a placeholder until you confirm the GHE org/repo
name. Suggested: `Automattic/AutoPM`.

## 16. Acceptance criteria for the initial scaffold

The implementation plan (produced separately) is "done" when:

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
8. `~/brain/.gitignore` updated; `~/brain/projects/AutoPM/` initialized
   as its own git repo.
9. Sandbox config (`sandbox.default` + per-role `sandbox.roles.<role>`)
   exists in `config.yaml`, defaults to `managed`, and is plumbed through
   render → deploy (rendered agent JSON carries the resolved sandbox
   mode). `mcp.<name>.tunnel_id` is an accepted optional field.

What is NOT in the acceptance criteria:

- Real LeanDomainSearch content (KPIs, audience, memory bootstrap).
- Actual Anthropic API calls succeeding (we never POST during scaffold;
  that's Phase 1 of the build plan, not this scaffold).
- Hono server actually receiving real webhooks.
- Tests of any depth.

## 17. Open questions deferred to implementation

These are knowable but were not decided here:

- Exact GHE org/repo for AutoPM. Suggested `Automattic/AutoPM`; awaiting
  your confirmation.
- ~~Deploy target for the dispatcher.~~ **Decided 2026-05-21**: v1 on
  the Mac Studio (sol) under a LaunchAgent + Tailscale; migrate to
  Automattic infra (Atomic) for v2. See §6B.
- Whether `autopm run` is one process or split (e.g., webhook receiver
  + worker). Default: one process; revisit when load shows up.
- Whether memory bootstrap files support templating themselves (so a
  memory file can include `{{project.name}}`). Default: yes — render
  tool substitutes placeholders in memory files too.
- Where the `decisions-log` and runtime DB persist (Postgres? SQLite?
  Anthropic memory store?). Default: SQLite for scaffold; revisit
  before live deploy.
- Self-hosted sandbox provider for Code/Quality (Atomic / Cloudflare /
  Daytona / Modal / Vercel) and what the sandbox image contains. Default
  for scaffold: all roles `managed`. Decide alongside the deploy target.
- Whether to enroll in MCP Tunnels (research preview) and which
  LDS-internal services warrant a private MCP behind a tunnel.

## 18. Reference

- Research: `~/brain/research/ManagedAgents/`
- Project README: `~/brain/projects/AutoPM/README.md`
- Anthropic beta header: `managed-agents-2026-04-01`
- Managed Agents updates, 2026-05-19 (self-hosted sandboxes public beta;
  MCP Tunnels research preview):
  https://claude.com/blog/claude-managed-agents-updates
- Reference architecture cited but NOT adopted:
  [vercel-labs/claude-managed-agents-starter](https://github.com/vercel-labs/claude-managed-agents-starter)
  (we built our own; their pattern is a useful comparison).
