import type { Hyperscaler, LiteLLMEntry, OpenRouterEntry, PriceRecord } from './types.ts';

type NormalizationResult = {
  records: PriceRecord[];
  skipped: { zeroContext: number; missingPrice: number };
};

function stripSubstratePrefix(modelId: string): string {
  for (const prefix of ['bedrock/', 'azure/', 'vertex_ai/']) {
    if (modelId.startsWith(prefix)) {
      return modelId.slice(prefix.length);
    }
  }

  return modelId;
}

export function inferHyperscalerFromLitellm(modelId: string): Hyperscaler {
  if (modelId.startsWith('bedrock/')) {
    return 'aws';
  }
  if (modelId.startsWith('azure/')) {
    return 'azure';
  }
  if (modelId.startsWith('vertex_ai/')) {
    return 'gcp';
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

export function extractFamily(modelId: string): string {
  return stripSubstratePrefix(modelId).replace(/^[a-z0-9_-]+[./]/, '').toLowerCase();
}

export function normalizeLitellm(
  entries: Record<string, LiteLLMEntry>,
  fetchedAt: string,
  sourceUrl: string,
): NormalizationResult {
  const records: PriceRecord[] = [];
  let zeroContext = 0;
  let missingPrice = 0;

  for (const [modelId, entry] of Object.entries(entries)) {
    if (modelId === 'sample_spec') {
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
      hyperscaler: inferHyperscalerFromLitellm(modelId),
      region: null,
      input_per_1k: inputCost * 1000,
      output_per_1k: outputCost * 1000,
      cached_input_per_1k:
        entry.cache_read_input_token_cost != null
          ? entry.cache_read_input_token_cost * 1000
          : null,
      image_per_1k: entry.input_cost_per_image != null ? entry.input_cost_per_image * 1000 : null,
      context_window: contextWindow,
      source: 'litellm',
      source_url: sourceUrl,
      fetched_at: fetchedAt,
    });
  }

  return { records, skipped: { zeroContext, missingPrice } };
}

export function normalizeOpenRouter(
  entries: OpenRouterEntry[],
  fetchedAt: string,
  sourceUrl: string,
): NormalizationResult {
  const records: PriceRecord[] = [];
  let zeroContext = 0;
  let missingPrice = 0;

  for (const entry of entries) {
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
    const provider = entry.id.includes('/') ? entry.id.split('/', 1)[0] : entry.id;

    records.push({
      provider: provider.toLowerCase(),
      model_id: entry.id,
      family: extractFamily(entry.id),
      hyperscaler: 'aggregator',
      region: null,
      input_per_1k: inputUSDPerToken * 1000,
      output_per_1k: outputUSDPerToken * 1000,
      cached_input_per_1k: null,
      image_per_1k: Number.isNaN(imageUSDPerToken) ? null : imageUSDPerToken * 1000,
      context_window: contextWindow,
      source: 'openrouter',
      source_url: sourceUrl,
      fetched_at: fetchedAt,
    });
  }

  return { records, skipped: { zeroContext, missingPrice } };
}
