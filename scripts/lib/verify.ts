import { findFamilyNoise } from './normalize.ts';
import type { PriceRecord } from './types.ts';

type ValidationError = { idx: number; model_id: string; messages: string[] };

/**
 * Per-validation knobs. The family-shape guard runs by default for
 * freshly-normalized current.json (via Verify.ts), but is intentionally
 * skipped for historical snapshots whose family fields predate the latest
 * extractFamily rules — see `scripts/Diff.ts` (Codex P1 on PR #24).
 */
export interface ValidationOptions {
  readonly enforceFamilyShape?: boolean;
}

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  enforceFamilyShape: true,
};

const HYPERSCALERS = new Set(['aws', 'azure', 'gcp', 'direct', 'aggregator']);
const SOURCES = new Set(['litellm', 'openrouter', 'aws-pricelist', 'azure-retail']);

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateRecord(r: PriceRecord, options: ValidationOptions = {}): string[] {
  const resolved: Required<ValidationOptions> = { ...DEFAULT_OPTIONS, ...options };
  const errors: string[] = [];

  if (typeof r.provider !== 'string' || r.provider.length === 0) {
    errors.push('provider must be a non-empty string');
  }
  if (typeof r.model_id !== 'string' || r.model_id.length === 0) {
    errors.push('model_id must be a non-empty string');
  }
  if (typeof r.family !== 'string') {
    errors.push('family must be a string');
  } else if (resolved.enforceFamilyShape) {
    // Family-shape anomaly guard. Any record reaching current.json whose
    // family field still matches a known noise pattern means extractFamily
    // missed it — either the upstream source emits a new aliasing variant we
    // haven't taught extractFamily to strip, or the normalize step was
    // skipped. Fail the daily CI before the record reaches the dashboard.
    // See FAMILY_NOISE_PATTERNS in normalize.ts for the maintenance contract.
    //
    // Skipped (via options.enforceFamilyShape=false) when validating
    // historical snapshots that predate the canonicalization — those
    // snapshots are frozen evidence of what the dataset looked like on
    // that date, and the guard's job is to assert SHAPE of incoming data,
    // not to retroactively grade history.
    const noise = findFamilyNoise(r.family);
    if (noise !== null) {
      errors.push(
        `family "${r.family}" matches noise pattern "${noise.name}" — `
        + `extractFamily failed to canonicalize (example: ${noise.example}). `
        + 'Add a regex rule in scripts/lib/normalize.ts → extractFamily and '
        + 'a familyCases entry in normalize.test.ts.',
      );
    }
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
  options: ValidationOptions = {},
): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  records.forEach((record: PriceRecord, idx: number): void => {
    const messages = validateRecord(record, options);
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
