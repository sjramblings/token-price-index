import type { PriceRecord } from './types.ts';

type ValidationError = { idx: number; model_id: string; messages: string[] };

const HYPERSCALERS = new Set(['aws', 'azure', 'gcp', 'direct', 'aggregator']);
const SOURCES = new Set(['litellm', 'openrouter', 'aws-pricelist', 'azure-retail']);

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateRecord(r: PriceRecord): string[] {
  const errors: string[] = [];

  if (typeof r.provider !== 'string' || r.provider.length === 0) {
    errors.push('provider must be a non-empty string');
  }
  if (typeof r.model_id !== 'string' || r.model_id.length === 0) {
    errors.push('model_id must be a non-empty string');
  }
  if (typeof r.family !== 'string') {
    errors.push('family must be a string');
  }
  if (!HYPERSCALERS.has(r.hyperscaler)) {
    errors.push('hyperscaler is not supported');
  }
  if (r.region !== null && typeof r.region !== 'string') {
    errors.push('region must be a string or null');
  }
  if (!isNonNegativeFiniteNumber(r.input_per_1k)) {
    errors.push('input_per_1k must be a finite number >= 0');
  }
  if (!isNonNegativeFiniteNumber(r.output_per_1k)) {
    errors.push('output_per_1k must be a finite number >= 0');
  }
  if (r.cached_input_per_1k !== null && !isNonNegativeFiniteNumber(r.cached_input_per_1k)) {
    errors.push('cached_input_per_1k must be null or a finite number >= 0');
  }
  if (r.image_per_1k !== null && !isNonNegativeFiniteNumber(r.image_per_1k)) {
    errors.push('image_per_1k must be null or a finite number >= 0');
  }
  if (
    typeof r.context_window !== 'number'
    || !Number.isFinite(r.context_window)
    || r.context_window <= 0
  ) {
    errors.push('context_window must be a finite number > 0');
  }
  if (!SOURCES.has(r.source)) {
    errors.push('source is not supported');
  }
  if (typeof r.source_url !== 'string' || r.source_url.length === 0) {
    errors.push('source_url must be a non-empty string');
  }
  if (typeof r.fetched_at !== 'string' || Number.isNaN(Date.parse(r.fetched_at))) {
    errors.push('fetched_at must be a parseable date string');
  }

  return errors;
}

export function validateAll(
  records: PriceRecord[],
): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  records.forEach((record: PriceRecord, idx: number): void => {
    const messages = validateRecord(record);
    if (messages.length > 0) {
      errors.push({
        idx,
        model_id: typeof record.model_id === 'string' ? record.model_id : '<unknown>',
        messages,
      });
    }
  });

  return { ok: errors.length === 0, errors };
}
