# Authorloom Factory Agent Instructions

Date: 2026-06-28

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
- As of 2026-06-28, this checkout is clean on `development` and tracks `origin/development`.
- Current baseline: `6fce4cf` (`Merge pull request #7 from authorloom/hotfix/backmerge-render-limit-to-development`).
- The old `codex/layout-studio-timeline-factory` branch has been merged and deleted. Do not recreate or use it for current launch work. Verify the current hash with `git rev-parse HEAD` before making branch decisions.
- Remote `staging` does not exist yet. Follow the root branching docs before creating it.
