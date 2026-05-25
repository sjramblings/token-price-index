#!/usr/bin/env bun
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PriceRecord } from './lib/types.ts';
import type { IndexSpec } from './lib/index-compute.ts';
import { computeIndexHistory } from './lib/index-history.ts';
import type { Snapshot } from './lib/index-history.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DATA_CURRENT = join(REPO_ROOT, 'data', 'current.json');
const DATA_HISTORY = join(REPO_ROOT, 'data', 'history');
const MEMBERS_DIR = join(REPO_ROOT, 'indices', 'members');
const OUTPUT_DIR = join(REPO_ROOT, 'data', 'indices', 'history');

const HISTORY_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.json$/;

function usage(): never {
  console.error('usage: bun scripts/ComputeIndexHistory.ts <index-name>');
  console.error('       bun scripts/ComputeIndexHistory.ts --all');
  console.error('  <index-name>   matches indices/members/<index-name>.json');
  console.error('  --all          process every spec under indices/members/');
  process.exit(2);
}

async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as T;
}

async function loadSnapshots(): Promise<Snapshot[]> {
  // History snapshots live in data/history/YYYY-MM-DD.json. The latest live
  // snapshot is in data/current.json — include it as today's point so the
  // emitted series reaches up to the most recent refresh, not just yesterday.
  const snapshots: Snapshot[] = [];

  if (existsSync(DATA_HISTORY)) {
    const files = await readdir(DATA_HISTORY);
    for (const file of files) {
      const match = HISTORY_FILE_PATTERN.exec(file);
      if (match === null || match[1] === undefined) {
        continue;
      }
      const date = match[1];
      const records = await readJsonFile<PriceRecord[]>(join(DATA_HISTORY, file));
      snapshots.push({ date, records });
    }
  }

  // Include current as today's point. Use the first record's fetched_at to
  // determine today's date — falls back to system date if missing.
  if (existsSync(DATA_CURRENT)) {
    const records = await readJsonFile<PriceRecord[]>(DATA_CURRENT);
    const firstFetchedAt = records[0]?.fetched_at;
    const todayDate = firstFetchedAt !== undefined && firstFetchedAt.length >= 10
      ? firstFetchedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Avoid duplicating if a history file already covers this date (would
    // happen if the daily-refresh CI commits the history snapshot before
    // promoting it to current.json).
    if (!snapshots.some((s) => s.date === todayDate)) {
      snapshots.push({ date: todayDate, records });
    }
  }

  return snapshots;
}

async function listSpecs(): Promise<string[]> {
  if (!existsSync(MEMBERS_DIR)) {
    return [];
  }
  const files = await readdir(MEMBERS_DIR);
  return files
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort();
}

async function processOne(indexName: string, snapshots: Snapshot[]): Promise<void> {
  const specPath = join(MEMBERS_DIR, `${indexName}.json`);
  if (!existsSync(specPath)) {
    console.error(`spec not found: ${specPath}`);
    process.exit(1);
  }

  const spec = await readJsonFile<IndexSpec>(specPath);
  const history = computeIndexHistory(snapshots, spec);

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, `${indexName}.json`);
  await writeFile(outPath, JSON.stringify(history, null, 2) + '\n', 'utf-8');

  const earliest = history.earliest_value === null
    ? '—'
    : `$${history.earliest_value.toFixed(4)}`;
  const latest = history.latest_value === null
    ? '—'
    : `$${history.latest_value.toFixed(4)}`;
  const change = history.pct_change_earliest_to_latest === null
    ? '—'
    : `${history.pct_change_earliest_to_latest >= 0 ? '+' : ''}${history.pct_change_earliest_to_latest.toFixed(2)}%`;
  const stable = history.stable ? ' (stable)' : '';

  console.log(
    `  ${indexName.padEnd(28)} ${history.series.length} pts  ${earliest} → ${latest}  ${change}${stable}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    usage();
  }

  const snapshots = await loadSnapshots();
  if (snapshots.length === 0) {
    console.error('no snapshots found — data/history/ is empty and data/current.json missing');
    process.exit(1);
  }

  console.log(`Loaded ${snapshots.length} snapshot(s): ${snapshots.map((s) => s.date).sort().join(', ')}\n`);

  if (argv[0] === '--all') {
    const specs = await listSpecs();
    if (specs.length === 0) {
      console.error('no specs found under indices/members/');
      process.exit(1);
    }
    console.log(`Computing history for ${specs.length} index spec(s):`);
    for (const name of specs) {
      await processOne(name, snapshots);
    }
    console.log(`\nWrote ${specs.length} file(s) under ${OUTPUT_DIR}`);
    return;
  }

  const name = argv[0];
  if (name === undefined) {
    usage();
  }
  await processOne(name, snapshots);
  console.log(`\nWrote ${join(OUTPUT_DIR, `${name}.json`)}`);
}

await main();
