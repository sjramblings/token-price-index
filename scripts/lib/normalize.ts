import type {
  AwsPriceListOffer,
  AzureRetailItem,
  Hyperscaler,
  LiteLLMEntry,
  OpenRouterEntry,
  PriceRecord,
} from './types.ts';

type NormalizationResult = {
  records: PriceRecord[];
  skipped: { zeroContext: number; missingPrice: number; excludedTier: number };
};

/**
 * Non-on-demand pricing tiers, excluded from the dataset.
 *
 * The dataset's contract is on-demand list price for one deployment of one
 * model. Batch and fine-tuned SKUs are a different billing tier for the same
 * model — OpenRouter's `anthropic/claude-opus-5:batch` is exactly 50% of
 * `anthropic/claude-opus-5`, and LiteLLM's `ft:gpt-4o-…` is fine-tune
 * inference. Both were already excluded on the AWS side
 * (`usagetype` contains `batch`) and the Azure side (`isExcludedAzureMeter`
 * drops `/batch/i` and `/fine/i`), so LiteLLM and OpenRouter were the two
 * sources leaking them.
 *
 * Leaving them in produced two visible defects: 77 phantom `:batch` families
 * beside their parents in the Pivot family picker, and a cheapest-input
 * highlight that could surface a batch rate as if it were the on-demand rate.
 */
export function isExcludedTier(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  // OpenRouter batch tier: `anthropic/claude-opus-5:batch`
  if (normalized.endsWith(':batch')) {
    return true;
  }
  // LiteLLM fine-tuned inference: `ft:gpt-4o-2024-08-06`, `azure/ft:gpt-4…`
  if (/(^|\/)ft:/.test(normalized)) {
    return true;
  }
  return false;
}

function stripSubstratePrefix(modelId: string): string {
  for (const prefix of ['bedrock/', 'azure/', 'vertex_ai/']) {
    if (modelId.startsWith(prefix)) {
      return modelId.slice(prefix.length);
    }
  }

  return modelId;
}

// Hyperscaler classification is keyed on LiteLLM's own `litellm_provider`
// metadata field, NOT on string-matching the model identifier. The field is
// LiteLLM's authoritative provenance label — values are enumerated in
// model_prices_and_context_window.json and stay stable across releases.
//
// Adding a new LiteLLM provider here is a one-line change with a paired test.
// The previous string-prefix heuristic mis-classified bedrock_converse and
// azure_ai entries (which don't carry a `bedrock/` or `azure/` key prefix)
// as 'direct', producing visibly wrong rows in the Pivot view.
const HYPERSCALER_BY_LITELLM_PROVIDER: ReadonlyMap<string, Hyperscaler> = new Map([
  // AWS — Bedrock + SageMaker + Amazon-native model paths
  ['bedrock', 'aws'],
  ['bedrock_converse', 'aws'],
  ['bedrock_mantle', 'aws'],
  ['amazon_nova', 'aws'],
  ['sagemaker', 'aws'],
  // Azure
  ['azure', 'azure'],
  ['azure_ai', 'azure'],
  ['azure_text', 'azure'],
  // GCP — Vertex AI + Gemini direct + legacy palm
  ['vertex_ai', 'gcp'],
  ['gemini', 'gcp'],
  ['palm', 'gcp'],
  // Aggregator
  ['openrouter', 'aggregator'],
  ['vercel_ai_gateway', 'aggregator'],
  ['llamagate', 'aggregator'],
  ['together_ai', 'aggregator'],
  ['aiml', 'aggregator'],
  ['novita', 'aggregator'],
  // Note: every other LiteLLM provider (anthropic, openai, mistral,
  // deepseek, perplexity, cohere, …) is treated as 'direct'.
]);

