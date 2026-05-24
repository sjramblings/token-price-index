import { mkdir } from 'node:fs/promises';

const SOURCE_URL = 'https://openrouter.ai/api/v1/models';
const OUTPUT_PATH = 'data/_raw/openrouter.json';

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseResponse(body: string): { data: unknown[] } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body) as unknown;
  } catch (error: unknown) {
    throw new Error(`Invalid JSON for ${OUTPUT_PATH} from ${SOURCE_URL}: ${messageForError(error)}`);
  }

  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('data' in parsed)
    || !Array.isArray(parsed.data)
  ) {
    throw new Error(`Invalid JSON shape for ${OUTPUT_PATH} from ${SOURCE_URL}: expected { data: array }`);
  }

  return { data: parsed.data };
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

  console.log(`[FetchOpenRouter] OK -- ${parsed.data.length} entries -> ${OUTPUT_PATH}`);
  process.exit(0);
}

void main().catch((error: unknown): void => {
  console.error(`[FetchOpenRouter] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
