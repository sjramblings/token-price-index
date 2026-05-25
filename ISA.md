---
task: "F6 hyperscaler-pivot view + F7 regional pricing"
project: token-price-index
effort: E3
effort_source: classifier
phase: build
progress: 0/42
mode: interactive
started: 2026-05-25T06:00:00Z
updated: 2026-05-25T06:10:00Z
---

# token-price-index — Project ISA

## Problem

The README and SPEC promise a "multi-hyperscaler view of LLM token pricing" — the same model across direct, Bedrock, Vertex, Azure, and aggregators, comparable side-by-side. PRs #1–#6 shipped ingestion (LiteLLM + OpenRouter), schema, normalization, daily refresh, four dashboard pages, and Pages deploy. What is still missing — and what makes the dataset actually useful to a reader making a deployment decision — is the pivot lens itself (F6) and the regional pricing dimension behind it (F7). Today the dashboard shows 2,517 records spanning five hyperscaler categories, but every AWS/Azure/GCP row is a LiteLLM-tagged baseline with `region: null`, and there is no UI that lets a reader ask "what does claude-3-5-sonnet cost on Bedrock eu-west-1 versus Azure swedencentral versus direct?". The family extractor also mis-parses versioned model IDs (`gpt-4.1` → `family="1"`), so any group-by-family view is currently noisy.

## Vision

A reader opens the dashboard, picks a model, and instantly sees every channel that model is available through, including per-region pricing where regions matter — Bedrock by region, Azure OpenAI by region — with the cheapest channel highlighted and a clickable link out to each source. The dataset behind it is honest: where regional precision exists it is shown; where only a baseline is available it is flagged. Reaching this view feels like a "huh, I didn't know that" — concrete pricing surprises that the flat tables today obscure.

## Out of Scope

- Vertex AI per-region pricing (no public no-auth source identified — ISC-49 deferred)
- Sub-daily refresh cadence — daily cron is a hard rule (CLAUDE.md + ISC-40)
- Any AWS-resident infrastructure (read-only public-HTTPS only — ISC-39, ISC-46)
- Provider-authenticated APIs of any kind (ISC-21)
- Custom domain (`tokenindex.sjramblings.io`) — Steve explicitly dropped this; default `*.github.io` URL is fine
- Hyperscaler-pivot historical timeline view — Timeline page already covers per-model time-series; pivot is current-state only in v0
- Reviewer / auth on the dashboard — public read-only artefact

## Principles

- **Public-no-auth or it doesn't exist.** If a data source needs auth, we don't ingest it — even if quality is better.
- **Git history is the database.** Every change is a commit; reproducibility lives in `git diff`.
- **Schema is the contract.** Adding a record kind never breaks `PriceRecord`; we extend, never reshape, the unified shape.
- **The dashboard is a derived view.** The JSON in `data/` is the product; the SPA is one possible reader.

## Constraints

- **bun only** for all JavaScript tooling. No npm/npx anywhere committed.
- **TypeScript strict mode** stays on; no `// @ts-ignore` or `any` to escape friction.
- **No Python in v0** per CLAUDE.md.
- **Daily GitHub Actions cron** — `0 17 * * *` UTC, unchanged.
- **AWS Price List Bulk API** is the only AWS data source — `pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/region_index.json` and per-region children. No SDK calls, no `aws sts` auth.
- **Azure Retail Prices API** is the only Azure data source — `prices.azure.com/api/retail/prices` with paginated `serviceName eq 'Cognitive Services'` filter. No Azure CLI / service principal.
- **Worktree-isolated feature work** — every multi-PR feature lives at `~/GitHub/projects/token-price-index.worktrees/feat-<name>` per project CLAUDE.md.
- **Public-repo Actions free tier preserved** — refresh stays under the budget (currently ~5 min/day; F7 will add AWS+Azure HTTP calls but must stay under 15 min/day).

## Goal

Ship a coupled F6+F7 increment that adds per-region Bedrock + Azure OpenAI pricing to `data/current.json` (no auth, public endpoints), fixes the family-extractor regression so multi-hyperscaler grouping is meaningful, and adds a `/pivot` SPA page showing the same model across every channel-region pair with the cheapest highlighted and regional-precision disclaimers where the row is a LiteLLM baseline. End-to-end: `bun run scripts/Refresh.ts` produces a current.json with `source` values including `aws-pricelist` and `azure-retail`, and `bun run build` in `dashboard/` produces a dist that renders the `/pivot` page without errors.

## Criteria

### F7 — Regional ingestion

