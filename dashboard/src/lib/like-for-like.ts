import type { IndexResult } from './indices';

/**
 * Compare indices on the members they all share.
 *
 * Each channel index is averaged over whatever members that channel actually
 * carries, and the channels carry very different subsets — Bedrock resolves 7
 * of 16, Azure 11, the aggregator 15. Putting those headlines side by side
 * invites a comparison the numbers cannot support, and the site did exactly
 * that: it claimed cloud channels run "roughly 50–90% above aggregator
 * pricing".
 *
 * On the six members every channel carries, the spread is 0–3%. The published
 * gap was almost entirely a membership artefact: Bedrock's roster skews to
 * frontier models because that is what Bedrock lists, so its mean is high for
 * reasons that have nothing to do with Bedrock's prices.
 *
 * This restricts every index to the intersection of their resolved members and
 * recomputes the same geometric mean over it, which is the only way these
 * numbers are comparable.
 */

export interface LikeForLikeResult {
  /** Labels present and priced in every index compared. */
  commonMembers: string[];
  /** Index name → geometric mean over `commonMembers` only. */
  meanByIndex: Map<string, number>;
  /** Index name → percent vs the baseline index. Baseline itself is 0. */
  pctVsBaselineByIndex: Map<string, number>;
  baseline: string;
}

function geometricMean(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sumOfLogs = values.reduce((total: number, value: number) => total + Math.log(value), 0);
  return Math.exp(sumOfLogs / values.length);
}

export function likeForLike(
  indices: IndexResult[],
  baseline: string,
): LikeForLikeResult | null {
  if (indices.length < 2) {
    return null;
  }

  const resolvedLabels = indices.map((index) => new Set(
    index.members
      .filter((member) => member.resolved !== null
        && typeof member.blended_per_million === 'number'
        && Number.isFinite(member.blended_per_million)
        && member.blended_per_million > 0)
      .map((member) => member.label),
  ));

  const first = resolvedLabels[0];
  if (first === undefined) {
    return null;
  }
  const commonMembers = [...first]
    .filter((label) => resolvedLabels.every((labels) => labels.has(label)))
    .sort();

  // Two members is not a comparison, it is a coincidence.
  if (commonMembers.length < 3) {
    return null;
  }

  const meanByIndex = new Map<string, number>();
  for (const index of indices) {
    const values = index.members
      .filter((member) => commonMembers.includes(member.label))
      .map((member) => member.blended_per_million)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
    if (values.length === commonMembers.length) {
      meanByIndex.set(index.name, geometricMean(values));
    }
  }

  const base = meanByIndex.get(baseline);
  if (base === undefined || !Number.isFinite(base) || base <= 0) {
    return null;
  }

  const pctVsBaselineByIndex = new Map<string, number>();
  for (const [name, mean] of meanByIndex) {
    pctVsBaselineByIndex.set(name, (mean / base - 1) * 100);
  }

  return { commonMembers, meanByIndex, pctVsBaselineByIndex, baseline };
}
