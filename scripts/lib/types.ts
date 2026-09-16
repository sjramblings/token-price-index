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
  /**
   * True when `context_window` was NOT published by this record's own source
   * and was inherited from the family maximum across LiteLLM / OpenRouter.
   * Always true for aws-pricelist and azure-retail records — neither billing
   * catalog publishes a context length. Consumers ranking on context MUST
   * treat these as approximate. See Normalize.ts → inheritContextWindow.
   */
  context_window_estimated: boolean;
  /**
   * True when the upstream source publishes conditional pricing (time-of-day
   * or day-of-week windows) that this record does not capture. `input_per_1k`
   * / `output_per_1k` are the published BASE rate; actual billing may differ
   * inside an override window.
   */
  pricing_varies: boolean;
  /**
   * For catalog entries that are pointers to another model (OpenRouter's
   * `~vendor/model-latest` aliases), the `model_id` they resolve to. `null`
   * for ordinary records. Consumers counting distinct models should skip
   * records where this is non-null to avoid double counting.
   */
  alias_of: string | null;
  source: 'litellm' | 'openrouter' | 'aws-pricelist' | 'azure-retail';
  source_url: string;
  fetched_at: string;
};

export type LiteLLMEntry = Partial<{
  max_tokens: number;
  max_input_tokens: number;
  max_output_tokens: number;
  input_cost_per_token: number;
  output_cost_per_token: number;
  cache_read_input_token_cost: number;
  input_cost_per_image: number;
  litellm_provider: string;
  mode: string;
}>;

export type OpenRouterPricing = {
  prompt: string;
  completion: string;
  image?: string;
  /** Per-token price for a prompt-cache READ hit. Present on ~60% of the catalog. */
  input_cache_read?: string;
  /** Per-token surcharge for WRITING to the prompt cache. Not modelled in PriceRecord. */
  input_cache_write?: string;
  /**
   * Time-of-day / day-of-week price schedules. When present, the top-level
   * prompt/completion values are the base rate and an override window can bill
   * at a different rate. We ingest the base rate only — see `pricing_varies`.
   */
  overrides?: unknown[];
};

export type OpenRouterEntry = {
  id: string;
  name?: string;
  pricing: OpenRouterPricing;
  context_length?: number;
  top_provider?: { context_length?: number };
  architecture?: { tokenizer?: string };
  /**
   * Set when this entry is a `~vendor/model-latest` pointer that redirects to
   * another catalog entry rather than being a distinct deployment.
   */
  alias_target?: { name?: string; slug?: string } | null;
};

export type OpenRouterResponse = { data: OpenRouterEntry[] };

export type AwsPriceListProduct = {
  sku: string;
  productFamily?: string;
  attributes: {
    model?: string;
    inferenceType?: string;
    regionCode?: string;
    usagetype?: string;
    [key: string]: string | undefined;
  };
};

export type AwsPriceListOnDemandTerm = {
  priceDimensions: Record<string, {
    pricePerUnit: { USD?: string };
    unit?: string;
    description?: string;
  }>;
};

export type AwsPriceListOffer = {
  formatVersion?: string;
  publicationDate?: string;
  products: Record<string, AwsPriceListProduct>;
  terms: { OnDemand: Record<string, Record<string, AwsPriceListOnDemandTerm>> };
};

export type AwsPriceListIndex = {
  regions: string[];
  fetchedAt: string;
  sourceUrls: Record<string, string>;
};

export type AzureRetailItem = {
  currencyCode?: string;
  retailPrice?: number;
  unitPrice?: number;
  armRegionName?: string;
  location?: string;
  meterId?: string;
  meterName?: string;
  productId?: string;
  skuId?: string;
  productName?: string;
  skuName?: string;
  serviceName?: string;
  serviceId?: string;
  serviceFamily?: string;
  unitOfMeasure?: string;
  type?: string;
};

export type AzureRetailBundle = {
  items: AzureRetailItem[];
  fetchedAt: string;
  sourceUrl: string;
};

export type Hyperscaler = 'aws' | 'azure' | 'gcp' | 'direct' | 'aggregator';

export type Source = 'litellm' | 'openrouter' | 'aws-pricelist' | 'azure-retail';
