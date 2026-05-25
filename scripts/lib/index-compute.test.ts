import { describe, expect, test } from 'bun:test';
import type { PriceRecord } from './types.ts';
import {
  blendedPerMillion,
  computeIndex,
  resolveMember,
} from './index-compute.ts';
import type { IndexSpec, MemberSpec } from './index-compute.ts';

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

describe('blendedPerMillion', () => {
  test('70/30 blend on $5 input / $30 output (GPT-5.5 shape)', () => {
    const r = record({ input_per_1k: 0.005, output_per_1k: 0.030 });
    const blended = blendedPerMillion(r, { input: 0.7, output: 0.3 });
    expect(blended).toBeCloseTo(12.5, 6);
  });

  test('50/50 blend handles symmetric weighting', () => {
    const r = record({ input_per_1k: 0.001, output_per_1k: 0.003 });
    const blended = blendedPerMillion(r, { input: 0.5, output: 0.5 });
    expect(blended).toBeCloseTo(2.0, 6);
  });

  test('zero output cost still produces valid blend', () => {
    const r = record({ input_per_1k: 0.001, output_per_1k: 0 });
    const blended = blendedPerMillion(r, { input: 0.7, output: 0.3 });
    expect(blended).toBeCloseTo(0.7, 6);
  });
});

describe('resolveMember', () => {
  const records: PriceRecord[] = [
    record({ source: 'openrouter', family: 'gpt-5.5', model_id: 'openai/gpt-5.5' }),
    record({ source: 'litellm', family: 'gpt-5.5', model_id: 'azure/gpt-5.5' }),
    record({ source: 'openrouter', family: 'claude-opus-4-7', model_id: 'anthropic/claude-opus-4.7' }),
  ];

  test('selects first matching selector by exact model_id', () => {
    const member: MemberSpec = {
      label: 'GPT-5.5',
      select: [{ source: 'openrouter', model_id_equals: 'openai/gpt-5.5' }],
    };
    const { record: r, selectorIndex } = resolveMember(records, member);
    expect(r).not.toBeNull();
    expect(r?.model_id).toBe('openai/gpt-5.5');
    expect(selectorIndex).toBe(0);
  });

  test('falls back to second selector when first does not match', () => {
    const member: MemberSpec = {
      label: 'Phantom',
      select: [
        { source: 'openrouter', model_id_equals: 'openai/does-not-exist' },
        { source: 'litellm', model_id_equals: 'azure/gpt-5.5' },
      ],
    };
    const { record: r, selectorIndex } = resolveMember(records, member);
    expect(r).not.toBeNull();
    expect(r?.model_id).toBe('azure/gpt-5.5');
    expect(selectorIndex).toBe(1);
  });

  test('returns null when no selector matches', () => {
    const member: MemberSpec = {
      label: 'Nonexistent',
      select: [{ source: 'openrouter', model_id_equals: 'fake/model' }],
    };
    const { record: r, selectorIndex } = resolveMember(records, member);
    expect(r).toBeNull();
    expect(selectorIndex).toBe(-1);
  });
});

