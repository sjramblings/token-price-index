const BASE_URL = import.meta.env.BASE_URL;

export type IndexBlend = { input: number; output: number };

export type IndexExcludedReason =
  | 'unresolved'
  | 'non_positive_blended_price'
  | 'non_finite_blended_price';

export type IndexMember = {
  label: string;
  resolved: { source: string; model_id: string; region: string | null; input_per_1k: number; output_per_1k: number } | null;
  selector_matched: number;
  blended_per_million: number | null;
  ln_blended: number | null;
  published_blended_per_million?: number;
  divergence_pct?: number;
  note?: string;
  excluded_reason?: IndexExcludedReason;
};

export type IndexResult = {
  name: string;
  description?: string;
  blend: IndexBlend;
  computed_at: string;
  data_source: string;
  member_count: number;
  members_resolved: number;
  members_with_invalid_price: number;
  members: IndexMember[];
  geometric_mean_usd_per_million: number | null;
  arithmetic_mean_usd_per_million: number | null;
  published_value_usd_per_million?: number;
  index_divergence_pct?: number;
};

// Known indices, in display order. When new index families ship, append here.
// A future enhancement is to publish data/indices/_manifest.json so the
// dashboard discovers them automatically — for now an explicit list keeps
// the page deterministic and survives renaming events on the data side.
export const INDEX_MANIFEST: ReadonlyArray<{ slug: string; group: 'reference' | 'tier' | 'channel' | 'region' }> = [
  { slug: 'atpi-replica', group: 'reference' },
  { slug: 'tpi-frontier', group: 'tier' },
  { slug: 'tpi-mid', group: 'tier' },
  { slug: 'tpi-fast', group: 'tier' },
  { slug: 'tpi-channel-aggregator', group: 'channel' },
  { slug: 'tpi-channel-direct', group: 'channel' },
  { slug: 'tpi-channel-azure', group: 'channel' },
  { slug: 'tpi-channel-bedrock', group: 'channel' },
  { slug: 'tpi-region-useast', group: 'region' },
  { slug: 'tpi-region-eu', group: 'region' },
  { slug: 'tpi-region-apac', group: 'region' },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndexResult(value: unknown): value is IndexResult {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.name === 'string'
    && isObject(value.blend)
    && typeof value.blend.input === 'number'
    && typeof value.blend.output === 'number'
    && typeof value.computed_at === 'string'
    && typeof value.member_count === 'number'
    && typeof value.members_resolved === 'number'
    && typeof value.members_with_invalid_price === 'number'
    && Array.isArray(value.members)
    && (value.geometric_mean_usd_per_million === null || typeof value.geometric_mean_usd_per_million === 'number')
    && (value.arithmetic_mean_usd_per_million === null || typeof value.arithmetic_mean_usd_per_million === 'number');
}

export async function loadIndex(slug: string): Promise<IndexResult> {
  const response = await fetch(`${BASE_URL}data/indices/${slug}.json`);
  if (!response.ok) {
    throw new Error(`indices/${slug}.json request failed with HTTP ${response.status}`);
  }
  const parsed: unknown = await response.json();
  if (!isIndexResult(parsed)) {
    throw new Error(`indices/${slug}.json failed shape validation`);
  }
  return parsed;
}

export async function loadAllIndices(): Promise<IndexResult[]> {
  const results = await Promise.all(INDEX_MANIFEST.map((entry) => loadIndex(entry.slug)));
  return results;
}

export function groupForIndex(slug: string): 'reference' | 'tier' | 'channel' | 'region' | 'unknown' {
  const found = INDEX_MANIFEST.find((entry) => entry.slug === slug);
  return found?.group ?? 'unknown';
}

export type IndexHistoryPoint = {
  date: string;
  geometric_mean_usd_per_million: number | null;
  arithmetic_mean_usd_per_million: number | null;
  members_resolved: number;
  members_with_invalid_price: number;
};

export type IndexHistory = {
  name: string;
  description?: string;
  blend: IndexBlend;
  computed_at: string;
  member_count: number;
  series: IndexHistoryPoint[];
  earliest_date: string | null;
  latest_date: string | null;
  earliest_value: number | null;
  latest_value: number | null;
  pct_change_earliest_to_latest: number | null;
  stable: boolean;
};

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

function isIndexHistory(value: unknown): value is IndexHistory {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.name === 'string'
    && isObject(value.blend)
    && typeof value.computed_at === 'string'
    && typeof value.member_count === 'number'
    && Array.isArray(value.series)
    && (value.earliest_date === null || typeof value.earliest_date === 'string')
    && (value.latest_date === null || typeof value.latest_date === 'string')
    && isNullableNumber(value.earliest_value)
    && isNullableNumber(value.latest_value)
    && isNullableNumber(value.pct_change_earliest_to_latest)
    && typeof value.stable === 'boolean';
}

export async function loadIndexHistory(slug: string): Promise<IndexHistory | null> {
  const response = await fetch(`${BASE_URL}data/indices/history/${slug}.json`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`indices/history/${slug}.json request failed with HTTP ${response.status}`);
  }
  const parsed: unknown = await response.json();
  if (!isIndexHistory(parsed)) {
    throw new Error(`indices/history/${slug}.json failed shape validation`);
  }
  return parsed;
}

export async function loadAllIndexHistories(): Promise<Map<string, IndexHistory>> {
  // History is optional decoration (sparkline). A single malformed history
  // JSON or a transient 5xx must not take down the entire /indices page —
  // base indices loaded successfully. Use allSettled so each history is
  // independent: failures are logged and treated identically to a 404
  // (the index simply renders without a sparkline).
  const settled = await Promise.allSettled(
    INDEX_MANIFEST.map(async (entry) => {
      const history = await loadIndexHistory(entry.slug);
      return [entry.slug, history] as const;
    }),
  );
  const map = new Map<string, IndexHistory>();
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    if (result === undefined) {
      continue;
    }
    if (result.status === 'fulfilled') {
      const [slug, history] = result.value;
      if (history !== null) {
        map.set(slug, history);
      }
    } else {
      const slug = INDEX_MANIFEST[i]?.slug ?? 'unknown';
      console.warn(`failed to load history for ${slug}:`, result.reason);
    }
  }
  return map;
}
