import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readJson<T>(path: string): Promise<T> {
  const text = await Bun.file(path).text();

  try {
    return JSON.parse(text) as T;
  } catch (error: unknown) {
    throw new Error(`Invalid JSON in ${path}: ${errorMessage(error)}`);
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** UTC hour the daily refresh cron is scheduled for (`0 17 * * *`). */
export const SCHEDULE_HOUR_UTC = 17;

/**
 * The snapshot date this refresh run belongs to — the date of its SCHEDULED
 * slot, not of the wall clock when it happened to execute.
 *
 * GitHub Actions does not run scheduled workflows on time. Observed delays on
 * this repo range from 2 to 8 hours, and on 2026-08-27 the 17:00 slot did not
 * start until 01:14 UTC on the 28th. With a wall-clock date that run wrote
 * `data/history/2026-08-28.json`, the next day's run wrote `2026-08-29.json`,
 * and 2026-08-27 was lost from the time series permanently.
 *
 * Shifting the clock back by the scheduled hour maps any execution time in
 * [17:00 D, 17:00 D+1) onto date D, which absorbs a delay of up to seven hours
 * past midnight without changing the on-time behaviour.
 *
 * `TPI_SNAPSHOT_DATE` overrides this for backfills and for manual dispatches
 * that should not land in the previous day's slot.
 */
export function snapshotDateISO(now: Date = new Date()): string {
  const override = process.env.TPI_SNAPSHOT_DATE;
  if (override !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return override;
  }

  const shifted = new Date(now.getTime() - SCHEDULE_HOUR_UTC * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
