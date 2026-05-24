# CLAUDE.md — token-price-index

Project-scoped rules. Inherits from `~/.claude/CLAUDE.md`; rules here add to or sharpen those.

## Stack invariants

- **bun only** — use `bun` and `bunx` for JavaScript tooling. Do not use other package-manager CLIs.
- **TypeScript strict** — `tsconfig.json` has `"strict": true`; do not weaken it
- **No Python, no AWS resources in v0** — see SPEC.md Anti-criteria

## Refresh cadence

The GitHub Actions cron MUST stay daily. Hourly polling burns the public Actions free tier and violates ISC-40. If a faster cadence is ever needed, redesign the trigger before changing the cron expression.

## Schema invariants

Every `PriceRecord` must have:

- `provider` (string, lowercased family ID)
- `model_id` (string, canonical upstream ID)
- `input_per_1k >= 0` (USD)
- `output_per_1k >= 0` (USD)
- `context_window > 0` (tokens)

Verifier (`scripts/Verify.ts`, PR #2) enforces these. Do not bypass it.

## Regional data sources

- AWS Bedrock — Price List Bulk API (`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/region_index.json`). Public no-auth HTTPS.
- Azure OpenAI — Retail Prices API (`prices.azure.com/api/retail/prices`). Public no-auth, paginated.
- **Vertex AI regional pricing is deferred**. No public no-auth source has been identified. Vertex shows LiteLLM US-tagged baseline only in v0. Do not introduce GCP service-account auth to fetch regional Vertex prices — it breaks ISC-21 and ISC-46.

## Worktree discipline

Every feature branch lives under `~/GitHub/projects/token-price-index.worktrees/feat-<name>` per `feedback_worktree_isolation_for_multi_pr_repos.md`. Never build on the main checkout when multi-PR work is in flight.

## Data directory rules

- `data/` IS committed — git history is the time-series database
- `data/_raw/` is gitignored — upstream raw snapshots are not part of the public contract
- `data/current.json` + `data/history/YYYY-MM-DD.json` ARE the public artefacts
