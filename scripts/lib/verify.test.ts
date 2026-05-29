import { describe, expect, test } from 'bun:test';
import { FAMILY_NOISE_PATTERNS, findFamilyNoise } from './normalize.ts';
import type { PriceRecord } from './types.ts';
import { validateAll, validateRecord } from './verify.ts';

function makeRecord(overrides: Partial<PriceRecord>): PriceRecord {
  return {
    provider: 'anthropic',
    model_id: 'claude-opus-4-7',
    family: 'claude-opus-4-7',
    hyperscaler: 'direct',
    region: null,
    input_per_1k: 0.015,
    output_per_1k: 0.075,
    cached_input_per_1k: null,
    image_per_1k: null,
    context_window: 200_000,
    source: 'litellm',
    source_url: 'https://example.invalid/sentinel',
    fetched_at: '2026-05-29T17:00:00Z',
    ...overrides,
  };
}

describe('findFamilyNoise', () => {
  test('returns null for canonical family names', () => {
    expect(findFamilyNoise('claude-opus-4-7')).toBeNull();
    expect(findFamilyNoise('claude-opus-4-8')).toBeNull();
    expect(findFamilyNoise('gpt-4o')).toBeNull();
    expect(findFamilyNoise('gemini-2-5-pro')).toBeNull();
    expect(findFamilyNoise('nova-lite')).toBeNull();
  });

  const noiseCases: Array<[string, string]> = [
    ['databricks-claude-opus-4-1', 'databricks-prefix'],
    ['eu.anthropic.claude-opus-4-7', 'regional-bedrock-prefix'],
    ['us.anthropic.claude-opus-4-1', 'regional-bedrock-prefix'],
    ['global.anthropic.claude-opus-4-5', 'regional-bedrock-prefix'],
    ['au.anthropic.claude-haiku-4-5', 'regional-bedrock-prefix'],
    ['apac.amazon.nova-lite', 'regional-bedrock-prefix'],
    ['anthropic-claude-3-opus', 'dashed-anthropic-reexport'],
    ['anthropic-claude-3-5-sonnet', 'dashed-anthropic-reexport'],
    ['claude-opus-4-1@20250805', 'snapshot-pin-suffix'],
    ['claude-opus-4-7@default', 'snapshot-pin-suffix'],
    // bedrock tagged alias (-vN:M)
    ['claude-opus-4-6-v2:0', 'bedrock-tagged-alias'],
    ['claude-opus-4-7-v1:0', 'bedrock-tagged-alias'],
    // Claude bare bedrock alias (only fires on numeric-base Claude)
    ['claude-opus-4-6-v1', 'claude-bedrock-bare-alias'],
    ['claude-opus-4-7-v2', 'claude-bedrock-bare-alias'],
    // Nova bare bedrock alias
    ['nova-lite-v1', 'nova-bedrock-bare-alias'],
    ['nova-2-lite-v1', 'nova-bedrock-bare-alias'],
  ];

  test.each(noiseCases)('%s flagged as %s', (family: string, expected: string) => {
    const noise = findFamilyNoise(family);
    expect(noise).not.toBeNull();
    expect(noise?.name).toBe(expected);
  });

  test('every FAMILY_NOISE_PATTERNS entry has name + pattern + example', () => {
    for (const entry of FAMILY_NOISE_PATTERNS) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.example.length).toBeGreaterThan(0);
      expect(entry.pattern).toBeInstanceOf(RegExp);
    }
  });
});

