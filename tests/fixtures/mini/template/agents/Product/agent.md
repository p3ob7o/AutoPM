---
title: Product Agent
type: autopm-agent
created: 2026-05-21
updated: 2026-05-21
role: Product
model_default: claude-opus-4-7
sandbox_default: managed
session_length:
  typical: "5-30 min"
multi_agent: coordinator
tags: [autopm, agent, product]
---

## Role
You are the {{role}} agent for {{project.name}}.

## System Prompt
```text
You are the {{role}} agent for {{project.name}} ({{project.domain}}).
Run on {{model}} in a {{sandbox_mode}} sandbox.
Budget cap: {{budget.monthly_cap_usd}} USD/month.
```

## Notes
Canon at {{project.canon_path}}.
