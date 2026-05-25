import { mkdir } from 'node:fs/promises';
import type { AwsPriceListOffer } from './lib/types.ts';

const REGION_INDEX_URL =
  'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/region_index.json';
const BEDROCK_GA_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'ap-northeast-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
];
const BASE = 'https://pricing.us-east-1.amazonaws.com';
const OUTPUT_INDEX = 'data/_raw/aws-pricelist.json';
const OUTPUT_DIR = 'data/_raw/aws-pricelist';

type RegionIndex = {
  regions: Record<string, { currentVersionUrl?: string }>;
};

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(body: string, sourceUrl: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch (error: unknown) {
    throw new Error(`Invalid JSON from ${sourceUrl}: ${messageForError(error)}`);
  }
}

function requireRegionIndex(body: string): RegionIndex {
  const value = parseJson(body, REGION_INDEX_URL);
  if (!isObject(value) || !isObject(value.regions)) {
    throw new Error(`Invalid JSON shape from ${REGION_INDEX_URL}: expected a regions object`);
  }

  for (const [region, entry] of Object.entries(value.regions)) {
    if (
      !isObject(entry)
      || (
        entry.currentVersionUrl !== undefined
        && typeof entry.currentVersionUrl !== 'string'
      )
    ) {
      throw new Error(`Invalid region entry for ${region} from ${REGION_INDEX_URL}`);
    }
  }

  return value as RegionIndex;
}

function isAwsProduct(value: unknown): boolean {
  if (!isObject(value) || typeof value.sku !== 'string' || !isObject(value.attributes)) {
    return false;
  }

  return Object.values(value.attributes).every((attribute) => typeof attribute === 'string');
}

function isAwsTerm(value: unknown): boolean {
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
  ));
}

function requireOffer(body: string, sourceUrl: string): AwsPriceListOffer {
  const value = parseJson(body, sourceUrl);
  if (
    !isObject(value)
    || !isObject(value.products)
    || !isObject(value.terms)
    || !isObject(value.terms.OnDemand)
    || !Object.values(value.products).every(isAwsProduct)
    || !Object.values(value.terms.OnDemand).every((terms) => (
      isObject(terms) && Object.values(terms).every(isAwsTerm)
    ))
  ) {
    throw new Error(`Invalid JSON shape from ${sourceUrl}: expected an AWS Bedrock offer file`);
  }

  return value as AwsPriceListOffer;
}

async function main(): Promise<void> {
  const indexResponse = await fetch(REGION_INDEX_URL, { signal: AbortSignal.timeout(30_000) });
  if (!indexResponse.ok) {
    throw new Error(`HTTP ${indexResponse.status} ${indexResponse.statusText} from ${REGION_INDEX_URL}`);
  }

  const regionIndex = requireRegionIndex(await indexResponse.text());
  await mkdir(OUTPUT_DIR, { recursive: true });

  const regions: string[] = [];
  const sourceUrls: Record<string, string> = {};

  for (const region of BEDROCK_GA_REGIONS) {
    const currentVersionUrl = regionIndex.regions[region]?.currentVersionUrl;
    if (currentVersionUrl === undefined) {
      console.warn(`[FetchAwsPriceList] SKIP ${region} -- no current version URL in region index`);
      continue;
    }

    const sourceUrl = `${BASE}${currentVersionUrl}`;
    try {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        console.warn(
          `[FetchAwsPriceList] SKIP ${region} -- HTTP ${response.status} ${response.statusText} from ${sourceUrl}`,
        );
        continue;
      }

      const body = await response.text();
      requireOffer(body, sourceUrl);
      await Bun.write(`${OUTPUT_DIR}/${region}.json`, body);
      regions.push(region);
      sourceUrls[region] = sourceUrl;
    } catch (error: unknown) {
      console.warn(`[FetchAwsPriceList] SKIP ${region} -- ${messageForError(error)}`);
    }
  }

  const fetchedAt = new Date().toISOString();
  await Bun.write(OUTPUT_INDEX, `${JSON.stringify({ regions, fetchedAt, sourceUrls }, null, 2)}\n`);
  console.log(
    `[FetchAwsPriceList] OK -- ${regions.length}/${BEDROCK_GA_REGIONS.length} regions -> ${OUTPUT_INDEX}`,
  );
  process.exit(0);
}

void main().catch((error: unknown): void => {
  console.error(`[FetchAwsPriceList] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
