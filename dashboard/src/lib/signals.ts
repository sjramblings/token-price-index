import type { Hyperscaler, PriceRecord } from './types';

/**
 * Derived "what does this dataset actually say" signals.
 *
 * The catalogue is rich — 4,000+ priced deployments, five channels, 40+ regions,
 * 140 daily snapshots — but every page made the reader do the analysis: sort a
 * table, pick a family from a dropdown, choose a model to chart. Nothing told
 * them where the money is. These are the questions the data can answer on its
 * own, computed once on load.
 *
 * Every function here is pure and total: no throwing, no NaN leakage, and an
 * empty input yields an empty result rather than a divide-by-zero.
 */

/** Ignore sub-cent noise and free tiers when computing ratios. */
const MIN_PRICE = 1e-9;

function pctDelta(from: number, to: number): number {
  return ((to - from) / from) * 100;
}

function isComparable(record: PriceRecord): boolean {
  return Number.isFinite(record.input_per_1k) && record.input_per_1k > MIN_PRICE;
}

export interface RegionalSpread {
  modelId: string;
  hyperscaler: Hyperscaler;
  regionCount: number;
  cheapestRegion: string;
  cheapestPer1k: number;
  dearestRegion: string;
  dearestPer1k: number;
  /** How much more the dearest region costs than the cheapest, in percent. */
  spreadPct: number;
}

/**
 * Same model, same channel, different region — ranked by how much the region
 * choice costs you.
 *
 * This is the single most buried number in the dataset. `gpt-oss-20b` on
 * Bedrock runs 57% dearer in its most expensive region than its cheapest, and
 * the only way to see that was to sort the Explorer table by model and compare
 * adjacent rows by eye.
 */
export function regionalSpreads(
  records: PriceRecord[],
  minRegions = 3,
): RegionalSpread[] {
  const groups = new Map<string, PriceRecord[]>();

  for (const record of records) {
    if (record.region === null || !isComparable(record)) {
      continue;
    }
    const key = `${record.model_id}\u0000${record.hyperscaler}`;
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [record]);
    } else {
      bucket.push(record);
    }
  }

  const spreads: RegionalSpread[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length < minRegions) {
      continue;
    }
    let cheapest = bucket[0] as PriceRecord;
    let dearest = bucket[0] as PriceRecord;
    for (const record of bucket) {
      if (record.input_per_1k < cheapest.input_per_1k) {
        cheapest = record;
      }
      if (record.input_per_1k > dearest.input_per_1k) {
        dearest = record;
      }
    }
    const spreadPct = pctDelta(cheapest.input_per_1k, dearest.input_per_1k);
    if (spreadPct <= 0) {
      continue;
    }
    spreads.push({
      modelId: cheapest.model_id,
      hyperscaler: cheapest.hyperscaler,
      regionCount: bucket.length,
      cheapestRegion: cheapest.region ?? '—',
      cheapestPer1k: cheapest.input_per_1k,
      dearestRegion: dearest.region ?? '—',
      dearestPer1k: dearest.input_per_1k,
      spreadPct,
    });
  }

  return spreads.sort((left, right) => right.spreadPct - left.spreadPct);
}

export interface ChannelSpread {
  family: string;
  channelCount: number;
  cheapestChannel: Hyperscaler;
  cheapestProvider: string;
  cheapestPer1k: number;
  dearestChannel: Hyperscaler;
  dearestProvider: string;
  dearestPer1k: number;
  spreadPct: number;
}

/**
 * Same model family, cheapest route versus dearest route.
 *
 * Each channel is compared at its own best price, so the answer is not an
 * artefact of which region happened to sort first.
 *
 * The winning and losing PROVIDER is carried alongside the channel, and the UI
 * must show it, because `hyperscaler: 'direct'` is not "the vendor's own API" —
 * it is every provider the classifier did not recognise as a hyperscaler or
 * aggregator, which today includes a dozen resellers (coralbricks,
 * inferenceapis, prism, scx-ai, tencent, openinfer, …). Labelling the cheapest
 * of those as "direct" would turn a real arbitrage into a misleading claim
 * about a vendor's own pricing. Naming the endpoints keeps the number honest.
 */