- [ ] ISC-1: `scripts/FetchAwsPriceList.ts` exists and fetches `region_index.json` then per-region Bedrock offer files
- [ ] ISC-2: `scripts/FetchAzureRetail.ts` exists and fetches `prices.azure.com/api/retail/prices` filtered to Azure OpenAI SKUs (paginated)
- [ ] ISC-3: Neither fetcher passes any `Authorization` header, API key, or session token
- [ ] ISC-4: Neither fetcher imports `@aws-sdk/*` or `@azure/*` runtime SDKs
- [ ] ISC-5: AWS raw output lands at `data/_raw/aws-pricelist.json` (gitignored)
- [ ] ISC-6: Azure raw output lands at `data/_raw/azure-retail.json` (gitignored)
- [ ] ISC-7: `scripts/lib/normalize.ts` exports `normalizeAwsPriceList(...)` returning `PriceRecord[]`
- [ ] ISC-8: `scripts/lib/normalize.ts` exports `normalizeAzureRetail(...)` returning `PriceRecord[]`
- [ ] ISC-9: AWS-derived records have `source: "aws-pricelist"`, `hyperscaler: "aws"`, `region: <non-null AWS region id>`
- [ ] ISC-10: Azure-derived records have `source: "azure-retail"`, `hyperscaler: "azure"`, `region: <non-null Azure region name>`
- [ ] ISC-11: `data/current.json` contains ≥10 AWS Bedrock regional records after refresh
- [ ] ISC-12: `data/current.json` contains ≥20 Azure OpenAI regional records after refresh
- [ ] ISC-13: `scripts/Verify.ts` accepts regional records (region: string allowed alongside region: null)
- [ ] ISC-14: `source_url` on each AWS record points at the actual per-region offer JSON (not just region_index)
- [ ] ISC-15: `source_url` on each Azure record points at the Azure Retail Prices API query URL
- [ ] ISC-16: `cached_input_per_1k` populated on AWS records where Bedrock publishes prompt-caching SKU
- [ ] ISC-17: All input_per_1k and output_per_1k values are `>= 0` and finite

### Family normalization

- [ ] ISC-18: `extractFamily` in `scripts/lib/normalize.ts` produces a non-empty family for every model_id in current.json
- [ ] ISC-19: No record in current.json has `family === "1"` (the gpt-4.1 bug)
- [ ] ISC-20: `scripts/lib/normalize.test.ts` exists with ≥12 model-id → family cases
- [ ] ISC-21: Family for `gpt-4.1`, `azure/gpt-4.1`, `openai/gpt-4.1` is byte-identical
- [ ] ISC-22: Family for `claude-3-5-sonnet-20241022`, `bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0`, `openrouter/anthropic/claude-3.5-sonnet` is byte-identical
- [ ] ISC-23: ≥200 families in current.json span more than one hyperscaler (post-fix)

### F6 — Hyperscaler-pivot SPA page

- [ ] ISC-24: `dashboard/src/pages/Pivot.tsx` exists
- [ ] ISC-25: `dashboard/src/App.tsx` has a `/pivot` route mounting `<Pivot />`
- [ ] ISC-26: Main nav surfaces a "Pivot" link
- [ ] ISC-27: Page renders a family-picker filtered to families with `unique(hyperscaler).length > 1`
- [ ] ISC-28: Picker lists ≥50 multi-hyperscaler families
- [ ] ISC-29: Selecting a family renders a table with one row per `(hyperscaler, region)` pair
- [ ] ISC-30: Each row shows `input_per_1k`, `output_per_1k`, `context_window`, `source`, clickable `source_url`
- [ ] ISC-31: Row with lowest `input_per_1k` is visually highlighted
- [ ] ISC-32: Disclaimer banner present when any visible row has `region: null` (LiteLLM baseline)
- [ ] ISC-33: `bun run build` in `dashboard/` succeeds with exit code 0
- [ ] ISC-34: Built dist loads without JS console errors at `/pivot`

### Operational

- [ ] ISC-35: `bun run scripts/Refresh.ts` succeeds end-to-end (LiteLLM + OpenRouter + AWS + Azure)
- [ ] ISC-36: `bun x tsc --noEmit` passes at repo root
- [ ] ISC-37: `bun x tsc --noEmit` passes inside `dashboard/`
- [ ] ISC-38: GitHub Actions daily-refresh workflow yaml unchanged or strictly additive (no cron change)

### Anti-criteria

