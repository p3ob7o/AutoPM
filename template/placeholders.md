---
title: Placeholder Vocabulary
type: doc
created: 2026-05-21
updated: 2026-05-21
---

# Placeholder vocabulary

These are the only tokens the render engine resolves. Any `{{token}}` not
listed here makes `autopm render` fail with `unknown placeholder: <token>`.
The authoritative resolver is [`src/render/placeholders.ts`](../src/render/placeholders.ts);
**keep this doc in sync with it.**

Tokens are resolved per-agent: role-relative tokens (`{{model}}`,
`{{sandbox_mode}}`, …) resolve relative to the agent whose `agent.md` is being
rendered. Memory bootstrap files (`instances/<x>/memory/*.md`) are resolved in
the Product role's context.

| Token | Source | Example |
|---|---|---|
| `{{role}}` | agent frontmatter `role` (display name) | `Product` |
| `{{model}}` | `config.models[thisRole]` ?? agent `model_default` | `claude-opus-4-7` |
| `{{sandbox_mode}}` | `config.sandbox.roles[thisRole].mode` ?? `config.sandbox.default` | `managed` |
| `{{sandbox_provider}}` | `config.sandbox.roles[thisRole].provider` ?? "" | `cloudflare` |
| `{{sandbox_endpoint}}` | `config.sandbox.roles[thisRole].endpoint` ?? "" | `https://sbx.example.com` |
| `{{project.name}}` | `config.project.name` | `LeanDomainSearch` |
| `{{project.slug}}` | `config.project.slug` | `leandomainsearch` |
| `{{project.repo}}` | `config.project.repo` | `git@github.a8c.com:Automattic/leandomainsearch.git` |
| `{{project.domain}}` | `config.project.domain` | `https://leandomainsearch.com` |
| `{{project.description}}` | `config.project.description` | `Domain search tool.` |
| `{{project.canon_path}}` | static | `/mnt/memory/product-canon` |
| `{{vault.<name>}}` | `config.vault[name]` | `op://Automattic/AutoPM-LDS/GITHUB_TOKEN` |
| `{{mcp.<name>.url}}` | `config.mcp[name].url` | `https://api.githubcopilot.com/mcp/` |
| `{{mcp.<name>.tunnel_id}}` | `config.mcp[name].tunnel_id` ?? "" (MCP Tunnels, research preview) | `tnl_abc123` |
| `{{webhook.<event>}}` | `config.webhooks.base_url` + `config.webhooks.routes[event]` | `https://hook.example.com/wh/pr.opened` |
| `{{budget.monthly_cap_usd}}` | `config.budget.monthly_cap_usd` | `800` |
| `{{scheduler.timezone}}` | `config.scheduler.timezone` | `Europe/Lisbon` |

## Notes

- `{{sandbox_provider}}` and `{{sandbox_endpoint}}` resolve to an empty string
  when the role runs on a `managed` sandbox (the common case). Only reference
  them in an agent's prose when that agent is expected to run `self_hosted`.
- `{{vault.<name>}}`, `{{mcp.<name>.*}}`, and `{{webhook.<event>}}` fail render
  if the named entry is absent from `config.yaml`. This is intentional — a
  missing credential or route should stop a deploy, not silently render blank.
