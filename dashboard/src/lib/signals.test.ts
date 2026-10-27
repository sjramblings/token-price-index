import { describe, expect, test } from 'bun:test';
import type { PriceRecord } from '@scripts/lib/types';
import {
  cacheSavings,
  channelSpreads,
  priceMovers,
  regionalSpreads,
} from './signals';

function record(overrides: Partial<PriceRecord>): PriceRecord {
  return {
    provider: 'amazon',
    model_id: 'nova-lite',
    family: 'nova-lite',
    hyperscaler: 'aws',
    region: 'us-east-1',
    input_per_1k: 0.001,
    output_per_1k: 0.004,
    cached_input_per_1k: null,
    image_per_1k: null,
    context_window: 300_000,
    context_window_estimated: true,
    pricing_varies: false,
    alias_of: null,
    source: 'aws-pricelist',
    source_url: 'https://example.invalid/sentinel',
    fetched_at: '2026-10-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('regionalSpreads', () => {
  const threeRegions: PriceRecord[] = [
    record({ region: 'us-east-1', input_per_1k: 0.001 }),
    record({ region: 'eu-west-3', input_per_1k: 0.0015 }),
    record({ region: 'ap-south-1', input_per_1k: 0.0012 }),
  ];

  test('reports the cheapest and dearest region with the spread between them', () => {
    const [spread] = regionalSpreads(threeRegions);
    expect(spread?.cheapestRegion).toBe('us-east-1');
    expect(spread?.dearestRegion).toBe('eu-west-3');
    expect(spread?.regionCount).toBe(3);
    expect(spread?.spreadPct).toBeCloseTo(50, 6);
  });

  test('requires at least minRegions before reporting a spread', () => {
    expect(regionalSpreads(threeRegions.slice(0, 2))).toHaveLength(0);
    expect(regionalSpreads(threeRegions.slice(0, 2), 2)).toHaveLength(1);
  });

  test('never crosses channels for one model', () => {
    const mixed = [
      ...threeRegions,
      record({ hyperscaler: 'azure', region: 'eastus', input_per_1k: 0.09 }),
    ];
    const spreads = regionalSpreads(mixed);
    expect(spreads).toHaveLength(1);
    expect(spreads[0]?.dearestPer1k).toBeCloseTo(0.0015, 6);
  });

  test('skips regionless records and free tiers rather than dividing by zero', () => {
    const noisy = [
      record({ region: null, input_per_1k: 0.001 }),
      record({ region: 'a', input_per_1k: 0 }),
      record({ region: 'b', input_per_1k: 0 }),
      record({ region: 'c', input_per_1k: 0 }),
    ];
    expect(regionalSpreads(noisy)).toHaveLength(0);
  });

  test('ranks the widest spread first', () => {
    const wide = [
      record({ model_id: 'wide', region: 'a', input_per_1k: 0.001 }),
      record({ model_id: 'wide', region: 'b', input_per_1k: 0.002 }),
      record({ model_id: 'wide', region: 'c', input_per_1k: 0.003 }),
    ];
    const ranked = regionalSpreads([...threeRegions, ...wide]);
    expect(ranked[0]?.modelId).toBe('wide');
    expect(ranked[0]?.spreadPct).toBeCloseTo(200, 6);
  });
});

