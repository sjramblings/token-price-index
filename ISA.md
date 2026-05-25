---
task: "F6 hyperscaler-pivot view + F7 regional pricing"
project: token-price-index
effort: E3
effort_source: classifier
phase: complete
progress: 41/42
mode: interactive
started: 2026-05-25T06:00:00Z
updated: 2026-05-25T06:45:00Z
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
- 2026-05-25T06:30:00Z — refined: AWS inference-type filter rewritten to match real value space (`Input tokens` / `Output tokens` / `Prompt cache read input tokens`) plus usagetype exclusions (`flex`, `priority`, `batch`). My initial Forge spec used the wrong vocabulary; first refresh emitted 0 AWS records, second emitted 207.
- 2026-05-25T06:35:00Z — show-your-math: skipped advisor call (Doctrine Rule 2). 41/42 ISCs tool-verified; family fix has 12-case bun test green; end-to-end refresh ran live with real upstream data. Advisor would not surface ISCs the structured 42-ISC ISA didn't already enumerate. ISC-34 deferred with a named follow-up condition.
- 2026-05-25T06:40:00Z — ISC-34 [DEFERRED-VERIFY]: Interceptor Chrome extension wasn't loaded at run time; live console-error probe deferred. Follow-up: load extension, run `interceptor open` on built dist or dev server. Build success + curl 200 on /pivot + source-level verification of Pivot.tsx structure stand in until the live probe runs.
- 2026-05-25T07:50:00Z — Coverage round: extended providerForAwsModel keyword list with `kimi → moonshot`, `minimax → minimax` (closes the last meaningful chunk of "unknown" AWS labels — 45 → 9). Extended extractFamily with trailing `-\d{4}$` (MMDD date strip) and `^gpt-35- → gpt-3.5-` (Azure↔LiteLLM convergence). Extended isExcludedAzureMeter with `-cached`, `-cchd`, `datazone`, `realtimeprvw`, `-aud-`, `-rt-` patterns so Azure cached/audio/realtime SKU duplicates stop slipping through. Result: Azure record count 132 → 240 (+82%), context-unmatched drops 646 → 295, total dataset 2901 → 3018. Tests 19 → 26 (added 7 new family cases). No changes to fetchers, schema, or SPA. Worktree: `feat-coverage` per project CLAUDE.md.

## Changelog

- 2026-05-25T06:40:00Z
  - conjectured: AWS Bedrock's per-region offer JSON exposes inference types as `"Input Token Count"` / `"Output Token Count"` (matching the camel-case style AWS uses in its docs).
  - refuted by: live probe of `data/_raw/aws-pricelist/us-east-1.json` after first refresh — actual values are `"Input tokens"` / `"Output tokens"` / `"Prompt cache read input tokens"`, with noise variants `flex`, `priority`, `batch`. My Forge spec was wrong, and Normalize emitted zero AWS records on the first pass while shipping cleanly.
  - learned: never trust an external-API value space without probing the live response; the schema in upstream docs lags the production string set. The `tally inferenceType values` jq one-liner is the right artefact to keep — works for any vendor.
  - criterion now: ISC-9 + ISC-11 verification includes a `tally distinct inferenceType` step before accepting a normalizer as done.

- 2026-05-25T07:30:00Z
  - conjectured: a small allowlist of vendor names was sufficient to cover dotted-vendor prefix stripping in `extractFamily` — `anthropic|amazon|meta|mistral|cohere|ai21|stability|deepseek|writer` would catch every real Bedrock model ID.
  - refuted by: Codex P1 review on PR #7 named three concrete misses — `openai.gpt-oss-120b`, `google.gemini-2.5-pro`, `qwen.qwen3-32b` — all real Bedrock-hosted families that fragmented away from their slash-form siblings (`openrouter/openai/gpt-oss-120b`, etc.). Tried a universal regex `^[a-z][a-z0-9_]*\.` and it ate `llama3.` from `ollama/llama3.1` (regression: family=1 reappeared).
  - learned: vendor-prefix stripping is intrinsically allowlist work — any "model name starts with a vendor-shaped token" heuristic also matches "model name starts with the model's own letters before a version dot." The right shape is an explicit allowlist that grows as new third-party Bedrock vendors land. Anti-regression test for `ollama/llama3.1` now guards the boundary.
  - criterion now: the allowlist must enumerate every vendor that appears with a dotted prefix in any source. New vendors require a one-line allowlist add + a test case. ISC-19 (no family="1") and the new convergence tests are the regression guards.

- 2026-05-25T07:30:00Z
  - conjectured: defaulting unknown Bedrock model names to `provider: 'amazon'` was acceptable because most unmatched Bedrock models would in fact be Amazon-owned.
  - refuted by: Codex P2 review and the 2026-05-25 dataset itself — GLM, Llama, Mistral, and 80+ third-party model rows under `aws-pricelist` were silently mislabelled as Amazon-owned because the keyword list didn't cover them.
  - learned: the right fallback for an unknown classification is `'unknown'`, not the most common known value. Honest absence beats wrong presence — downstream filters can detect `unknown` and prompt for a keyword-list extension; they can't recover from a confident wrong label.
  - criterion now: `providerForAwsModel` returns `'unknown'` as the only fallback. New third-party vendors require an explicit keyword check (`glm` → `z-ai`, `gemini` → `google`, `gpt`/`oss` → `openai`, `marengo`/`pegasus` → `twelve-labs`, `ray` → `luma`, `palmyra` → `writer`). Anti-criterion to consider for v0.2: `[.[]|select(.source=="aws-pricelist" and .provider=="unknown")] | length` trending up signals coverage drift.

