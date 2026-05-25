import { readJson, todayISO, writeJson } from './lib/io.ts';
import {
  normalizeAwsPriceList,
  normalizeAzureRetail,
  normalizeLitellm,
  normalizeOpenRouter,
} from './lib/normalize.ts';
import type {
  AwsPriceListIndex,
  AwsPriceListOffer,
  AwsPriceListOnDemandTerm,
  AwsPriceListProduct,
  AzureRetailBundle,
  AzureRetailItem,
  LiteLLMEntry,
  OpenRouterResponse,
  PriceRecord,
} from './lib/types.ts';

const LITELLM_PATH = 'data/_raw/litellm.json';
const OPENROUTER_PATH = 'data/_raw/openrouter.json';
const AWS_INDEX_PATH = 'data/_raw/aws-pricelist.json';
const AWS_REGION_DIR = 'data/_raw/aws-pricelist';
const AZURE_PATH = 'data/_raw/azure-retail.json';
const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';

type NormalizationResult = {
  records: PriceRecord[];
  skipped: { zeroContext: number; missingPrice: number };
};

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireLitellmShape(value: unknown): Record<string, LiteLLMEntry> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${LITELLM_PATH} must contain a JSON object of LiteLLM model entries`);
  }

  return value as Record<string, LiteLLMEntry>;
}

function requireOpenRouterShape(value: unknown): OpenRouterResponse {
  if (
    typeof value !== 'object'
    || value === null
    || !('data' in value)
    || !Array.isArray(value.data)
  ) {
    throw new Error(`${OPENROUTER_PATH} must contain a JSON object with a data array`);
  }

  return value as OpenRouterResponse;
}

function requireAwsIndexShape(value: unknown): AwsPriceListIndex {
  if (
    !isObject(value)
    || !Array.isArray(value.regions)
    || !value.regions.every((region) => typeof region === 'string')
    || typeof value.fetchedAt !== 'string'
    || Number.isNaN(Date.parse(value.fetchedAt))
    || !isObject(value.sourceUrls)
    || !Object.values(value.sourceUrls).every((url) => typeof url === 'string')
  ) {
    throw new Error(`${AWS_INDEX_PATH} must contain regions, fetchedAt, and sourceUrls`);
  }

  return value as AwsPriceListIndex;
}

function isAwsProduct(value: unknown): value is AwsPriceListProduct {
  if (
    !isObject(value)
    || typeof value.sku !== 'string'
    || (
      value.productFamily !== undefined
      && typeof value.productFamily !== 'string'
    )
    || !isObject(value.attributes)
  ) {
    return false;
  }

  return Object.values(value.attributes).every((attribute) => typeof attribute === 'string');
}

function isAwsTerm(value: unknown): value is AwsPriceListOnDemandTerm {
  if (!isObject(value) || !isObject(value.priceDimensions)) {
    return false;
  }

  return Object.values(value.priceDimensions).every((dimension) => (
    isObject(dimension)
    && isObject(dimension.pricePerUnit)
    && (
      dimension.pricePerUnit.USD === undefined
      || typeof dimension.pricePerUnit.USD === 'string'
    )
    && (dimension.unit === undefined || typeof dimension.unit === 'string')
    && (dimension.description === undefined || typeof dimension.description === 'string')
  ));
}

function requireAwsOfferShape(value: unknown, path: string): AwsPriceListOffer {
  if (
    !isObject(value)
    || !isObject(value.products)
    || !Object.values(value.products).every(isAwsProduct)
    || !isObject(value.terms)
    || !isObject(value.terms.OnDemand)
    || !Object.values(value.terms.OnDemand).every((terms) => (
      isObject(terms) && Object.values(terms).every(isAwsTerm)
    ))
  ) {
    throw new Error(`${path} must contain an AWS Price List offer document`);
  }

  return value as AwsPriceListOffer;
}

const AZURE_STRING_FIELDS: Array<keyof AzureRetailItem> = [
  'currencyCode',
  'armRegionName',
  'location',
  'meterId',
  'meterName',
  'productId',
  'skuId',
  'productName',
  'skuName',
  'serviceName',
  'serviceId',
  'serviceFamily',
  'unitOfMeasure',
  'type',
];

function isAzureRetailItem(value: unknown): value is AzureRetailItem {
  if (!isObject(value)) {
    return false;
  }

  if (
    AZURE_STRING_FIELDS.some((field) => (
      value[field] !== undefined && typeof value[field] !== 'string'
    ))
  ) {
    return false;
  }

  return (value.retailPrice === undefined || typeof value.retailPrice === 'number')
    && (value.unitPrice === undefined || typeof value.unitPrice === 'number');
}

function requireAzureShape(value: unknown): AzureRetailBundle {
  if (
    !isObject(value)
    || !Array.isArray(value.items)
    || !value.items.every(isAzureRetailItem)
    || typeof value.fetchedAt !== 'string'
    || Number.isNaN(Date.parse(value.fetchedAt))
    || typeof value.sourceUrl !== 'string'
    || value.sourceUrl.length === 0
  ) {
    throw new Error(`${AZURE_PATH} must contain valid items, fetchedAt, and sourceUrl`);
  }

  return value as AzureRetailBundle;
}

function compareRecords(a: PriceRecord, b: PriceRecord): number {
  return (
    a.source.localeCompare(b.source)
    || a.provider.localeCompare(b.provider)
    || a.model_id.localeCompare(b.model_id)
    || (a.region ?? '').localeCompare(b.region ?? '')
  );
}

function emptyNormalizationResult(): NormalizationResult {
  return { records: [], skipped: { zeroContext: 0, missingPrice: 0 } };
}

async function normalizeAvailableAwsRaw(): Promise<NormalizationResult> {
  if (!(await Bun.file(AWS_INDEX_PATH).exists())) {
    console.warn(`[Normalize] WARN -- ${AWS_INDEX_PATH} absent; skipping AWS regional prices`);
    return emptyNormalizationResult();
  }

  const index = requireAwsIndexShape(await readJson<unknown>(AWS_INDEX_PATH));
  const regionOffers: Array<{ region: string; offerJson: AwsPriceListOffer; sourceUrl: string }> = [];

  for (const region of index.regions) {
    const sourceUrl = index.sourceUrls[region];
    const path = `${AWS_REGION_DIR}/${region}.json`;
    if (sourceUrl === undefined) {
      console.warn(`[Normalize] WARN -- source URL absent for AWS region ${region}; skipping`);
      continue;
    }
    if (!(await Bun.file(path).exists())) {
      console.warn(`[Normalize] WARN -- ${path} absent; skipping AWS region ${region}`);
      continue;
    }

    regionOffers.push({
      region,
      offerJson: requireAwsOfferShape(await readJson<unknown>(path), path),
      sourceUrl,
    });
  }

  return normalizeAwsPriceList(regionOffers, index.fetchedAt);
}

async function normalizeAvailableAzureRaw(): Promise<NormalizationResult> {
  if (!(await Bun.file(AZURE_PATH).exists())) {
    console.warn(`[Normalize] WARN -- ${AZURE_PATH} absent; skipping Azure regional prices`);
    return emptyNormalizationResult();
  }

  const bundle = requireAzureShape(await readJson<unknown>(AZURE_PATH));
  return normalizeAzureRetail(bundle.items, bundle.fetchedAt, bundle.sourceUrl);
}

function inheritContextWindow(records: PriceRecord[]): { records: PriceRecord[]; dropped: number } {
  const familyMaxContext = new Map<string, number>();
  for (const record of records) {
    if (
      (record.source === 'litellm' || record.source === 'openrouter')
      && record.context_window > 0
    ) {
      const prior = familyMaxContext.get(record.family) ?? 0;
      if (record.context_window > prior) {
        familyMaxContext.set(record.family, record.context_window);
      }
    }
  }

  const output: PriceRecord[] = [];
  let dropped = 0;
  for (const record of records) {
    if (record.context_window > 0) {
      output.push(record);
      continue;
    }

    const inherited = familyMaxContext.get(record.family);
    if (inherited !== undefined && inherited > 0) {
      output.push({ ...record, context_window: inherited });
    } else {
      dropped += 1;
    }
  }

  return { records: output, dropped };
}

async function main(): Promise<void> {
  const litellm = requireLitellmShape(await readJson<unknown>(LITELLM_PATH));
  const openrouter = requireOpenRouterShape(await readJson<unknown>(OPENROUTER_PATH));
  // Date-only ISO (YYYY-MM-DD) keeps same-day reruns byte-identical; daily-snapshot system
  // doesn't need sub-day precision. Matches data/history/YYYY-MM-DD.json filename cadence.
  const fetchedAt = todayISO();

  const litellmResult = normalizeLitellm(litellm, fetchedAt, LITELLM_URL);
  const openrouterResult = normalizeOpenRouter(openrouter.data, fetchedAt, OPENROUTER_URL);
  const awsResult = await normalizeAvailableAwsRaw();
  const azureResult = await normalizeAvailableAzureRaw();
  const inherited = inheritContextWindow([
    ...litellmResult.records,
    ...openrouterResult.records,
    ...awsResult.records,
    ...azureResult.records,
  ]);
  const records = inherited.records.sort(compareRecords);
  const zeroContext = litellmResult.skipped.zeroContext
    + openrouterResult.skipped.zeroContext
    + awsResult.skipped.zeroContext
    + azureResult.skipped.zeroContext;
  const missingPrice = litellmResult.skipped.missingPrice
    + openrouterResult.skipped.missingPrice
    + awsResult.skipped.missingPrice
    + azureResult.skipped.missingPrice;
  const skipped = zeroContext + missingPrice + inherited.dropped;
  // Use the captured fetchedAt (not a second todayISO() call) so the run is atomically
  // tied to one date across a UTC-midnight boundary. Codex P2 on PR #2.
  const historyPath = `data/history/${fetchedAt}.json`;

  await writeJson('data/current.json', records);
  await writeJson(historyPath, records);

  console.log(
    `[Normalize] OK -- ${records.length} total records `
      + `(${litellmResult.records.length} litellm, ${openrouterResult.records.length} openrouter, `
      + `${awsResult.records.length} aws-pricelist, ${azureResult.records.length} azure-retail) `
      + `-> data/current.json + ${historyPath} `
      + `(skipped ${skipped}: zero-context ${zeroContext}, missing-price ${missingPrice}, `
      + `context-unmatched ${inherited.dropped})`,
  );
  process.exit(0);
}

void main().catch((error: unknown): void => {
  console.error(`[Normalize] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