export function channelSpreads(records: PriceRecord[]): ChannelSpread[] {
  const byFamily = new Map<string, Map<Hyperscaler, ChannelBest>>();

  for (const record of records) {
    if (!isComparable(record) || record.alias_of !== null) {
      continue;
    }
    const channels = byFamily.get(record.family) ?? new Map<Hyperscaler, ChannelBest>();
    const best = channels.get(record.hyperscaler);
    if (best === undefined || record.input_per_1k < best.per1k) {
      channels.set(record.hyperscaler, {
        channel: record.hyperscaler,
        provider: record.provider,
        per1k: record.input_per_1k,
      });
    }
    byFamily.set(record.family, channels);
  }

  const spreads: ChannelSpread[] = [];
  for (const [family, channels] of byFamily) {
    if (channels.size < 2) {
      continue;
    }
    let cheapest: ChannelBest | null = null;
    let dearest: ChannelBest | null = null;
    for (const entry of channels.values()) {
      if (cheapest === null || entry.per1k < cheapest.per1k) {
        cheapest = entry;
      }
      if (dearest === null || entry.per1k > dearest.per1k) {
        dearest = entry;
      }
    }
    if (cheapest === null || dearest === null) {
      continue;
    }
    const spreadPct = pctDelta(cheapest.per1k, dearest.per1k);
    if (spreadPct <= 0) {
      continue;
    }
    spreads.push({
      family,
      channelCount: channels.size,
      cheapestChannel: cheapest.channel,
      cheapestProvider: cheapest.provider,
      cheapestPer1k: cheapest.per1k,
      dearestChannel: dearest.channel,
      dearestProvider: dearest.provider,
      dearestPer1k: dearest.per1k,
      spreadPct,
    });
  }

  return spreads.sort((left, right) => right.spreadPct - left.spreadPct);
}

type ChannelBest = { channel: Hyperscaler; provider: string; per1k: number };

export interface PriceMove {
  modelId: string;
  hyperscaler: Hyperscaler;
  region: string | null;
  source: PriceRecord['source'];
  fromPer1k: number;
  toPer1k: number;
  deltaPct: number;
}

/**
 * Input-price movement between two snapshots, matched on the full record
 * identity so a model is never compared against a different deployment of
 * itself.
 *
 * `minDeltaPct` filters float noise; the caller supplies the snapshot dates
 * for labelling, because the gap between two snapshots is not always one day —
 * the series has holes where refresh runs failed, and claiming "since
 * yesterday" over a ten-day gap would be exactly the kind of invented freshness
 * this dashboard has been fixing.
 */
export function priceMovers(
  previous: PriceRecord[],
  current: PriceRecord[],
  minDeltaPct = 1,
): PriceMove[] {
  const identity = (record: PriceRecord): string =>
    `${record.source}\u0000${record.model_id}\u0000${record.hyperscaler}\u0000${record.region ?? ''}`;

  const before = new Map<string, PriceRecord>();
  for (const record of previous) {
    if (isComparable(record)) {
      before.set(identity(record), record);
    }
  }

  const moves: PriceMove[] = [];
  for (const record of current) {
    // Alias pointers mirror whatever their target does, so including them
    // reports the same upstream event twice under two names.
    if (!isComparable(record) || record.alias_of !== null) {
      continue;
    }
    const prior = before.get(identity(record));
    if (prior === undefined) {
      continue;
    }
    const deltaPct = pctDelta(prior.input_per_1k, record.input_per_1k);
    if (!Number.isFinite(deltaPct) || Math.abs(deltaPct) < minDeltaPct) {
      continue;
    }
    moves.push({
      modelId: record.model_id,
      hyperscaler: record.hyperscaler,
      region: record.region,
      source: record.source,
      fromPer1k: prior.input_per_1k,
      toPer1k: record.input_per_1k,
      deltaPct,
    });
  }

  // Biggest absolute move first — a 40% cut is as newsworthy as a 40% rise.
  return moves.sort((left, right) => Math.abs(right.deltaPct) - Math.abs(left.deltaPct));
}

export interface CacheSaving {
  modelId: string;
  hyperscaler: Hyperscaler;
  inputPer1k: number;
  cachedPer1k: number;
  /** Percent saved on a cache hit versus the uncached input price. */
  savingPct: number;
  /** USD saved per 1K cached input tokens. */
  savingPer1k: number;
}

/**
 * Prompt-cache read discount, which the dataset has carried all along and no
 * page has ever shown. For cache-heavy workloads this is frequently the
 * largest single lever available, and it was invisible.
 */
export function cacheSavings(records: PriceRecord[]): CacheSaving[] {
  const savings: CacheSaving[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const cached = record.cached_input_per_1k;
    if (cached === null || !isComparable(record) || cached < 0 || cached >= record.input_per_1k) {
      continue;
    }
    const key = `${record.model_id}\u0000${record.hyperscaler}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    savings.push({
      modelId: record.model_id,
      hyperscaler: record.hyperscaler,
      inputPer1k: record.input_per_1k,
      cachedPer1k: cached,
      savingPct: (1 - cached / record.input_per_1k) * 100,
      savingPer1k: record.input_per_1k - cached,
    });
  }

  // Rank by MONEY saved, not percent. Ranking by percent floated a wall of
  // "100% off" rows from one reseller whose cache reads are free on models
  // that cost $0.00001 uncached — technically the deepest discount available
  // and worth nothing to anybody.
  return savings.sort((left, right) => right.savingPer1k - left.savingPer1k);
}
