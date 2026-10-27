import { describe, expect, test } from 'bun:test';
import type { IndexMember, IndexResult } from './indices';
import { likeForLike } from './like-for-like';

function member(label: string, blended: number | null): IndexMember {
  return {
    label,
    resolved: blended === null
      ? null
      : { source: 'openrouter', model_id: `m/${label}`, region: null, input_per_1k: 1, output_per_1k: 1 },
    selector_matched: 0,
    blended_per_million: blended,
  } as IndexMember;
}

function index(name: string, members: IndexMember[]): IndexResult {
  return {
    name,
    blend: { input: 0.7, output: 0.3 },
    computed_at: '2026-10-27',
    data_source: 'data/current.json',
    member_count: members.length,
    members_resolved: members.filter((m) => m.resolved !== null).length,
    members_with_invalid_price: 0,
    members,
    geometric_mean_usd_per_million: 1,
    arithmetic_mean_usd_per_million: 1,
  } as IndexResult;
}

describe('likeForLike', () => {
  test('compares only the members every index resolves', () => {
    const result = likeForLike([
      index('a', [member('x', 1), member('y', 4), member('z', 4), member('only-a', 1000)]),
      index('b', [member('x', 2), member('y', 8), member('z', 8), member('only-a', null)]),
    ], 'a');

    expect(result?.commonMembers).toEqual(['x', 'y', 'z']);
    // Geometric mean of (1,4,4) = 2.52 and (2,8,8) = 5.04 — `only-a`, which
    // exists in just one index and would dominate, is excluded from both.
    expect(result?.meanByIndex.get('a')).toBeCloseTo(Math.cbrt(16), 9);
    expect(result?.meanByIndex.get('b')).toBeCloseTo(Math.cbrt(128), 9);
    expect(result?.pctVsBaselineByIndex.get('b')).toBeCloseTo(100, 9);
    expect(result?.pctVsBaselineByIndex.get('a')).toBeCloseTo(0, 9);
  });

  test('reproduces the artefact it exists to expose', () => {
    // `b` resolves only the expensive member, so its headline looks 10x
    // dearer — but on shared membership the two are identical.
    const result = likeForLike([
      index('cheap-roster', [member('budget', 1), member('frontier', 100)]),
      index('frontier-only', [member('budget', null), member('frontier', 100)]),
    ], 'cheap-roster');
    expect(result).toBeNull(); // only one shared member — refuses to compare
  });

  test('refuses to compare on fewer than three shared members', () => {
    expect(likeForLike([
      index('a', [member('x', 1), member('y', 1)]),
      index('b', [member('x', 1), member('y', 1)]),
    ], 'a')).toBeNull();
  });

  test('ignores members with a null, zero or non-finite blended price', () => {
    const result = likeForLike([
      index('a', [member('x', 1), member('y', 1), member('z', 1), member('bad', 0)]),
      index('b', [member('x', 1), member('y', 1), member('z', 1), member('bad', 1)]),
    ], 'a');
    expect(result?.commonMembers).toEqual(['x', 'y', 'z']);
  });

  test('returns null when the baseline is not among the indices', () => {
    expect(likeForLike([
      index('a', [member('x', 1), member('y', 1), member('z', 1)]),
      index('b', [member('x', 1), member('y', 1), member('z', 1)]),
    ], 'missing')).toBeNull();
  });

  test('returns null for fewer than two indices', () => {
    expect(likeForLike([index('a', [member('x', 1)])], 'a')).toBeNull();
  });
});
