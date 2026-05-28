import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeJson } from './lib/io.ts';

const REPO_ROOT = resolve(import.meta.dir, '..');
const HISTORY_DIR = resolve(REPO_ROOT, 'data/history');
const MANIFEST_PATH = resolve(REPO_ROOT, 'data/history-manifest.json');
const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

interface HistoryManifest {
  dates: string[];
  count: number;
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function listDates(): Promise<string[]> {
  const entries = await readdir(HISTORY_DIR);
  const dates: string[] = [];
  const rejected: string[] = [];

  for (const entry of entries) {
    const match = DATE_FILE.exec(entry);
    if (match === null) {
      rejected.push(entry);
      continue;
    }
    dates.push(match[1]);
  }

  if (rejected.length > 0) {
    console.error(`[BuildHistoryManifest] WARN -- ignoring non-date entries: ${rejected.join(', ')}`);
  }

  dates.sort();
  return dates;
}

async function main(): Promise<void> {
  const dates = await listDates();
  const manifest: HistoryManifest = { dates, count: dates.length };
  await writeJson(MANIFEST_PATH, manifest);
  console.log(`[BuildHistoryManifest] OK -- ${dates.length} dates -> ${MANIFEST_PATH}`);
}

void main().catch((error: unknown): void => {
  console.error(`[BuildHistoryManifest] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
