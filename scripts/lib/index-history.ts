import type { PriceRecord } from './types.ts';
import { computeIndex } from './index-compute.ts';
import type { IndexSpec } from './index-compute.ts';

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
  blend: { input: number; output: number };
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

export type Snapshot = { date: string; records: PriceRecord[] };

const STABLE_TOLERANCE_PCT = 0.01;

function pctChange(earliest: number, latest: number): number {
  return ((latest - earliest) / earliest) * 100;
}

export function computeIndexHistory(snapshots: Snapshot[], spec: IndexSpec): IndexHistory {
  // Snapshots arrive in arbitrary order; sort lexicographically by date so the
  // emitted series is chronological. Date strings are ISO YYYY-MM-DD so string
  // sort matches calendar order.
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const series: IndexHistoryPoint[] = ordered.map((snapshot) => {
    const result = computeIndex(snapshot.records, spec, { dataSource: snapshot.date });
    return {
      date: snapshot.date,
      geometric_mean_usd_per_million: result.geometric_mean_usd_per_million,
      arithmetic_mean_usd_per_million: result.arithmetic_mean_usd_per_million,
      members_resolved: result.members_resolved,
      members_with_invalid_price: result.members_with_invalid_price,
    };
  });

  const finitePoints = series.filter(
    (point): point is IndexHistoryPoint & { geometric_mean_usd_per_million: number } =>
      point.geometric_mean_usd_per_million !== null
      && Number.isFinite(point.geometric_mean_usd_per_million),
  );

  const earliest = finitePoints[0] ?? null;
  const latest = finitePoints[finitePoints.length - 1] ?? null;
  const earliestValue = earliest?.geometric_mean_usd_per_million ?? null;
  const latestValue = latest?.geometric_mean_usd_per_million ?? null;
  const change = earliestValue !== null && latestValue !== null && earliestValue !== 0
    ? pctChange(earliestValue, latestValue)
    : null;
  const stable = change !== null && Math.abs(change) < STABLE_TOLERANCE_PCT;

  return {
    name: spec.name,
    description: spec.description,
    blend: spec.blend,
    computed_at: new Date().toISOString(),
    member_count: spec.members.length,
    series,
    earliest_date: earliest?.date ?? null,
    latest_date: latest?.date ?? null,
    earliest_value: earliestValue,
    latest_value: latestValue,
    pct_change_earliest_to_latest: change,
    stable,
  };
}
