import type { Hyperscaler, PriceRecord, Source } from './types';

const BASE_URL = import.meta.env.BASE_URL;

function isHyperscaler(value: unknown): value is Hyperscaler {
  return value === 'aws'
    || value === 'azure'
    || value === 'gcp'
    || value === 'direct'
    || value === 'aggregator';
}

function isSource(value: unknown): value is Source {
  return value === 'litellm'
    || value === 'openrouter'
    || value === 'aws-pricelist'
    || value === 'azure-retail';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

/**
 * Shape check for the fields that have been in the contract since v0.
 *
 * `context_window_estimated`, `pricing_varies` and `alias_of` are deliberately
 * NOT required here: every `data/history/*.json` snapshot written before those
 * fields existed still has to load, or the Timeline and Indices pages lose
 * their entire back-catalogue. `hydrateRecord` fills the defaults instead.
 */
export function isPriceRecord(value: unknown): value is Partial<PriceRecord> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.provider === 'string'
    && typeof record.model_id === 'string'
    && typeof record.family === 'string'
    && isHyperscaler(record.hyperscaler)
    && (record.region === null || typeof record.region === 'string')
    && typeof record.input_per_1k === 'number'
    && typeof record.output_per_1k === 'number'
    && isNullableNumber(record.cached_input_per_1k)
    && isNullableNumber(record.image_per_1k)
    && typeof record.context_window === 'number'
    && isSource(record.source)
    && typeof record.source_url === 'string'
    && typeof record.fetched_at === 'string';
}

export function isPriceRecordArray(value: unknown): value is Array<Partial<PriceRecord>> {
  return Array.isArray(value) && value.every(isPriceRecord);
}

/**
 * Backfill fields added after a snapshot was written, so page code can treat
 * every loaded record as a complete `PriceRecord`.
 *
 * The defaults are the pre-schema truth: older snapshots carried no alias
 * marker and no override marker, and their AWS/Azure context windows were
 * inherited exactly as they are now — so `context_window_estimated` is derived
 * from the source rather than defaulted to false, which would have claimed
 * those older rows were publisher-reported.
 */
function hydrateRecord(record: Partial<PriceRecord>): PriceRecord {
  const source = record.source as PriceRecord['source'];
  return {
    ...(record as PriceRecord),
    context_window_estimated: record.context_window_estimated
      ?? (source === 'aws-pricelist' || source === 'azure-retail'),
    pricing_varies: record.pricing_varies ?? false,
    alias_of: record.alias_of ?? null,
  };
}

async function parseResponse(response: Response, filename: string): Promise<PriceRecord[]> {
  let parsed: unknown;

  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new Error(`${filename} could not be parsed as JSON`);
  }

  if (!isPriceRecordArray(parsed)) {
    throw new Error(`${filename} failed shape validation`);
  }

  return parsed.map(hydrateRecord);
}

/**
 * The date the loaded snapshot was actually built, as `YYYY-MM-DD`.
 *
 * Read this instead of the browser clock. The splash used to render
 * `new Date()`, so it claimed "updated today / snapshot <today>" no matter how
 * stale the JSON was — it read "snapshot 2026-09-16" while serving data
 * stamped 2026-09-15, and would have kept saying it through a week of failed
 * refreshes. Returns null for an empty record set rather than inventing a date.
 */
export function snapshotDate(records: PriceRecord[]): string | null {
  let latest: string | null = null;
  for (const record of records) {
    const day = record.fetched_at.slice(0, 10);
    if (latest === null || day > latest) {
      latest = day;
    }
  }
  return latest;
}

export async function loadCurrent(): Promise<PriceRecord[]> {
  const response = await fetch(`${BASE_URL}data/current.json`);

  if (!response.ok) {
    throw new Error(`current.json request failed with HTTP ${response.status}`);
  }

  return parseResponse(response, 'current.json');
}

export interface HistoryManifest {
  dates: string[];
  count: number;
}

export function isHistoryManifest(value: unknown): value is HistoryManifest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const manifest = value as Record<string, unknown>;
  if (!Array.isArray(manifest.dates) || typeof manifest.count !== 'number') {
    return false;
  }

  return manifest.dates.every((date: unknown): boolean => typeof date === 'string');
}

export async function loadHistoryManifest(): Promise<HistoryManifest | null> {
  const response = await fetch(`${BASE_URL}data/history-manifest.json`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`history-manifest.json request failed with HTTP ${response.status}`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new Error('history-manifest.json could not be parsed as JSON');
  }

  if (!isHistoryManifest(parsed)) {
    throw new Error('history-manifest.json failed shape validation');
  }

  return parsed;
}

export async function loadHistory(date: string): Promise<PriceRecord[] | null> {
  const response = await fetch(`${BASE_URL}data/history/${date}.json`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${date} history request failed with HTTP ${response.status}`);
  }

  return parseResponse(response, `${date} history snapshot`);
}

/**
 * The most recent `days` snapshot dates that actually exist, newest first.
 *
 * Prefer this over `iterateRecentDates`: the manifest is the authority on which
 * snapshots were written, so callers stop firing requests for days the refresh
 * never produced. Seven such days exist (three early-project days, three failed
 * runs, and 2026-08-27, lost to a run that crossed UTC midnight), and each one
 * cost a guaranteed 404 on every page load.
 */
export function recentSnapshotDates(manifest: HistoryManifest, days: number): string[] {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('days must be a positive integer');
  }
  return [...manifest.dates].sort().slice(-days).reverse();
}

/** @deprecated Assumes contiguous days. Use `recentSnapshotDates` with the manifest. */
export function iterateRecentDates(days: number): string[] {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('days must be a positive integer');
  }

  const today = new Date();
  const dates: string[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - index);
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}
