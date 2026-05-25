import { mkdir } from 'node:fs/promises';

const BASE = 'https://prices.azure.com/api/retail/prices';
const FILTER = "productName eq 'Azure OpenAI'";
const OUTPUT_PATH = 'data/_raw/azure-retail.json';
const MAX_PAGES = 50;
const SOURCE_URL = `${BASE}?$filter=${FILTER}`;

type AzureRetailPage = {
  items: unknown[];
  nextPageLink: string | null;
};

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parsePage(body: string, sourceUrl: string): AzureRetailPage {
  let value: unknown;

  try {
    value = JSON.parse(body) as unknown;
  } catch (error: unknown) {
    throw new Error(`Invalid JSON from ${sourceUrl}: ${messageForError(error)}`);
  }

  if (
    typeof value !== 'object'
    || value === null
    || !('Items' in value)
    || !Array.isArray(value.Items)
    || (
      'NextPageLink' in value
      && value.NextPageLink !== null
      && typeof value.NextPageLink !== 'string'
    )
  ) {
    throw new Error(`Invalid JSON shape from ${sourceUrl}: expected { Items: array, NextPageLink?: string | null }`);
  }

  return {
    items: value.Items,
    nextPageLink: 'NextPageLink' in value && typeof value.NextPageLink === 'string'
      ? value.NextPageLink
      : null,
  };
}

async function main(): Promise<void> {
  let url: string | null = `${BASE}?$filter=${encodeURIComponent(FILTER)}`;
  let pages = 0;
  const items: unknown[] = [];

  while (url !== null && pages < MAX_PAGES) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
    }

    const page = parsePage(await response.text(), url);
    items.push(...page.items);
    url = page.nextPageLink;
    pages += 1;
  }

  if (url !== null) {
    console.warn(`[FetchAzureRetail] STOP -- reached defensive pagination cap of ${MAX_PAGES} pages`);
  }

  const fetchedAt = new Date().toISOString();
  await mkdir('data/_raw', { recursive: true });
  await Bun.write(OUTPUT_PATH, `${JSON.stringify({ items, fetchedAt, sourceUrl: SOURCE_URL }, null, 2)}\n`);
  console.log(`[FetchAzureRetail] OK -- ${items.length} items across ${pages} pages -> ${OUTPUT_PATH}`);
  process.exit(0);
}

void main().catch((error: unknown): void => {
  console.error(`[FetchAzureRetail] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