describe('channelSpreads', () => {
  test('compares each channel at its own best price', () => {
    const [spread] = channelSpreads([
      record({ family: 'claude-opus-5', hyperscaler: 'aggregator', region: null, input_per_1k: 0.005 }),
      record({ family: 'claude-opus-5', hyperscaler: 'aws', region: 'us-east-1', input_per_1k: 0.02 }),
      // A dearer aggregator row must not become the aggregator's number.
      record({ family: 'claude-opus-5', hyperscaler: 'aggregator', region: null, input_per_1k: 0.009 }),
    ]);
    expect(spread?.cheapestChannel).toBe('aggregator');
    expect(spread?.cheapestPer1k).toBeCloseTo(0.005, 6);
    expect(spread?.dearestChannel).toBe('aws');
    expect(spread?.spreadPct).toBeCloseTo(300, 6);
  });

  test('ignores families present on only one channel', () => {
    expect(channelSpreads([
      record({ family: 'solo', hyperscaler: 'aws' }),
      record({ family: 'solo', hyperscaler: 'aws', region: 'eu-west-1' }),
    ])).toHaveLength(0);
  });

  test('excludes alias pointers so a redirect cannot invent a channel', () => {
    expect(channelSpreads([
      record({ family: 'glm-5', hyperscaler: 'aggregator', region: null, input_per_1k: 0.001 }),
      record({
        family: 'glm-5',
        hyperscaler: 'direct',
        region: null,
        input_per_1k: 0.009,
        alias_of: 'z-ai/glm-5',
      }),
    ])).toHaveLength(0);
  });
});

describe('priceMovers', () => {
  const before = [record({ input_per_1k: 0.001 })];

  test('reports a rise and a cut with the correct sign', () => {
    expect(priceMovers(before, [record({ input_per_1k: 0.0012 })])[0]?.deltaPct)
      .toBeCloseTo(20, 6);
    expect(priceMovers(before, [record({ input_per_1k: 0.0008 })])[0]?.deltaPct)
      .toBeCloseTo(-20, 6);
  });

  test('matches on full identity, not model id alone', () => {
    // Same model, different region — not the same deployment, so not a move.
    expect(priceMovers(before, [record({ region: 'eu-west-1', input_per_1k: 0.002 })]))
      .toHaveLength(0);
  });

  test('ignores records absent from either snapshot', () => {
    expect(priceMovers([], [record({ input_per_1k: 0.002 })])).toHaveLength(0);
    expect(priceMovers(before, [])).toHaveLength(0);
  });

  test('filters noise below minDeltaPct', () => {
    expect(priceMovers(before, [record({ input_per_1k: 0.001001 })])).toHaveLength(0);
    expect(priceMovers(before, [record({ input_per_1k: 0.001001 })], 0.01)).toHaveLength(1);
  });

  test('ranks by absolute move, so a big cut outranks a small rise', () => {
    const moves = priceMovers(
      [record({ model_id: 'a', input_per_1k: 0.001 }), record({ model_id: 'b', input_per_1k: 0.001 })],
      [record({ model_id: 'a', input_per_1k: 0.0011 }), record({ model_id: 'b', input_per_1k: 0.0005 })],
    );
    expect(moves[0]?.modelId).toBe('b');
    expect(moves[0]?.deltaPct).toBeCloseTo(-50, 6);
  });
});

describe('cacheSavings', () => {
  test('computes the discount on a cache hit', () => {
    const [saving] = cacheSavings([
      record({ input_per_1k: 0.001, cached_input_per_1k: 0.0001 }),
    ]);
    expect(saving?.savingPct).toBeCloseTo(90, 6);
  });

  test('skips records with no cache price, and any that would not be a saving', () => {
    expect(cacheSavings([record({ cached_input_per_1k: null })])).toHaveLength(0);
    expect(cacheSavings([record({ input_per_1k: 0.001, cached_input_per_1k: 0.001 })])).toHaveLength(0);
    expect(cacheSavings([record({ input_per_1k: 0.001, cached_input_per_1k: 0.002 })])).toHaveLength(0);
  });

  test('reports one row per model and channel, not per region', () => {
    expect(cacheSavings([
      record({ region: 'us-east-1', input_per_1k: 0.001, cached_input_per_1k: 0.0001 }),
      record({ region: 'eu-west-1', input_per_1k: 0.001, cached_input_per_1k: 0.0001 }),
    ])).toHaveLength(1);
  });

  test('ranks the deepest discount first', () => {
    const ranked = cacheSavings([
      record({ model_id: 'shallow', input_per_1k: 0.001, cached_input_per_1k: 0.0009 }),
      record({ model_id: 'deep', input_per_1k: 0.001, cached_input_per_1k: 0.00005 }),
    ]);
    expect(ranked[0]?.modelId).toBe('deep');
  });
});
