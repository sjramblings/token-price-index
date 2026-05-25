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

export function extractFamily(modelId: string): string {
  let family = modelId.toLowerCase();

  const substratePrefixes = ['bedrock/', 'azure/', 'vertex_ai/', 'openrouter/'];
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

  const slashIndex = family.indexOf('/');
  if (slashIndex > 0 && !family.slice(0, slashIndex).includes('.')) {
    family = family.slice(slashIndex + 1);
  }

  family = family.replace(
    /^(anthropic|amazon|meta|mistral|mistralai|cohere|ai21|stability|deepseek|writer|openai|google|qwen|microsoft|huggingface|z-ai|zhipu)\./,
    '',
  );
  family = family.replace(/-v\d+:\d+$/, '');
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

      const group = groups.get(model) ?? { model };
      groups.set(model, group);
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

      const modelId = group.model.toLowerCase().replace(/\s+/g, '-');
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
        context_window: 0,
        source: 'aws-pricelist',
        source_url: sourceUrl,
        fetched_at: fetchedAt,
      });
    }
  }

  return { records, skipped: { zeroContext: 0, missingPrice } };
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
      context_window: 0,
      source: 'azure-retail',
      source_url: sourceUrl,
      fetched_at: fetchedAt,
    });
  }

  return { records, skipped: { zeroContext: 0, missingPrice } };
}
