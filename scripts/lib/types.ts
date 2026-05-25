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

export type OpenRouterEntry = {
  id: string;
  name?: string;
  pricing: { prompt: string; completion: string; image?: string };
  context_length?: number;
  top_provider?: { context_length?: number };
  architecture?: { tokenizer?: string };
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