export function inferHyperscalerFromLitellm(modelId: string, litellmProvider?: string): Hyperscaler {
  if (typeof litellmProvider === 'string' && litellmProvider.length > 0) {
    const normalized = litellmProvider.toLowerCase();
    const direct = HYPERSCALER_BY_LITELLM_PROVIDER.get(normalized);
    if (direct !== undefined) {
      return direct;
    }
    // vertex_ai-anthropic_models, vertex_ai-llama_models, vertex_ai-mistral_models, …
    if (normalized.startsWith('vertex_ai')) {
      return 'gcp';
    }
    if (normalized.startsWith('bedrock')) {
      return 'aws';
    }
    if (normalized.startsWith('azure')) {
      return 'azure';
    }
    return 'direct';
  }

  // Fallback only when LiteLLM omitted the provider tag (rare — the field is
  // populated on every real entry as of 2026-05). Pre-existing string-prefix
  // heuristic preserved here so we degrade gracefully rather than mis-class.
  if (modelId.startsWith('bedrock/')) {
    return 'aws';
  }
  if (modelId.startsWith('azure/') || modelId.startsWith('azure_ai/')) {
    return 'azure';
  }
  if (modelId.startsWith('vertex_ai/')) {
    return 'gcp';
  }
  if (modelId.startsWith('openrouter/')) {
    return 'aggregator';
  }

  return 'direct';
}

export function inferProviderFromLitellm(modelId: string, litellmProvider?: string): string {
  if (typeof litellmProvider === 'string' && litellmProvider.length > 0) {
    return litellmProvider.toLowerCase();
  }

  const provider = stripSubstratePrefix(modelId).split(/[./]/, 1)[0];
  return provider.length > 0 ? provider.toLowerCase() : 'unknown';
}

// Family-name noise patterns that the LiteLLM / Bedrock / Databricks /
// OpenRouter feeds spell into their model IDs and that extractFamily MUST
// strip before a record lands in current.json. Exported so `Verify.ts` can
// run them as an inverse assertion — any noise pattern surviving the
// normalize pass into a record's `family` field is a regression and the
// daily CI refresh should fail before that record reaches the dashboard.
//
// Maintenance contract: when a new aliasing pattern appears upstream:
//   1. Add the regex here with a descriptive `name`
//   2. Wire it into the extractFamily chain at the correct ordering
//      position (see comments below — the position matters because chains)
//   3. Add at least one familyCases entry to normalize.test.ts
//   4. Verify.ts picks the new pattern up automatically via this export
export interface FamilyNoisePattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly example: string;
}

export const FAMILY_NOISE_PATTERNS: readonly FamilyNoisePattern[] = [
  {
    name: 'databricks-prefix',
    pattern: /^databricks-/,
    example: 'databricks-claude-opus-4-1 → claude-opus-4-1',
  },
  {
    name: 'regional-bedrock-prefix',
    pattern: /^(us-gov|eu|us|global|au|apac|ca|me|sa)\./,
    example: 'eu.anthropic.claude-opus-4-7 → claude-opus-4-7',
  },
  // Non-on-demand billing tier leaking into the family name. These records are
  // dropped by isExcludedTier before normalization, so any survivor is a bug.
  {
    name: 'non-ondemand-tier-suffix',
    pattern: /:batch$|(^|\/)ft:/,
    example: 'claude-opus-5:batch → excluded (batch tier, not a family)',
  },
  {
    name: 'dashed-anthropic-reexport',
    pattern: /^anthropic-(?=claude-)/,
    example: 'anthropic-claude-3.5-sonnet → claude-3-5-sonnet',
  },
  {
    name: 'snapshot-pin-suffix',
    pattern: /@/,
    example: 'claude-opus-4-1@20250805 → claude-opus-4-1',
  },
  // Bedrock tagged versioned alias (always strips regardless of family prefix)
  {
    name: 'bedrock-tagged-alias',
    pattern: /-v\d+:\d+$/,
    example: 'claude-opus-4-7-v1:0 → claude-opus-4-7',
  },
  // Bedrock minor-version tag without the `v`: `openai.gpt-oss-120b-1:0`.
  // MUST stay after bedrock-tagged-alias — findFamilyNoise returns the first
  // match, and this looser pattern would otherwise shadow the `-v\d+:\d+`
  // diagnosis for every Anthropic Bedrock alias.
  {
    name: 'bedrock-numeric-tag',
    pattern: /:\d+$/,
    example: 'gpt-oss-120b-1:0 → gpt-oss-120b',
  },
  // Anthropic Claude bare `-v\d+` — only when there's a numeric base before
  // `-v`. Mirror of the extractFamily Rule 2; intentionally narrow so the
  // guard does NOT fire on canonical `claude-v1` / `claude-instant-v1`.
  {
    name: 'claude-bedrock-bare-alias',
    pattern: /^claude(?:-[a-z]+)*-\d+(?:-\d+)*-v\d+$/,
    example: 'claude-opus-4-6-v1 → claude-opus-4-6',
  },
  // Amazon Nova bare `-v\d+` — mirror of extractFamily Rule 3.
  // Intentionally narrow: does NOT fire on titan-embed-image-v1 etc.
  {
    name: 'nova-bedrock-bare-alias',
    pattern: /^nova(?:-\d+)?-[a-z]+-v\d+$/,
    example: 'nova-lite-v1 → nova-lite',
  },
];

