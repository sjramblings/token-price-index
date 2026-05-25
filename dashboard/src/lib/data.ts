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

export function isPriceRecord(value: unknown): value is PriceRecord {
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

export function isPriceRecordArray(value: unknown): value is PriceRecord[] {
  return Array.isArray(value) && value.every(isPriceRecord);
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

  return parsed;
}

export async function loadCurrent(): Promise<PriceRecord[]> {
  const response = await fetch(`${BASE_URL}data/current.json`);

  if (!response.ok) {
    throw new Error(`current.json request failed with HTTP ${response.status}`);
  }

  return parseResponse(response, 'current.json');
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
