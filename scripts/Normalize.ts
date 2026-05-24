import { readJson, todayISO, writeJson } from './lib/io.ts';
import { normalizeLitellm, normalizeOpenRouter } from './lib/normalize.ts';
import type { LiteLLMEntry, OpenRouterResponse, PriceRecord } from './lib/types.ts';

const LITELLM_PATH = 'data/_raw/litellm.json';
const OPENROUTER_PATH = 'data/_raw/openrouter.json';
const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function compareRecords(a: PriceRecord, b: PriceRecord): number {
  return (
    a.source.localeCompare(b.source)
    || a.provider.localeCompare(b.provider)
    || a.model_id.localeCompare(b.model_id)
    || (a.region ?? '').localeCompare(b.region ?? '')
  );
}

async function main(): Promise<void> {
  const litellm = requireLitellmShape(await readJson<unknown>(LITELLM_PATH));
  const openrouter = requireOpenRouterShape(await readJson<unknown>(OPENROUTER_PATH));
  // Date-only ISO (YYYY-MM-DD) keeps same-day reruns byte-identical; daily-snapshot system
  // doesn't need sub-day precision. Matches data/history/YYYY-MM-DD.json filename cadence.
  const fetchedAt = todayISO();

  const litellmResult = normalizeLitellm(litellm, fetchedAt, LITELLM_URL);
  const openrouterResult = normalizeOpenRouter(openrouter.data, fetchedAt, OPENROUTER_URL);
  const records = [...litellmResult.records, ...openrouterResult.records].sort(compareRecords);
  const zeroContext = litellmResult.skipped.zeroContext + openrouterResult.skipped.zeroContext;
  const missingPrice = litellmResult.skipped.missingPrice + openrouterResult.skipped.missingPrice;
  const skipped = zeroContext + missingPrice;
  const historyPath = `data/history/${todayISO()}.json`;

  await writeJson('data/current.json', records);
  await writeJson(historyPath, records);

  console.log(
    `[Normalize] OK -- ${records.length} total records `
      + `(${litellmResult.records.length} litellm, ${openrouterResult.records.length} openrouter) `
      + `-> data/current.json + ${historyPath} `
      + `(skipped ${skipped}: zero-context ${zeroContext}, missing-price ${missingPrice})`,
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
