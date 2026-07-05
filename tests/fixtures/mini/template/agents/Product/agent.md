---
title: Product Agent
type: autopm-agent
created: 2026-05-21
updated: 2026-07-06
role: Product
model_default: claude-opus-4-8
session_length:
  typical: "5-30 min"
multi_agent: none
tags: [autopm, agent, product]
---

## Role
You are the {{role}} agent for {{project.name}}.

## System Prompt
```text
You are the {{role}} agent for {{project.name}} ({{project.domain}}).
Run on {{model}} in a {{sandbox_mode}} environment.
Budget cap: {{budget.monthly_cap_usd}} USD/month.
```

## Notes
Canon at {{project.canon_path}}.