- [ ] ISC-39: Anti: No `aws sts get-caller-identity` / `aws configure` / SSO calls in any committed script
- [ ] ISC-40: Anti: No Azure CLI auth / `az login` / service-principal credential in any committed script
- [ ] ISC-41: Anti: No GCP service-account JSON / Vertex AI regional pricing introduced (ISC-49 stays deferred)
- [ ] ISC-42: Anti: GitHub Actions cron schedule is still `0 17 * * *` after this work lands

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1 | file | path exists | 1 file | `ls scripts/FetchAwsPriceList.ts` |
| ISC-2 | file | path exists | 1 file | `ls scripts/FetchAzureRetail.ts` |
| ISC-3 | grep | no Authorization/api-key/x-api-key in fetcher files | 0 matches | `grep -Eri "authorization\|api-?key\|x-api-key" scripts/Fetch{Aws,Azure}*.ts` |
| ISC-4 | grep | no SDK imports | 0 matches | `grep -E "from ['\"]@(aws-sdk\|azure)/" scripts/Fetch*.ts` |
| ISC-7 | grep | export name present | 1 match | `grep -n "export function normalizeAwsPriceList" scripts/lib/normalize.ts` |
| ISC-8 | grep | export name present | 1 match | `grep -n "export function normalizeAzureRetail" scripts/lib/normalize.ts` |
| ISC-9 | jq | aws records present | ≥10 | `bunx jq '[.[] \| select(.source=="aws-pricelist")] \| length' data/current.json` |
| ISC-10 | jq | azure records present | ≥20 | `bunx jq '[.[] \| select(.source=="azure-retail")] \| length' data/current.json` |
| ISC-11 | jq | aws hyperscaler tag | matches count above | `bunx jq '[.[] \| select(.hyperscaler=="aws" and .region != null)] \| length' data/current.json` |
| ISC-19 | jq | bad family absent | 0 | `bunx jq '[.[] \| select(.family=="1")] \| length' data/current.json` |
| ISC-20 | test | unit test runs | exit 0 | `bun test scripts/lib/normalize.test.ts` |
| ISC-23 | jq | multi-hyperscaler families | ≥200 | `bunx jq '[group_by(.family)[] \| select((map(.hyperscaler) \| unique \| length) > 1)] \| length' data/current.json` |
| ISC-24 | file | path exists | 1 file | `ls dashboard/src/pages/Pivot.tsx` |
| ISC-25 | grep | route registered | 1 match | `grep -n 'path="/pivot"' dashboard/src/App.tsx` |
| ISC-33 | build | dashboard build | exit 0 | `cd dashboard && bun run build` |
| ISC-34 | browser | Interceptor screenshot of /pivot | 0 console errors | `Skill("Interceptor")` on built dist |
| ISC-36 | tsc | repo typecheck | exit 0 | `bunx tsc --noEmit` |
| ISC-37 | tsc | dashboard typecheck | exit 0 | `cd dashboard && bunx tsc --noEmit` |
| ISC-38 | diff | cron unchanged | identical line | `grep -n "cron:" .github/workflows/daily-refresh.yml` |
| ISC-39 | grep | anti AWS SDK auth | 0 matches | `grep -Ern "aws (sts\|configure)\|aws sso" scripts/` |
| ISC-40 | grep | anti Azure auth | 0 matches | `grep -Ern "az login\|service.principal\|client_secret" scripts/` |
| ISC-41 | grep | anti GCP | 0 matches | `grep -Ern "google-auth\|service.account.json\|vertex" scripts/Fetch*.ts` |
| ISC-42 | diff | cron line preserved | byte-identical | `git diff main -- .github/workflows/daily-refresh.yml` |

## Features

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| family-normalize-fix | Rewrite `extractFamily` to handle versioned IDs; add unit test | ISC-18, ISC-19, ISC-20, ISC-21, ISC-22, ISC-23 | — | no — landing first |
| aws-fetcher | `FetchAwsPriceList.ts` walking region_index → per-region offer JSON, no auth | ISC-1, ISC-3, ISC-4, ISC-5, ISC-14, ISC-39 | family-normalize-fix | yes (parallel with azure-fetcher) |
| azure-fetcher | `FetchAzureRetail.ts` paginating Azure Retail filtered to Azure OpenAI | ISC-2, ISC-3, ISC-4, ISC-6, ISC-15, ISC-40 | family-normalize-fix | yes (parallel with aws-fetcher) |
| normalize-regional | `normalizeAwsPriceList` + `normalizeAzureRetail` exports → PriceRecord[] | ISC-7, ISC-8, ISC-9, ISC-10, ISC-13, ISC-16, ISC-17 | aws-fetcher, azure-fetcher | no |
| refresh-wiring | Wire new fetchers into `scripts/Refresh.ts` + verify counts | ISC-11, ISC-12, ISC-35 | normalize-regional | no |
| pivot-page | `Pivot.tsx` + App.tsx route + nav link + disclaimer | ISC-24..ISC-34 | refresh-wiring (so live data is present) | no — landing last |
| typecheck-gates | `tsc` clean across repo + dashboard | ISC-36, ISC-37 | all above | no — landing last |

## Decisions

- 2026-05-25T06:00:00Z — Scoped F6 + F7 as one branch, sequential commits (F7 first, F6 last). Steve said "really need to go together"; rationale = pivot view is hollow without regional data, but reviewers can still split the eventual PR if desired.
- 2026-05-25T06:00:00Z — Worktree branch `feat-pivot-regional` per project CLAUDE.md worktree rule.
- 2026-05-25T06:00:00Z — CNAME / custom domain dropped from scope per Steve verbatim 2026-05-25.
- 2026-05-25T06:00:00Z — Family-normalize fix carried inside this increment because F6 grouping depends on it; not split into a separate PR.

## Changelog

(populated at LEARN)

## Verification

(populated at VERIFY)
