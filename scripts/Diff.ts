import { readdir } from 'node:fs/promises';
import { readJson, todayISO, writeJson } from './lib/io.ts';
import type { PriceRecord } from './lib/types.ts';
import { validateAll } from './lib/verify.ts';

const CURRENT_PATH = 'data/current.json';
const HISTORY_PATH = 'data/history';
const DIFF_PATH = 'data/_raw/diff.json';

type ChangedRecord = {
  key: string;
  model_id: string;
  prior: { input_per_1k: number; output_per_1k: number };
  current: { input_per_1k: number; output_per_1k: number };
};

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
  );
}

// `enforceFamilyShape` is true only for current.json — historical snapshots
// predate the latest extractFamily rules and the family-shape guard would
// false-positive on every legacy regional / @-suffix / -v1 family that the
// snapshot was frozen with (Codex P1 on PR #24). Schema invariants still
// run on history; only the shape guard is scoped out.
async function readRecords(
  path: string,
  requireNonEmpty: boolean,
  enforceFamilyShape: boolean,
): Promise<PriceRecord[]> {
  const value = await readJson<unknown>(path);
  if (!Array.isArray(value) || (requireNonEmpty && value.length === 0)) {
    throw new Error(`${path} must contain a non-empty JSON array of price records`);
  }
  if (
    value.some(
      (record: unknown): boolean =>
        typeof record !== 'object' || record === null || Array.isArray(record),
    )
  ) {
    throw new Error(`${path} contains a non-object price record`);
  }

  const records = value as PriceRecord[];
  if (!validateAll(records, { enforceFamilyShape }).ok) {
    throw new Error(`${path} contains invalid price records`);
  }

  return records;
}

function recordKey(record: PriceRecord): string {
  return `${record.source}:${record.model_id}:${record.region ?? 'null'}`;
}

async function historyFiles(): Promise<string[]> {
  let entries: string[];

  try {
    entries = await readdir(HISTORY_PATH);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((name: string): boolean => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort((a: string, b: string): number => b.localeCompare(a));
}

async function main(): Promise<void> {
  // current.json is freshly normalized — enforce the family-shape guard.
  const current = await readRecords(CURRENT_PATH, true, true);
  const todayFile = `${todayISO()}.json`;
  const priorFile = (await historyFiles()).find((name: string): boolean => name !== todayFile);

  if (priorFile === undefined) {
    await writeJson(DIFF_PATH, {
      added: current.length,
      removed: 0,
      changed: 0,
      addedList: current.slice(0, 50).map((record: PriceRecord): string => record.model_id),
      removedList: [],
      changedList: [],
    });
    console.log(
      `[Diff] no prior snapshot -- seed run (added: ${current.length}, removed: 0, changed: 0)`,
    );
    process.exit(0);
  }

  // History snapshots are frozen evidence of what the dataset looked like on
  // that date — they predate the latest extractFamily rules and naturally
  // contain pre-canonicalization family names (regional Bedrock prefixes,
  // @-suffixes, etc.). Skip the family-shape guard; schema invariants still
  // run. (Codex P1 on PR #24.)
  const prior = await readRecords(`${HISTORY_PATH}/${priorFile}`, false, false);
  const currentByKey = new Map(
    current.map((record: PriceRecord): [string, PriceRecord] => [recordKey(record), record]),
  );
  const priorByKey = new Map(
    prior.map((record: PriceRecord): [string, PriceRecord] => [recordKey(record), record]),
  );
  const added = current.filter((record: PriceRecord): boolean => !priorByKey.has(recordKey(record)));
  const removed = prior.filter((record: PriceRecord): boolean => !currentByKey.has(recordKey(record)));
  const changed: ChangedRecord[] = [];

  for (const [key, record] of currentByKey) {
    const priorRecord = priorByKey.get(key);
    if (
      priorRecord !== undefined
      && (
        record.input_per_1k !== priorRecord.input_per_1k
        || record.output_per_1k !== priorRecord.output_per_1k
      )
    ) {
      changed.push({
        key,
        model_id: record.model_id,
        prior: {
          input_per_1k: priorRecord.input_per_1k,
          output_per_1k: priorRecord.output_per_1k,
        },
        current: {
          input_per_1k: record.input_per_1k,
          output_per_1k: record.output_per_1k,
        },
      });
    }
  }

  await writeJson(DIFF_PATH, {
    priorSnapshot: priorFile,
    added: added.length,
    removed: removed.length,
    changed: changed.length,
    addedList: added.slice(0, 100),
    addedTruncated: added.length > 100,
    removedList: removed.slice(0, 100),
    removedTruncated: removed.length > 100,
    changedList: changed.slice(0, 100),
    changedTruncated: changed.length > 100,
  });

  console.log(
    `[Diff] vs prior ${priorFile} -- added: ${added.length}, removed: ${removed.length}, `
      + `changed: ${changed.length}`,
  );
  process.exit(0);
}

void main().catch((error: unknown): void => {
  console.error(`[Diff] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