describe('computeIndex (ATPI worked example)', () => {
  // Reproduces ATPI's published worked example using their exact stated
  // blended values. Verifies the geometric-mean formula end-to-end without
  // touching record resolution. ATPI publishes 16 members and a final TPI of
  // $2.08; the page also shows the arithmetic-mean reference of $3.55.
  const atpiBlends = [
    { label: 'GPT-5.5', blended: 12.5000 },
    { label: 'Claude Opus 4.7', blended: 10.5000 },
    { label: 'Claude Sonnet 4.6', blended: 6.6000 },
    { label: 'GPT-5.4', blended: 6.2500 },
    { label: 'Gemini 2.5 Pro', blended: 4.0000 },
    { label: 'Gemini 3.5 Flash', blended: 3.7500 },
    { label: 'GLM 5.1', blended: 2.3000 },
    { label: 'Claude Haiku 4.5', blended: 2.2000 },
    { label: 'GPT-5.4 Mini', blended: 1.8750 },
    { label: 'Kimi K2.6', blended: 1.8650 },
    { label: 'Grok 4.3', blended: 1.6250 },
    { label: 'Qwen 3.6 Plus', blended: 1.2500 },
    { label: 'Mistral Large 3', blended: 0.8000 },
    { label: 'MiniMax M2.7', blended: 0.5700 },
    { label: 'GPT-5.4 Nano', blended: 0.5150 },
    { label: 'DeepSeek V4 Flash', blended: 0.1820 },
  ];

  test('reproduces ATPI $2.08 within 1c using published blended values', () => {
    const records: PriceRecord[] = atpiBlends.map((m, idx) =>
      record({
        family: `atpi-${idx}`,
        model_id: `synthetic/${idx}`,
        input_per_1k: m.blended / 1000,
        output_per_1k: m.blended / 1000,
      }),
    );

    const spec: IndexSpec = {
      name: 'atpi-worked-example',
      blend: { input: 0.5, output: 0.5 },
      published_value_usd_per_million: 2.08,
      members: atpiBlends.map((m, idx) => ({
        label: m.label,
        select: [{ family: `atpi-${idx}`, model_id_equals: `synthetic/${idx}` }],
        published_blended_per_million: m.blended,
      })),
    };

    const result = computeIndex(records, spec);
    expect(result.members_resolved).toBe(16);
    expect(result.geometric_mean_usd_per_million).not.toBeNull();
    expect(result.geometric_mean_usd_per_million ?? 0).toBeCloseTo(2.08, 1);
    expect(result.arithmetic_mean_usd_per_million ?? 0).toBeCloseTo(3.55, 1);
  });

  test('handles unresolved members without throwing', () => {
    const records: PriceRecord[] = [
      record({ family: 'gpt-5.5', model_id: 'openai/gpt-5.5', input_per_1k: 0.005, output_per_1k: 0.030 }),
    ];
    const spec: IndexSpec = {
      name: 'partial',
      blend: { input: 0.7, output: 0.3 },
      members: [
        { label: 'GPT-5.5', select: [{ model_id_equals: 'openai/gpt-5.5' }] },
        { label: 'Phantom', select: [{ model_id_equals: 'phantom/nope' }] },
      ],
    };
    const result = computeIndex(records, spec);
    expect(result.member_count).toBe(2);
    expect(result.members_resolved).toBe(1);
    expect(result.members[1]?.resolved).toBeNull();
    expect(result.geometric_mean_usd_per_million).toBeCloseTo(12.5, 6);
  });

  test('reports per-member divergence vs published when published is supplied', () => {
    const records: PriceRecord[] = [
      record({ family: 'gpt-5.5', model_id: 'openai/gpt-5.5', input_per_1k: 0.005, output_per_1k: 0.030 }),
    ];
    const spec: IndexSpec = {
      name: 'divergence',
      blend: { input: 0.7, output: 0.3 },
      members: [
        {
          label: 'GPT-5.5',
          select: [{ model_id_equals: 'openai/gpt-5.5' }],
          published_blended_per_million: 12.5,
        },
      ],
    };
    const result = computeIndex(records, spec);
    expect(result.members[0]?.divergence_pct).toBeCloseTo(0, 6);
  });

  test('captures index-level divergence when published_value_usd_per_million is set', () => {
    const records: PriceRecord[] = [
      record({ family: 'x', model_id: 'a/1', input_per_1k: 0.002, output_per_1k: 0.002 }),
    ];
    const spec: IndexSpec = {
      name: 'tiny',
      blend: { input: 0.5, output: 0.5 },
      published_value_usd_per_million: 2.0,
      members: [{ label: 'Only', select: [{ model_id_equals: 'a/1' }] }],
    };
    const result = computeIndex(records, spec);
    expect(result.geometric_mean_usd_per_million).toBeCloseTo(2.0, 6);
    expect(result.index_divergence_pct).toBeCloseTo(0, 6);
  });
});