/**
 * Returns the first noise pattern that matches the given (already-normalized)
 * family field, or null if the family is canonical. Used by `Verify.ts` to
 * fail the daily refresh CI the moment a new upstream aliasing pattern slips
 * past extractFamily — see the maintenance contract on FAMILY_NOISE_PATTERNS.
 */
export function findFamilyNoise(family: string): FamilyNoisePattern | null {
  for (const candidate of FAMILY_NOISE_PATTERNS) {
    if (candidate.pattern.test(family)) {
      return candidate;
    }
  }
  return null;
}

export function extractFamily(modelId: string): string {
  let family = modelId.toLowerCase();

  // Provider-path prefixes stripped repeatedly, BEFORE the dash-prefix and
  // @-snapshot rules below. Ordering matters:
  //   - `databricks/databricks-claude-opus-4-1`: stripping `databricks/` here
  //     leaves `databricks-claude-opus-4-1`, which the `^databricks-` rule
  //     (further down) then canonicalizes. Without this, the generic slash
  //     collapse ran AFTER the dash strip and the inner prefix survived.
  //   - `cloudflare/@cf/meta/llama-2-7b-chat-fp16` and `.../@hf/thebloke/...`:
  //     stripping `cloudflare/` then `@cf/` / `@hf/` here means the `@.*$`
  //     snapshot rule never sees the `@` (it would otherwise nuke the family
  //     to empty and fall back to the raw id). The slash collapse then drops
  //     the remaining org segment (`meta/`, `thebloke/`).
  const substratePrefixes = [
    'bedrock/',
    'azure/',
    'vertex_ai/',
    'openrouter/',
    'databricks/',
    'cloudflare/',
    '@cf/',
    '@hf/',
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of substratePrefixes) {
      if (family.startsWith(prefix)) {
        family = family.slice(prefix.length);
        changed = true;
      }
    }
  }

  // databricks- prefix strip (FAMILY_NOISE_PATTERNS: databricks-prefix)
  family = family.replace(/^databricks-/, '');

  // Regional Bedrock inference-profile prefix
  // (FAMILY_NOISE_PATTERNS: regional-bedrock-prefix). Must run before the
  // vendor-dot strip below so `anthropic.` is recognisable after stripping
  // the regional segment.
  // `us-gov` is listed first for readability; the alternation backtracks either
  // way, but `us` would otherwise be the eye-catching (and wrong) match for
  // `us-gov.anthropic.claude-opus-5`.
  family = family.replace(/^(us-gov|eu|us|global|au|apac|ca|me|sa)\./, '');

  const slashIndex = family.indexOf('/');
  if (slashIndex > 0 && !family.slice(0, slashIndex).includes('.')) {
    family = family.slice(slashIndex + 1);
  }

  family = family.replace(
    /^(anthropic|amazon|meta|mistral|mistralai|cohere|ai21|stability|deepseek|writer|openai|google|qwen|microsoft|huggingface|z-ai|zhipu|nvidia|xai|moonshot|minimax|luma|twelvelabs)\./,
    '',
  );

  // Dashed Anthropic re-export (FAMILY_NOISE_PATTERNS: dashed-anthropic-reexport)
  family = family.replace(/^anthropic-(?=claude-)/, '');

  // @-suffix snapshot pin (FAMILY_NOISE_PATTERNS: snapshot-pin-suffix)
  family = family.replace(/@.*$/, '');

  // Bedrock versioned aliases — three narrowly-scoped rules per the
  // Codex P1 fix on #23. The full rationale lives in normalize.ts on that
  // PR; in short, the bare `-v\d+$` form is part of the canonical name on
  // titan-embed-image-v1, claude-v1, claude-instant-v1, j2-mid-v1,
  // deepseek-v3, etc. — only Anthropic Claude with a digit-numbered base
  // and Amazon Nova legitimately strip it.
  //
  // FAMILY_NOISE_PATTERNS below mirrors these three rules so the guard
  // fires on the same shapes the normalizer is responsible for stripping.
  family = family.replace(/-v\d+:\d+$/, '');
  // Bare-numeric Bedrock minor tag: `gpt-oss-120b-1:0`. Stripping the whole
  // `-\d+:\d+` is right there, but wrong for `rerank-v3-5:0`, where the `-5`
  // is the minor half of a dotted version (`v3.5`) rather than a tag. Detect
  // that by looking at what the greedy strip would leave behind: if it ends in
  // `-v\d+`, we ate a version digit, so drop only the `:\d+` suffix.
  const numericTag = /-(\d+):\d+$/.exec(family);
  if (numericTag !== null) {
    const withTagStripped = family.slice(0, numericTag.index);
    family = /-v\d+$/.test(withTagStripped)
      ? `${withTagStripped}-${numericTag[1]}` // `rerank-v3-5:0` → `rerank-v3-5`
      : withTagStripped; //                     `gpt-oss-120b-1:0` → `gpt-oss-120b`
  }
  family = family.replace(/:\d+$/, '');
  family = family.replace(/^(claude(?:-[a-z]+)*-\d+(?:-\d+)*)-v\d+$/, '$1');
  family = family.replace(/^(nova(?:-\d+)?-[a-z]+)-v\d+$/, '$1');

  family = family.replace(/-\d{8}$/, '');
  family = family.replace(/-\d{4}$/, '');
  family = family.replace(/^gpt-35-/, 'gpt-3.5-');

  if (family.startsWith('claude') || family.startsWith('gemini')) {
    family = family.replace(/(\d)\.(\d)/g, '$1-$2');
  }

  return family.length > 0 ? family : modelId.toLowerCase();
}

