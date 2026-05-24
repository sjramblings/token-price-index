import { mkdir } from 'node:fs/promises';

const SOURCE_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OUTPUT_PATH = 'data/_raw/litellm.json';

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseResponse(body: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body) as unknown;
  } catch (error: unknown) {
    throw new Error(`Invalid JSON for ${OUTPUT_PATH} from ${SOURCE_URL}: ${messageForError(error)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid JSON shape for ${OUTPUT_PATH} from ${SOURCE_URL}: expected an object`);
  }

  return parsed as Record<string, unknown>;
}

async function main(): Promise<void> {
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${SOURCE_URL}`);
  }

  const body = await res.text();
  const parsed = parseResponse(body);

  await mkdir('data/_raw', { recursive: true });
  await Bun.write(OUTPUT_PATH, body);

  console.log(`[FetchLiteLLM] OK -- ${Object.keys(parsed).length} entries -> ${OUTPUT_PATH}`);
  process.exit(0);
}

void main().catch((error: unknown): void => {
  console.error(`[FetchLiteLLM] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