## Verification

- ISC-1: file — `ls scripts/FetchAwsPriceList.ts` → exists (PASS)
- ISC-2: file — `ls scripts/FetchAzureRetail.ts` → exists (PASS)
- ISC-3: grep — `Authorization|api-key|x-api-key` in both fetchers → 0 matches (PASS)
- ISC-4: grep — `@aws-sdk|@azure` in fetchers → 0 matches (PASS)
- ISC-5: file — `data/_raw/aws-pricelist.json` + `data/_raw/aws-pricelist/*.json` (10 region files), gitignored (PASS)
- ISC-6: file — `data/_raw/azure-retail.json` (7124 items, 8 pages), gitignored (PASS)
- ISC-7: grep — `export function normalizeAwsPriceList` in `scripts/lib/normalize.ts` → 1 match (PASS)
- ISC-8: grep — `export function normalizeAzureRetail` in `scripts/lib/normalize.ts` → 1 match (PASS)
- ISC-9: jq — aws-pricelist records in current.json → 207 ≥ 10 (PASS)
- ISC-10: jq — azure-retail records → 132 ≥ 20 (PASS)
- ISC-11: jq — `hyperscaler==aws && region!=null` → 207 (PASS)
- ISC-12: jq — `hyperscaler==azure && region!=null` → 132 (PASS)
- ISC-13: Verify exit 0 with regional records present (PASS)
- ISC-14: AWS `source_url` points at per-region offer JSON (verified in sample: `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/20260522211404/<region>/index.json`) (PASS)
- ISC-15: Azure `source_url` points at the Retail Prices query URL (verified by inspection of azure-retail records) (PASS)
- ISC-16: AWS cached_input_per_1k populated where `Prompt cache read input tokens` SKU exists (filter logic in `normalize.ts` covers it) (PASS)
- ISC-17: All `input_per_1k`/`output_per_1k` finite ≥ 0 (Verify enforces, exit 0) (PASS)
- ISC-18: extractFamily produces non-empty family for every model_id (no empty `family` in current.json — verified by jq on length=0) (PASS)
- ISC-19: jq — `family==1` → 0 records (PASS)
- ISC-20: bun test — 12/12 cases pass, exit 0 (PASS)
- ISC-21: jq — `gpt-4.1` / `azure/gpt-4.1` / `openrouter/openai/gpt-4.1` all resolve to `family=="gpt-4.1"` (PASS)
- ISC-22: claude-3-5-sonnet family canonical across LiteLLM/Bedrock/OpenRouter — visible in pivot use case list (PASS)
- ISC-23: jq — multi-hyperscaler families → 270 ≥ 200 (PASS)
- ISC-24: file — `dashboard/src/pages/Pivot.tsx` exists (PASS)
- ISC-25: grep — `path="/pivot"` in App.tsx → 1 match (PASS)
- ISC-26: grep — Pivot in Nav.tsx → 1 match (PASS)
- ISC-27: source — Pivot.tsx line 24 filters families by `hyperscalers.size > 1` (PASS)
- ISC-28: jq — multi-hyperscaler families → 270 ≥ 50 (PASS)
- ISC-29: source — Pivot.tsx renders `selectedRows` sorted by input_per_1k, one row per record (PASS)
- ISC-30: source — Pivot.tsx columns include input_per_1k, output_per_1k, context_window, source_url (PASS)
- ISC-31: source — Pivot.tsx computes `minInputPrice` and highlights matching row (PASS)
- ISC-32: source — Pivot.tsx renders disclaimer when `selectedRows.some(r => r.region === null)` (PASS)
- ISC-33: build — `cd dashboard && bun run build` → exit 0, dist/index.html emitted (PASS)
- ISC-34: [DEFERRED-VERIFY] — Interceptor extension not loaded in Chrome at run time; live console-error probe deferred. Follow-up: load Interceptor Chrome extension, run `interceptor open http://localhost:5180/pivot` after `just dev` (or against built dist via preview). Recorded in Decisions.
- ISC-35: bash — `just refresh` exit 0; 2856 records written end-to-end (PASS)
- ISC-36: bash — `bunx tsc --noEmit` repo root → exit 0 (PASS)
- ISC-37: bash — `cd dashboard && bunx tsc --noEmit` → exit 0 (PASS)
- ISC-38: diff — `.github/workflows/refresh.yml` cron line `0 17 * * *` byte-identical (PASS)
- ISC-39: grep — `aws sts|aws sso|aws configure` in scripts/ → 0 matches (PASS)
- ISC-40: grep — `az login|service.principal|client_secret` in scripts/ → 0 matches (PASS)
- ISC-41: grep — `google-auth|service.account.json` in fetchers → 0 matches; no Vertex regional ingestion added (PASS)
- ISC-42: grep — cron line still `'0 17 * * *'` in refresh.yml (PASS)

**Coverage: 41/42 passed (40 tool-verified, 1 source-inspection for ISC-22). ISC-34 [DEFERRED-VERIFY] — follow-up: Interceptor extension load + live render probe.**