export function normalizeLitellm(
  entries: Record<string, LiteLLMEntry>,
  fetchedAt: string,
  sourceUrl: string,
): NormalizationResult {
  const records: PriceRecord[] = [];
  let zeroContext = 0;
  let missingPrice = 0;
  let excludedTier = 0;

  for (const [modelId, entry] of Object.entries(entries)) {
    if (modelId === 'sample_spec') {
      continue;
    }
    if (isExcludedTier(modelId)) {
      excludedTier += 1;
      continue;
    }

    const inputCost = entry.input_cost_per_token;
    const outputCost = entry.output_cost_per_token;
    // Skip null/undefined AND negative sentinels — some upstreams use -1 for "no flat price."
    if (inputCost == null || outputCost == null || inputCost < 0 || outputCost < 0) {
      missingPrice += 1;
      continue;
    }

    const contextWindow = entry.max_input_tokens ?? entry.max_tokens ?? 0;
    if (contextWindow === 0) {
      zeroContext += 1;
      continue;
    }

    records.push({
      provider: inferProviderFromLitellm(modelId, entry.litellm_provider),
      model_id: modelId,
      family: extractFamily(modelId),
      hyperscaler: inferHyperscalerFromLitellm(modelId, entry.litellm_provider),
      region: null,
      input_per_1k: inputCost * 1000,
      output_per_1k: outputCost * 1000,
      cached_input_per_1k:
        entry.cache_read_input_token_cost != null
          ? entry.cache_read_input_token_cost * 1000
          : null,
      image_per_1k: entry.input_cost_per_image != null ? entry.input_cost_per_image * 1000 : null,
      context_window: contextWindow,
      context_window_estimated: false,
      pricing_varies: false,
      alias_of: null,
      source: 'litellm',
      source_url: sourceUrl,
      fetched_at: fetchedAt,
    });
  }

  return { records, skipped: { zeroContext, missingPrice, excludedTier } };
}

