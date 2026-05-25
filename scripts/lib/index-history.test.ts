import { describe, expect, test } from 'bun:test';
import type { PriceRecord } from './types.ts';
import { computeIndexHistory } from './index-history.ts';
import type { Snapshot } from './index-history.ts';
import type { IndexSpec } from './index-compute.ts';

function record(overrides: Partial<PriceRecord>): PriceRecord {
  return {
    provider: 'openai',
    model_id: 'openai/gpt-test',
    family: 'gpt-test',
    hyperscaler: 'aggregator',
    region: null,
    input_per_1k: 0.001,
    output_per_1k: 0.002,
    cached_input_per_1k: null,
    image_per_1k: null,
    context_window: 128000,
    source: 'openrouter',
    source_url: 'https://example.com',
    fetched_at: '2026-05-25T00:00:00.000Z',
    ...overrides,
  };
}

const singleMemberSpec: IndexSpec = {
  name: 'single',
  blend: { input: 0.5, output: 0.5 },
  members: [{ label: 'GPT-Test', select: [{ family: 'gpt-test' }] }],
};

describe('computeIndexHistory', () => {
  test('emits one point per snapshot, sorted chronologically by date', () => {
    const snapshots: Snapshot[] = [
      { date: '2026-05-26', records: [record({ input_per_1k: 0.003, output_per_1k: 0.005 })] },
      { date: '2026-05-24', records: [record({ input_per_1k: 0.001, output_per_1k: 0.003 })] },
      { date: '2026-05-25', records: [record({ input_per_1k: 0.002, output_per_1k: 0.004 })] },
    ];

    const history = computeIndexHistory(snapshots, singleMemberSpec);

    expect(history.series).toHaveLength(3);
    expect(history.series.map((p) => p.date)).toEqual(['2026-05-24', '2026-05-25', '2026-05-26']);
    expect(history.series[0]?.geometric_mean_usd_per_million).toBeCloseTo(2.0, 6);
    expect(history.series[1]?.geometric_mean_usd_per_million).toBeCloseTo(3.0, 6);
    expect(history.series[2]?.geometric_mean_usd_per_million).toBeCloseTo(4.0, 6);
  });

  test('reports earliest + latest + pct_change correctly', () => {
    const snapshots: Snapshot[] = [
      { date: '2026-05-24', records: [record({ input_per_1k: 0.001, output_per_1k: 0.003 })] },
      { date: '2026-05-25', records: [record({ input_per_1k: 0.002, output_per_1k: 0.004 })] },
    ];

    const history = computeIndexHistory(snapshots, singleMemberSpec);

    expect(history.earliest_date).toBe('2026-05-24');
    expect(history.latest_date).toBe('2026-05-25');
    expect(history.earliest_value).toBeCloseTo(2.0, 6);
    expect(history.latest_value).toBeCloseTo(3.0, 6);
    expect(history.pct_change_earliest_to_latest).toBeCloseTo(50, 6);
    expect(history.stable).toBe(false);
  });

  test('marks stable when earliest === latest within tolerance', () => {
    const snapshots: Snapshot[] = [
      { date: '2026-05-24', records: [record({ input_per_1k: 0.001, output_per_1k: 0.003 })] },
      { date: '2026-05-25', records: [record({ input_per_1k: 0.001, output_per_1k: 0.003 })] },
    ];

    const history = computeIndexHistory(snapshots, singleMemberSpec);

    expect(history.stable).toBe(true);
    expect(history.pct_change_earliest_to_latest).toBeCloseTo(0, 6);
  });

  test('handles a single snapshot — earliest == latest', () => {
    const snapshots: Snapshot[] = [
      { date: '2026-05-25', records: [record({ input_per_1k: 0.001, output_per_1k: 0.003 })] },
    ];

    const history = computeIndexHistory(snapshots, singleMemberSpec);

    expect(history.series).toHaveLength(1);
    expect(history.earliest_date).toBe('2026-05-25');
    expect(history.latest_date).toBe('2026-05-25');
    expect(history.pct_change_earliest_to_latest).toBeCloseTo(0, 6);
    expect(history.stable).toBe(true);
  });

  test('handles empty snapshots — all nulls', () => {
    const history = computeIndexHistory([], singleMemberSpec);

    expect(history.series).toHaveLength(0);
    expect(history.earliest_date).toBeNull();
    expect(history.latest_date).toBeNull();
    expect(history.pct_change_earliest_to_latest).toBeNull();
    expect(history.stable).toBe(false);
  });

  test('skips null-mean snapshots from earliest/latest but keeps them in series', () => {
    // First snapshot has a free-priced member (geometric mean nulled per the
    // Codex P1 fix); second snapshot has a valid record. Earliest/latest
    // should reference the valid point only.
    const spec: IndexSpec = {
      name: 'mixed',
      blend: { input: 0.5, output: 0.5 },
      members: [
        { label: 'A', select: [{ family: 'a' }] },
        { label: 'Free', select: [{ family: 'free' }] },
      ],
    };
    const snapshots: Snapshot[] = [
      {
        date: '2026-05-24',
        records: [
          record({ family: 'a', model_id: 'a/1', input_per_1k: 0.001, output_per_1k: 0.001 }),
          record({ family: 'free', model_id: 'f/1', input_per_1k: 0, output_per_1k: 0 }),
        ],
      },
      {
        date: '2026-05-25',
        records: [
          record({ family: 'a', model_id: 'a/1', input_per_1k: 0.002, output_per_1k: 0.002 }),
          record({ family: 'free', model_id: 'f/1', input_per_1k: 0.0005, output_per_1k: 0.0005 }),
        ],
      },
    ];

    const history = computeIndexHistory(snapshots, spec);

    expect(history.series).toHaveLength(2);
    expect(history.series[0]?.geometric_mean_usd_per_million).toBeNull();
    expect(history.series[1]?.geometric_mean_usd_per_million).not.toBeNull();
    expect(history.earliest_date).toBe('2026-05-25');
    expect(history.latest_date).toBe('2026-05-25');
  });
});
