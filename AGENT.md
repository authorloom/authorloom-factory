# Authorloom Factory Agent Instructions

Last updated: 2026-07-17

Repository: `authorloom/authorloom-factory`

This service renders Authorloom videos and related media outputs. It is production-critical. Small mistakes here can stall queues, produce wrong videos, or break user campaigns.

## Required First Checks

Before editing:

```bash
git status --short --branch
git remote -v
git rev-parse --abbrev-ref HEAD
```

Confirm you are in:

```text
/Users/kayneauthorloom/localsites/authorloom/factory
```

Read parent instructions:

```text
/Users/kayneauthorloom/localsites/authorloom/AGENT.md
```

## Branching

- Normal work starts from `development`.
- Production hotfixes start from `main`.
- After production hotfixes land, reconcile them back to `development`.
- Cloud agents must open PRs and must not merge them.

## Cloud Task Header

```text
Repository: authorloom/authorloom-factory
Base branch: development
PR target: development

Hard requirements:
- Do not use any Valearion or More Rewards repository.
- Do not use main unless this ticket explicitly says production hotfix.
- Create a new branch.
- Keep the diff limited to this ticket.
- Open a PR.
- Do not merge.
```

Production hotfix header:

```text
Repository: authorloom/authorloom-factory
Base branch: main
PR target: main

Hard requirements:
- Production hotfix only.
- Keep the diff minimal.
- Do not change secrets or Cloud Run config unless explicitly scoped.
- Open a PR.
- Do not merge.
```

## Validation

Run:

```bash
pnpm typecheck
pnpm test
git diff --check
```

For FFmpeg/Layout Studio changes, also run focused tests such as:

```bash
pnpm exec tsx --test src/lib/__tests__/layout-studio-scene-anchors.test.ts
```

Add or update tests for graph timing, media source selection, and output duration whenever relevant.

## Production Safety

- Do not deploy production unless explicitly asked.
- Production factory images must be built only from current `origin/main` or a hotfix branch based on current `origin/main`.
- Before every production image build or deploy, run:

```bash
pnpm deploy:assert-production-base
```

- If that command reports any commits in `HEAD..origin/main`, stop. Rebase or cherry-pick the hotfix onto current `origin/main` first.
- Never deploy from archived, local-only, stale, or deleted-remote hotfix branches.
- Confirm Google Cloud project, region, service, image tag, and environment before deploying.
- After deploying Cloud Run, verify the latest ready revision is serving 100% traffic and that the service image tag/digest matches the image you just built.
- Do not alter or rotate secrets casually.
- Do not remove required environment variables.
- If the factory call contract changes, coordinate the Convex/web release order.
- Existing active Cloud Run jobs will not heal from code changes; stuck jobs may need cancellation/retry.

## FFmpeg Rules

Layout Studio metadata is source of truth:

- composition duration
- clip start/end/duration
- layer order
- element position/size/style
- anchoring
- media type

Do not hard-code video duration.

Still-image and text overlay inputs must be finite in the filter graph. Avoid sparse timestamp-shifted streams that can wedge FFmpeg framesync. Use explicit finite branches and `eof_action=pass:repeatlast=0` where appropriate so expired overlays disappear.

PNG support matters. Do not flatten screenshots into a larger wrapper canvas that changes visual dimensions. If conversion is required, preserve the source image dimensions and placement contract.

Background video source selection matters:

- still images may need raw/source files for transparency or accurate dimensions,
- video backgrounds should generally prefer optimized render sources where available,
- preserve legacy fallbacks.

## Queue and Job Rules

- Diagnose worker failures before blaming the queue.
- Queue backups are often symptoms of FFmpeg timeouts, payload mismatches, missing bucket config, or bad media source selection.
- Claim/idempotency changes must protect against stale Cloud Tasks claiming fresh rerun jobs.
- Add logging that identifies job IDs, layout IDs, media sources, graph duration, input count, and FFmpeg progress without leaking secrets.

## Media Pipeline Interaction

The factory consumes media produced or described by the web app/media pipeline. It must tolerate:

- legacy media URLs,
- CDN `/api/media` delivery,
- optimized render sources,
- original uploads,
- stock imports,
- Google Drive imports,
- rendered post outputs.

Do not assume every asset has every derivative until the migration/backfill is complete.

## Common Paths

```text
src/lib/ffmpeg.ts                         FFmpeg graph construction
src/lib/media-source-policy.ts            source/render-source policy
src/lib/worker-media-download.ts          worker media download handling
scripts/authorloom-production-worker.ts   production worker entrypoint
docs/deploy/                              deployment notes
```