export function normalizeOpenRouter(
  entries: OpenRouterEntry[],
  fetchedAt: string,
  sourceUrl: string,
): NormalizationResult {
  const records: PriceRecord[] = [];
  let zeroContext = 0;
  let missingPrice = 0;
  let excludedTier = 0;

  for (const entry of entries) {
    if (isExcludedTier(entry.id)) {
      excludedTier += 1;
      continue;
    }

    const inputUSDPerToken = Number.parseFloat(entry.pricing.prompt);
    const outputUSDPerToken = Number.parseFloat(entry.pricing.completion);
    // OpenRouter ships sentinel "-1" prices for meta-models (openrouter/auto, /bodybuilder,
    // /pareto-code) that proxy other models. Treat negative the same as NaN — no flat price.
    if (
      Number.isNaN(inputUSDPerToken)
      || Number.isNaN(outputUSDPerToken)
      || inputUSDPerToken < 0
      || outputUSDPerToken < 0
    ) {
      missingPrice += 1;
      continue;
    }

    const contextWindow = entry.top_provider?.context_length ?? entry.context_length ?? 0;
    if (contextWindow === 0) {
      zeroContext += 1;
      continue;
    }

    const imageUSDPerToken = entry.pricing.image
      ? Number.parseFloat(entry.pricing.image)
      : Number.NaN;
    // Prompt-cache read price. ~60% of the OpenRouter catalog publishes this
    // and we were discarding all of it, leaving cache-aware comparison biased
    // towards LiteLLM-sourced rows (which do populate the column).
    const cacheReadUSDPerToken = entry.pricing.input_cache_read !== undefined
      ? Number.parseFloat(entry.pricing.input_cache_read)
      : Number.NaN;
    // `~vendor/model-latest` entries are pointers, not deployments. The raw
    // first path segment would otherwise become a `~anthropic` provider
    // sitting beside the real `anthropic` in every provider facet.
    const rawProvider = entry.id.includes('/') ? entry.id.split('/', 1)[0] : entry.id;
    const provider = rawProvider.replace(/^~/, '');
    const aliasTarget = entry.alias_target?.slug;

    records.push({
      provider: provider.toLowerCase(),
      model_id: entry.id,
      family: extractFamily(entry.id),
      hyperscaler: 'aggregator',
      region: null,
      input_per_1k: inputUSDPerToken * 1000,
      output_per_1k: outputUSDPerToken * 1000,
      cached_input_per_1k: Number.isNaN(cacheReadUSDPerToken) || cacheReadUSDPerToken < 0
        ? null
        : cacheReadUSDPerToken * 1000,
      image_per_1k: Number.isNaN(imageUSDPerToken) ? null : imageUSDPerToken * 1000,
      context_window: contextWindow,
      context_window_estimated: false,
      // OpenRouter publishes weekday/weekend and hour-window price schedules
      // for part of the catalog. We ingest the base rate only.
      pricing_varies: Array.isArray(entry.pricing.overrides) && entry.pricing.overrides.length > 0,
      alias_of: typeof aliasTarget === 'string' && aliasTarget.length > 0 ? aliasTarget : null,
      source: 'openrouter',
      source_url: sourceUrl,
      fetched_at: fetchedAt,
    });
  }

  return { records, skipped: { zeroContext, missingPrice, excludedTier } };
}

function providerForAwsModel(modelName: string): string {
  const normalized = modelName.toLowerCase();

  if (normalized.includes('claude')) {
    return 'anthropic';
  }
  if (normalized.includes('nova') || normalized.includes('titan')) {
    return 'amazon';
  }
  if (normalized.includes('llama')) {
    return 'meta';
  }
  if (normalized.includes('mistral') || normalized.includes('mixtral')) {
    return 'mistral';
  }
  if (normalized.includes('command')) {
    return 'cohere';
  }
  if (normalized.includes('jamba')) {
    return 'ai21';
  }
  if (normalized.includes('stable diffusion') || normalized.includes('stability')) {
    return 'stability';
  }
  if (normalized.includes('deepseek')) {
    return 'deepseek';
  }
  if (normalized.includes('qwen')) {
    return 'qwen';
  }
  if (normalized.includes('writer') || normalized.includes('palmyra')) {
    return 'writer';
  }
  if (normalized.includes('glm')) {
    return 'z-ai';
  }
  if (normalized.includes('gemini')) {
    return 'google';
  }
  if (normalized.includes('gpt') || normalized.includes('oss')) {
    return 'openai';
  }
  if (normalized.includes('marengo') || normalized.includes('pegasus')) {
    return 'twelve-labs';
  }
  if (normalized.includes('ray')) {
    return 'luma';
  }
  if (normalized.includes('kimi')) {
    return 'moonshot';
  }
  if (normalized.includes('minimax')) {
    return 'minimax';
  }

  return 'unknown';
}

