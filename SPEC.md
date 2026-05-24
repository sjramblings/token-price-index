# token-price-index — Specification

## Problem

ISA reference: Problem section.

There is no machine-readable, time-versioned, multi-hyperscaler view of LLM token pricing today. Pricing is scattered across provider pages, aggregator APIs, hyperscaler catalogs, and regional SKU systems, making it hard to compare the same or equivalent models across deployment channels and harder still to track price movement over time.

## Scope

### In scope (v0)

- LiteLLM and OpenRouter ingestion
- AWS Bedrock and Azure OpenAI per-region pricing
- Unified JSON schema for normalized price records
- Daily refresh
- Static GitHub Pages dashboard

### Out of scope

- Provider-authenticated APIs for read operations
- Paid infrastructure or persistent cloud resources
- Hourly or sub-daily refresh cadence
- Private billing-account price sheets
- Write operations against provider systems
- Was Phase 2, now in v0 scope per Steve 2026-05-24: per-region hyperscaler pricing — see Criteria § H. v0 ships per-region for AWS Bedrock + Azure OpenAI. Vertex AI regional stays deferred — no public no-auth source identified.

## Data sources

| Source | URL | Auth | Scope |
|--------|-----|------|-------|
| LiteLLM | `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` | None | ~1500 models, MIT-licensed |
| OpenRouter | `https://openrouter.ai/api/v1/models` | None | ~300 models, live API pricing |
| AWS Price List Bulk API | `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/region_index.json` | None | Bedrock per-region |
| Azure Retail Prices API | `https://prices.azure.com/api/retail/prices` | None | Azure OpenAI per-region |

## Unified schema

```ts
export type PriceRecord = {
  provider: 'anthropic' | 'openai' | 'google' | 'mistral' | 'cohere' | 'meta' | 'aws' | 'azure' | 'gcp' | string;
  model_id: string;
  family: string;
  hyperscaler: 'aws' | 'azure' | 'gcp' | 'direct' | 'aggregator';
  region: string | null;
  input_per_1k: number;
  output_per_1k: number;
  cached_input_per_1k: number | null;
  image_per_1k: number | null;
  context_window: number;
  source: 'litellm' | 'openrouter' | 'aws-pricelist' | 'azure-retail';
  source_url: string;
  fetched_at: string;
};
```

| Field | Meaning |
|-------|---------|
| `provider` | Lowercase provider or publisher family identifier. |
| `model_id` | Canonical upstream model identifier. |
| `family` | Human-grouped model family used for dashboard filtering. |
| `hyperscaler` | Deployment channel: direct provider, aggregator, AWS, Azure, or GCP. |
| `region` | Cloud region when pricing is region-specific; otherwise `null`. |
| `input_per_1k` | USD input-token price per 1,000 tokens. |
| `output_per_1k` | USD output-token price per 1,000 tokens. |
| `cached_input_per_1k` | USD cached-input price per 1,000 tokens when available; otherwise `null`. |
| `image_per_1k` | USD image price per 1,000 image units when available; otherwise `null`. |
| `context_window` | Maximum context window in tokens. |
| `source` | Source system used for the record. |
| `source_url` | Upstream URL used to fetch or derive the record. |
| `fetched_at` | ISO timestamp for the fetch that produced the record. |

## Anti-criteria

- **ISC-13** — Zero references to non-bun JavaScript package CLIs in any committed file
- **ISC-21** — No provider API keys required for any read operation
- **ISC-39** — Zero AWS resources provisioned in v0 (reading AWS Price List Bulk API does not count — it is a public no-auth HTTPS endpoint)
- **ISC-40** — Refresh workflow runs daily exactly, not hourly
- **ISC-46** — AWS Price List + Azure Retail APIs accessed without any authentication
- **ISC-49** — Vertex AI regional pricing NOT included in v0 (no public no-auth source identified)