describe('validateRecord — family-shape guard', () => {
  test('passes for canonical family', () => {
    expect(validateRecord(makeRecord({}))).toEqual([]);
  });

  test('fails when family matches a regional Bedrock prefix', () => {
    const errors = validateRecord(makeRecord({ family: 'eu.anthropic.claude-opus-4-9' }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('regional-bedrock-prefix'))).toBe(true);
    expect(errors.some((e) => e.includes('eu.anthropic.claude-opus-4-9'))).toBe(true);
  });

  test('fails when family matches a snapshot @-suffix', () => {
    const errors = validateRecord(makeRecord({ family: 'claude-opus-4-9@preview' }));
    expect(errors.some((e) => e.includes('snapshot-pin-suffix'))).toBe(true);
  });

  test('fails when family matches a Claude bare bedrock alias', () => {
    const errors = validateRecord(makeRecord({ family: 'claude-opus-4-9-v1' }));
    expect(errors.some((e) => e.includes('claude-bedrock-bare-alias'))).toBe(true);
  });

  test('fails when family matches a Nova bare bedrock alias', () => {
    const errors = validateRecord(makeRecord({ family: 'nova-lite-v1' }));
    expect(errors.some((e) => e.includes('nova-bedrock-bare-alias'))).toBe(true);
  });

  test('fails when family matches a tagged bedrock alias', () => {
    const errors = validateRecord(makeRecord({ family: 'claude-opus-4-9-v1:0' }));
    expect(errors.some((e) => e.includes('bedrock-tagged-alias'))).toBe(true);
  });

  // Negative cases — Codex P1 on PR #23 / mirror in PR #24's guard.
  // Canonical SKUs that look like they have a versioned alias but don't.
  test('passes for canonical -v\\d+ suffixes (Codex P1 mirror)', () => {
    for (const family of [
      'titan-embed-image-v1',
      'titan-text-express-v1',
      'claude-v1',
      'claude-instant-v1',
      'j2-mid-v1',
      'j2-ultra-v1',
      'deepseek-v3',
    ]) {
      expect(validateRecord(makeRecord({ family }))).toEqual([]);
    }
  });

  test('fails when family matches the dashed Anthropic re-export form', () => {
    const errors = validateRecord(makeRecord({ family: 'anthropic-claude-3-opus' }));
    expect(errors.some((e) => e.includes('dashed-anthropic-reexport'))).toBe(true);
  });

  test('fails when family starts with databricks-', () => {
    const errors = validateRecord(makeRecord({ family: 'databricks-claude-opus-4-9' }));
    expect(errors.some((e) => e.includes('databricks-prefix'))).toBe(true);
  });

  test('error message names the maintenance path so future readers know what to do', () => {
    const errors = validateRecord(makeRecord({ family: 'us.anthropic.claude-opus-4-9' }));
    const msg = errors.find((e) => e.includes('us.anthropic.claude-opus-4-9'));
    expect(msg).toBeDefined();
    expect(msg).toContain('scripts/lib/normalize.ts');
    expect(msg).toContain('normalize.test.ts');
  });
});

describe('validateAll — family-shape guard end-to-end', () => {
  test('a mix of canonical and noisy records reports just the noisy ones', () => {
    const records: PriceRecord[] = [
      makeRecord({}),
      makeRecord({ family: 'claude-opus-4-7' }),
      makeRecord({ family: 'eu.anthropic.claude-opus-4-9' }),
      makeRecord({ family: 'gpt-4o' }),
      makeRecord({ family: 'claude-opus-4-1@20250805' }),
    ];
    const result = validateAll(records);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]?.idx).toBe(2);
    expect(result.errors[1]?.idx).toBe(4);
  });

  // Codex P1 on PR #24: Diff.ts validates the prior history snapshot too,
  // and those frozen snapshots predate the canonicalization. The opt-out
  // enforceFamilyShape=false lets Diff skip the shape guard on history while
  // keeping the schema invariants (prices, enums, dates) in force.
  test('enforceFamilyShape=false skips the shape guard on noisy families', () => {
    const records: PriceRecord[] = [
      makeRecord({ family: 'eu.anthropic.claude-opus-4-7' }),
      makeRecord({ family: 'claude-opus-4-1@20250805' }),
      makeRecord({ family: 'nova-lite-v1' }),
    ];
    const result = validateAll(records, { enforceFamilyShape: false });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('enforceFamilyShape=false still catches schema invariant violations', () => {
    const records: PriceRecord[] = [
      // Family is noisy (would normally fail shape guard) but everything else
      // is fine — passes when shape guard is off.
      makeRecord({ family: 'eu.anthropic.claude-opus-4-7' }),
      // Family is canonical but input_per_1k is negative — schema violation,
      // must fail even with the shape guard off.
      makeRecord({ input_per_1k: -1 }),
    ];
    const result = validateAll(records, { enforceFamilyShape: false });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.idx).toBe(1);
    expect(result.errors[0]?.messages.some((m) => m.includes('input_per_1k'))).toBe(true);
  });
});
