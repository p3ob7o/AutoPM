---
title: Placeholder Vocabulary
type: doc
created: 2026-05-21
updated: 2026-07-07
---

# Placeholder vocabulary

These are the only tokens the render engine resolves. Any `{{token}}` not
listed here makes `autopm render` fail with `unknown placeholder: <token>`.
The authoritative resolver is [`src/render/placeholders.ts`](../src/render/placeholders.ts);
**keep this doc in sync with it** (and with spec §8).

Tokens are resolved per-agent: role-relative tokens (`{{model}}`,
`{{sandbox_mode}}`) resolve relative to the agent whose `agent.md` is being
rendered. Memory bootstrap files (`instances/<x>/memory/*.md`) are resolved in
the Product role's context.

| Token | Source | Example |
|---|---|---|
| `{{role}}` | agent frontmatter `role` (display name) | `Product` |
| `{{model}}` | `config.models[thisRole]` ?? agent `model_default` | `claude-opus-4-8` |
| `{{sandbox_mode}}` | type of the environment this role is assigned to (`environments.roles[thisRole]` → definition `type`) | `cloud` |
| `{{project.name}}` | `config.project.name` | `LeanDomainSearch` |
| `{{project.slug}}` | `config.project.slug` | `leandomainsearch` |
| `{{project.repo}}` | `config.project.repo` | `git@github.com:acme/leandomainsearch.git` |
| `{{project.domain}}` | `config.project.domain` | `https://leandomainsearch.com` |
| `{{project.description}}` | `config.project.description` | `Domain search tool.` |
| `{{project.canon_path}}` | static | `/mnt/memory/product-canon` |
| `{{vault.<name>}}` | `config.vault[name]` | `env:GITHUB_TOKEN` |
| `{{mcp.<name>.url}}` | `config.mcp[name].url` | `https://api.githubcopilot.com/mcp/` |
| `{{webhook.<event>}}` | `config.webhooks.base_url` + `config.webhooks.routes[event]` (third-party events only, §11) | `https://autopm-lds.example.com/wh/github/pr.opened` |
| `{{budget.monthly_cap_usd}}` | `config.budget.monthly_cap_usd` | `800` |
| `{{scheduler.timezone}}` | `config.scheduler.timezone` — feeds every scheduled deployment's IANA timezone | `Europe/Lisbon` |

## Notes

- **Dropped from the May vocabulary** (2026-07-05 platform re-verification):
  `{{sandbox_provider}}` and `{{sandbox_endpoint}}` (no such platform fields —
  sandbox choice is a property of the *environment*, §6A), and
  `{{mcp.<name>.tunnel_id}}` (no such config field — a tunneled MCP server is
  addressed as an ordinary `url`, §6A). Referencing any of them now fails
  render.
- `{{sandbox_mode}}` resolves via the role→environment mapping
  (`environments.roles[thisRole]`, falling back to `default`) to the assigned
  environment's `type`: `cloud` or `self_hosted`. Agent prose rarely needs it
  (§7).
- `{{vault.<name>}}`, `{{mcp.<name>.url}}`, and `{{webhook.<event>}}` fail
  render if the named entry is absent from `config.yaml`. This is intentional —
  a missing credential or route should stop a deploy, not silently render
  blank. Vault entries are secret *references* only, in the form
  `env:VAR_NAME`; values live in the operator's gitignored `.env` file and are
  resolved from the deploy host's environment at deploy time — they never
  enter the repo or the sandbox.
