# token-price-index — Roadmap

> The shipped substrate (PR #1–#10) is a *catalog* — 3,000+ normalized price records across LiteLLM, OpenRouter, AWS Bedrock per-region, and Azure OpenAI per-region. The next phase makes the catalog the *foundation for index products*.

## Reframing — catalog vs. index

`tokenpriceindex.com` (ATPI) is not a competing catalog. It is the **S&P 500 of LLM inference**: a single number, $2.08/M tokens at the time of writing, computed as the geometric mean of `input × 0.7 + output × 0.3` across 16 hand-curated frontier members. Their value is editorial curation plus a number tracked over time.

Our value is the substrate underneath: comprehensive normalization, multi-hyperscaler coverage, regional precision, MIT-licensed open data, git-history-as-database. We are complementary, not competitive — and the killer move is to expose our dataset as the canonical substrate from which their kind of index, and many more like it, can be reproducibly computed.

## The index family — five phases

### Phase 0 — Replicate ATPI on our data (PR #11) — ✅ SHIPPED

Prove the substrate is correct by computing ATPI's $2.08 from `data/current.json`. Ship:

- `indices/members/atpi-replica.json` — 16 ATPI members + 70/30 blend + published value for divergence checking
- `scripts/lib/index-compute.ts` — pure functions: resolve member → record, compute blended, geometric mean
- `scripts/lib/index-compute.test.ts` — 10 unit tests; the worked-example test reproduces ATPI's $2.08 from their published blended values
- `scripts/ComputeIndex.ts` — CLI runner, reads members config + data/current.json, writes `data/indices/{name}.json`
- `just index atpi-replica` recipe

**Actual result** (data refresh 2026-05-25): all 16 members resolved, 9 byte-exact on per-member blended price, 12 within 5% per-member, headline geometric mean = **$1.74** vs ATPI's published **$2.08** = **-16.5% index-level divergence**. Honest by construction — the divergence is driven by four members where ATPI's stated price doesn't match the cleanest direct/aggregator source in our catalog (Gemini 3.5 Flash, GLM 5.1, Qwen 3.6 Plus, DeepSeek V4 Flash), and each divergence is documented in the spec with a `note:` field. The math itself is provably correct: the worked-example unit test reproduces $2.08 byte-for-byte when given ATPI's own published blended values.

This is the value proposition in one number: **when we agree on the model, we agree on the price** (9 byte-exact members). When we disagree, the divergence is traceable to a specific source/model_id mismatch — and we report it transparently instead of curating it away.

### Phase 1 — Publish the index family (PR #12–#13)

The same script, three orthogonal dimensions, all reproducible from the same data:

| Dimension | Indices | Why only we can do this |
|-----------|---------|------------------------|
| **Tier** | TPI-Frontier, TPI-Mid, TPI-Fast | Configuration only — anyone could do this if they had the data |
| **Region** | TPI-USEast, TPI-EU, TPI-APAC | Requires per-region pricing — ATPI doesn't have it |
| **Channel** | TPI-Direct, TPI-Bedrock, TPI-Azure, TPI-Aggregator | Requires multi-hyperscaler coverage — ATPI doesn't have it |

Cross product = 3 × 3 × 4 = **36 indices**, each its own JSON file under `data/indices/`, all updated daily, all reproducible.

### Phase 2 — Historical reconstruction (PR #14)

Walk `data/history/YYYY-MM-DD.json`, apply current methodology to each snapshot, emit a time-series for each index. Render on a new `/index` dashboard page as a line chart, with channel + region overlays. We can rebuild what any index would have shown on day X, retroactively — because the data substrate is git-versioned.

### Phase 3 — Open the calculation as a package (PR #15)

Publish `@sjramblings/token-price-index` on npm — pure TypeScript function `computeIndex(records, members, blend)` taking our `PriceRecord[]` shape. Anyone (including ATPI themselves) can install and compute their own index from our data. The README ships the four-line example that reproduces ATPI's $2.08 with their own published members.

### Phase 4 — The feed (PR #16)

Daily index values published as `feeds/indices.atom` + `feeds/indices.json`. Each refresh produces feed entries. Plug into `feed-system-aws` as a curated source: when TPI-Bedrock-APAC moves >2% in a day, the Sunday newsletter digest catches it.

## What this changes about the project

- **Methodology page gets an index section** that names ATPI, links it as the canonical curated index, and offers `@sjramblings/token-price-index` as the substrate package
- **A new `/index` page** becomes the dashboard's most prominent route
- **Catalog stays the foundation** — `Explorer`, `Compare`, `Simulator`, `Timeline`, `Pivot` all keep their roles unchanged

## What we deliberately don't do

- **Hand-curate our own index members.** Anyone can roll their own member set on our data — that's the package value proposition. We may *publish* a default member set for each tier, but the curation isn't where our value lives.
- **Match ATPI's "real-time" rhetoric.** Daily refresh is honest; posted prices don't change sub-daily anyway.
- **Authenticate against any provider** to fill gaps. The no-auth principle stands.
- **Provision AWS infrastructure.** GitHub Pages + Actions remain the only substrate.

## Sequencing

```
PR #11 (P0)  →  PR #12-13 (P1)  →  PR #14 (P2)  →  PR #15 (P3) + PR #16 (P4)
replica         family             history          package + feed
```

Each PR is independently mergeable. P0 is the load-bearing one — it proves our substrate produces the same number ATPI does, which is the validation the rest of the family rides on.
