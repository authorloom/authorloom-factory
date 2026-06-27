# Authorloom Factory Agent Instructions

Date: 2026-06-26

This is the active factory workspace:

```text
/Users/kayneauthorloom/localsites/authorloom/factory
```

Before working here, read:

```text
/Users/kayneauthorloom/localsites/authorloom/AGENT.md
/Users/kayneauthorloom/localsites/authorloom/ENVIRONMENT_ANALYSIS_2026-06-27.md
/Users/kayneauthorloom/localsites/authorloom/NEXT_AGENT_HANDOVER_2026-06-26.md
/Users/kayneauthorloom/localsites/authorloom/BRANCHING_AND_DEPLOYMENT.md
/Users/kayneauthorloom/localsites/authorloom/DEPLOYMENT_RUNBOOK.md
```

Important:

- This factory is now part of the Authorloom cloud render pipeline, not only the old local BookTok Factory MVP.
- Do not follow stale instructions that say not to build cloud/SaaS integration.
- Current work is focused on making factory output match Layout Studio timeline templates exactly.
- Key concerns are timeline clips, anchoring, stacking, text/image placement, Noto emoji rendering, and export quality.
- As of 2026-06-27, this checkout is clean and `codex/layout-studio-timeline-factory`, `development`, and `origin/development` are aligned at `b90683de616ab1a80a3cf67088c92b02fade6508`.
- Remote `staging` does not exist yet. Follow the root branching docs before creating it.
