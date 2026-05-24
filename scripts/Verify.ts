import { readJson } from './lib/io.ts';
import type { PriceRecord } from './lib/types.ts';
import { validateAll } from './lib/verify.ts';

const CURRENT_PATH = 'data/current.json';

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireRecordArray(value: unknown): PriceRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${CURRENT_PATH} must contain a JSON array of price records`);
  }
  if (
    value.some(
      (record: unknown): boolean =>
        typeof record !== 'object' || record === null || Array.isArray(record),
    )
  ) {
    throw new Error(`${CURRENT_PATH} must contain only JSON object price records`);
  }

  return value as PriceRecord[];
}

async function main(): Promise<void> {
  const records = requireRecordArray(await readJson<unknown>(CURRENT_PATH));
  const result = validateAll(records);

  if (!result.ok) {
    console.error(
      `[Verify] FAIL -- ${result.errors.length} records failed validation (showing first 20):`,
    );
    console.table(
      result.errors.slice(0, 20).map((error) => ({
        idx: error.idx,
        model_id: error.model_id,
        messages: error.messages.join('; '),
      })),
    );
    process.exit(1);
  }

  console.log(`[Verify] OK -- ${records.length} records pass schema invariants`);
  process.exit(0);
}

void main().catch((error: unknown): void => {
  console.error(`[Verify] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