function usdPriceForAwsSku(offer: AwsPriceListOffer, sku: string): number | null {
  const terms = offer.terms.OnDemand[sku];
  if (terms === undefined) {
    return null;
  }

  const term = Object.values(terms)[0];
  if (term === undefined) {
    return null;
  }

  const dimension = Object.values(term.priceDimensions)[0];
  if (dimension === undefined || dimension.pricePerUnit.USD === undefined) {
    return null;
  }

  const price = Number.parseFloat(dimension.pricePerUnit.USD);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

type AwsPriceGroup = {
  model: string;
  input?: number;
  output?: number;
  cachedInput?: number;
};

/**
 * Canonical `model_id` for an AWS Price List `attributes.model` display name.
 * Also the grouping key inside a region — see the comment at its call site.
 */
function awsModelId(model: string): string {
  return model.toLowerCase().replace(/\s+/g, '-');
}

export function normalizeAwsPriceList(
  regionOffers: Array<{ region: string; offerJson: AwsPriceListOffer; sourceUrl: string }>,
  fetchedAt: string,
): NormalizationResult {
  const records: PriceRecord[] = [];
  let missingPrice = 0;

  for (const { region, offerJson, sourceUrl } of regionOffers) {
    const groups = new Map<string, AwsPriceGroup>();

    for (const product of Object.values(offerJson.products)) {
      const model = product.attributes.model;
      const inferenceType = product.attributes.inferenceType;
      const usageType = product.attributes.usagetype?.toLowerCase();

      if (model === undefined || inferenceType === undefined) {
        continue;
      }
      if (
        usageType !== undefined
        && (usageType.includes('cross-region') || usageType.includes('global'))
      ) {
        continue;
      }
      const kind: 'input' | 'output' | 'cachedInput' | null =
        inferenceType === 'Input tokens'
          ? 'input'
          : inferenceType === 'Output tokens'
            ? 'output'
            : inferenceType === 'Prompt cache read input tokens'
              ? 'cachedInput'
              : null;
      if (kind === null) {
        continue;
      }
      if (
        usageType !== undefined
        && (usageType.includes('flex')
          || usageType.includes('priority')
          || usageType.includes('batch'))
      ) {
        continue;
      }

      // Group on the SAME key the record is identified by downstream, not on
      // the raw catalog string. AWS ships the same model under more than one
      // display spelling (e.g. `Qwen3 Next 80B A3B` and `Qwen3-Next-80B-A3B`),
      // which collapse to one `model_id`. Grouping on the raw string emitted
      // two records with the same (model_id, region) and *different* prices —
      // `qwen3-next-80b-a3b` @ ap-south-1 was $0.00018 and $0.000168 input.
      const groupKey = awsModelId(model);
      const group = groups.get(groupKey) ?? { model };
      groups.set(groupKey, group);
      const price = usdPriceForAwsSku(offerJson, product.sku);
      if (price === null) {
        continue;
      }

      if (kind === 'input') {
        group.input = price;
      } else if (kind === 'output') {
        group.output = price;
      } else {
        group.cachedInput = price;
      }
    }

    for (const group of groups.values()) {
      if (group.input === undefined || group.output === undefined) {
        missingPrice += 1;
        continue;
      }

      const modelId = awsModelId(group.model);
      records.push({
        provider: providerForAwsModel(group.model),
        model_id: modelId,
        family: extractFamily(modelId),
        hyperscaler: 'aws',
        region,
        input_per_1k: group.input,
        output_per_1k: group.output,
        cached_input_per_1k: group.cachedInput ?? null,
        image_per_1k: null,
        // The Price List Bulk API is a billing catalog — it carries no context
        // length. Filled in by inheritContextWindow, which also flips
        // context_window_estimated to true.
        context_window: 0,
        context_window_estimated: true,
        pricing_varies: false,
        alias_of: null,
        source: 'aws-pricelist',
        source_url: sourceUrl,
        fetched_at: fetchedAt,
      });
    }
  }

  return { records, skipped: { zeroContext: 0, missingPrice, excludedTier: 0 } };
}

function modelNameForAzureMeter(meterName: string): string {
  return meterName.replace(/\s+(Inp|Outp|Cached Input).*/i, '').trim();
}

function isExcludedAzureMeter(meterName: string, allowCachedInput: boolean): boolean {
  const excludedPatterns = [
    /-ft/i,
    /batch/i,
    /mdl grdr/i,
    /grdr/i,
    /image/i,
    /embed/i,
    /whisper/i,
    /tts/i,
    /audio/i,
    /fine/i,
    /provisioned/i,
    /-cached\b/i,
    /-cchd\b/i,
    /datazone/i,
    /realtimeprvw/i,
    /-aud-/i,
    /-rt-/i,
    /-rt\b/i,
  ];

  if (!allowCachedInput && /cached input/i.test(meterName)) {
    return true;
  }

  return excludedPatterns.some((pattern) => pattern.test(meterName));
}

type AzurePriceGroup = {
  modelName: string;
  skuName?: string;
  input?: number;
  output?: number;
  cachedInput?: number;
};

function validAzureUnitPrice(item: AzureRetailItem): number | null {
  if (
    item.unitOfMeasure !== '1K'
    || item.unitPrice === undefined
    || !Number.isFinite(item.unitPrice)
    || item.unitPrice < 0
  ) {
    return null;
  }

  return item.unitPrice;
}

export function normalizeAzureRetail(
  items: AzureRetailItem[],
  fetchedAt: string,
  sourceUrl: string,
): NormalizationResult {
  const groups = new Map<string, AzurePriceGroup>();
  const records: PriceRecord[] = [];
  let missingPrice = 0;

  for (const item of items) {
    const meterName = item.meterName;
    const region = item.armRegionName;
    if (
      item.productName !== 'Azure OpenAI'
      || meterName === undefined
      || region === undefined
      || !/cached input/i.test(meterName)
      || isExcludedAzureMeter(meterName, true)
    ) {
      continue;
    }

    const modelName = modelNameForAzureMeter(meterName);
    const price = validAzureUnitPrice(item);
    if (modelName === '' || price === null) {
      continue;
    }

    const key = `${region}\u0000${modelName}`;
    const group = groups.get(key) ?? { modelName, skuName: item.skuName };
    group.cachedInput = price;
    groups.set(key, group);
  }

  for (const item of items) {
    const meterName = item.meterName;
    const region = item.armRegionName;
    if (
      item.productName !== 'Azure OpenAI'
      || meterName === undefined
      || region === undefined
      || isExcludedAzureMeter(meterName, false)
    ) {
      continue;
    }

    const isInput = /\s+Inp\b/i.test(meterName);
    const isOutput = /\s+Outp\b/i.test(meterName);
    if (!isInput && !isOutput) {
      continue;
    }

    const modelName = modelNameForAzureMeter(meterName);
    const price = validAzureUnitPrice(item);
    if (modelName === '' || price === null) {
      continue;
    }

    const key = `${region}\u0000${modelName}`;
    const group = groups.get(key) ?? { modelName, skuName: item.skuName };
    if (isInput) {
      group.input = price;
    } else {
      group.output = price;
    }
    group.skuName ??= item.skuName;
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    const region = key.split('\u0000', 1)[0];
    if (group.input === undefined || group.output === undefined) {
      missingPrice += 1;
      continue;
    }

    const modelId = (group.skuName ?? group.modelName).toLowerCase().replace(/\s+/g, '-');
    const familyId = group.modelName.toLowerCase().replace(/\s+/g, '-');
    records.push({
      provider: 'openai',
      model_id: modelId,
      family: extractFamily(familyId),
      hyperscaler: 'azure',
      region,
      input_per_1k: group.input,
      output_per_1k: group.output,
      cached_input_per_1k: group.cachedInput ?? null,
      image_per_1k: null,
      // Retail Prices is a billing catalog — no context length. Filled in by
      // inheritContextWindow, which flips context_window_estimated to true.
      context_window: 0,
      context_window_estimated: true,
      pricing_varies: false,
      alias_of: null,
      source: 'azure-retail',
      source_url: sourceUrl,
      fetched_at: fetchedAt,
    });
  }

  return { records, skipped: { zeroContext: 0, missingPrice, excludedTier: 0 } };
}
