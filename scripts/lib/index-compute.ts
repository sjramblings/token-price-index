import type { PriceRecord } from './types.ts';

export type Selector = {
  source?: string;
  hyperscaler?: string;
  family?: string;
  model_id_equals?: string;
  region?: string | null;
};

export type MemberSpec = {
  label: string;
  select: Selector[];
  published_blended_per_million?: number;
  note?: string;
};

export type BlendRatio = {
  input: number;
  output: number;
};

export type IndexSpec = {
  name: string;
  description?: string;
  published_url?: string;
  published_value_usd_per_million?: number;
  blend: BlendRatio;
  members: MemberSpec[];
};

export type ExcludedReason = 'unresolved' | 'non_positive_blended_price' | 'non_finite_blended_price';

export type ResolvedMember = {
  label: string;
  resolved: PriceRecord | null;
  selector_matched: number;
  blended_per_million: number | null;
  ln_blended: number | null;
  published_blended_per_million?: number;
  divergence_pct?: number;
  note?: string;
  excluded_reason?: ExcludedReason;
};

export type IndexResult = {
  name: string;
  description?: string;
  blend: BlendRatio;
  computed_at: string;
  data_source: string;
  member_count: number;
  members_resolved: number;
  members_with_invalid_price: number;
  members: ResolvedMember[];
  geometric_mean_usd_per_million: number | null;
  arithmetic_mean_usd_per_million: number | null;
  published_value_usd_per_million?: number;
  index_divergence_pct?: number;
};

function selectorMatches(record: PriceRecord, selector: Selector): boolean {
  if (selector.source !== undefined && record.source !== selector.source) {
    return false;
  }
  if (selector.hyperscaler !== undefined && record.hyperscaler !== selector.hyperscaler) {
    return false;
  }
  if (selector.family !== undefined && record.family !== selector.family) {
    return false;
  }
  if (selector.model_id_equals !== undefined && record.model_id !== selector.model_id_equals) {
    return false;
  }
  if (selector.region !== undefined && (record.region ?? null) !== (selector.region ?? null)) {
    return false;
  }
  return true;
}

export function resolveMember(records: PriceRecord[], member: MemberSpec): { record: PriceRecord | null; selectorIndex: number } {
  for (let i = 0; i < member.select.length; i++) {
    const selector = member.select[i];
    if (selector === undefined) {
      continue;
    }
    const found = records.find((r) => selectorMatches(r, selector));
    if (found !== undefined) {
      return { record: found, selectorIndex: i };
    }
  }
  return { record: null, selectorIndex: -1 };
}

export function blendedPerMillion(record: PriceRecord, blend: BlendRatio): number {
  const inputPerMillion = record.input_per_1k * 1000;
  const outputPerMillion = record.output_per_1k * 1000;
  return inputPerMillion * blend.input + outputPerMillion * blend.output;
}

export function computeIndex(records: PriceRecord[], spec: IndexSpec, options?: { dataSource?: string }): IndexResult {
  const dataSource = options?.dataSource ?? 'in-memory';
  const resolved: ResolvedMember[] = spec.members.map((member) => {
    const { record, selectorIndex } = resolveMember(records, member);
    if (record === null) {
      return {
        label: member.label,
        resolved: null,
        selector_matched: -1,
        blended_per_million: null,
        ln_blended: null,
        published_blended_per_million: member.published_blended_per_million,
        note: member.note,
        excluded_reason: 'unresolved',
      };
    }
    const blended = blendedPerMillion(record, spec.blend);
    if (!Number.isFinite(blended)) {
      return {
        label: member.label,
        resolved: record,
        selector_matched: selectorIndex,
        blended_per_million: blended,
        ln_blended: null,
        published_blended_per_million: member.published_blended_per_million,
        note: member.note,
        excluded_reason: 'non_finite_blended_price',
      };
    }
    if (blended <= 0) {
      return {
        label: member.label,
        resolved: record,
        selector_matched: selectorIndex,
        blended_per_million: blended,
        ln_blended: null,
        published_blended_per_million: member.published_blended_per_million,
        note: member.note,
        excluded_reason: 'non_positive_blended_price',
      };
    }
    const divergence = member.published_blended_per_million === undefined
      ? undefined
      : ((blended - member.published_blended_per_million) / member.published_blended_per_million) * 100;
    return {
      label: member.label,
      resolved: record,
      selector_matched: selectorIndex,
      blended_per_million: blended,
      ln_blended: Math.log(blended),
      published_blended_per_million: member.published_blended_per_million,
      divergence_pct: divergence,
      note: member.note,
    };
  });

  const membersResolved = resolved.filter((m) => m.resolved !== null).length;

  // Invalid-price members (resolved record but blended <= 0 or non-finite)
  // are a data-integrity failure, not a member-set evolution. A resolved
  // member with a non-positive price misrepresents the index if silently
  // dropped — the geometric mean becomes mathematically valid but the
  // member set the consumer thinks they're seeing is different from
  // reality. Hard-fail the index value in that case so the consumer
  // knows to investigate the underlying record (typically a free
  // preview SKU that shouldn't be in a commercial-only index).
  const invalidPriceMembers = resolved.filter(
    (m) =>
      m.excluded_reason === 'non_positive_blended_price' ||
      m.excluded_reason === 'non_finite_blended_price',
  );

  const usableLn = resolved
    .map((m) => m.ln_blended)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const geometricMean = invalidPriceMembers.length > 0 || usableLn.length === 0
    ? null
    : Math.exp(usableLn.reduce((acc, v) => acc + v, 0) / usableLn.length);

  const usableBlend = resolved
    .map((m) => m.blended_per_million)
    .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);

  const arithmeticMean = invalidPriceMembers.length > 0 || usableBlend.length === 0
    ? null
    : usableBlend.reduce((acc, v) => acc + v, 0) / usableBlend.length;

  const indexDivergence = (geometricMean === null || spec.published_value_usd_per_million === undefined)
    ? undefined
    : ((geometricMean - spec.published_value_usd_per_million) / spec.published_value_usd_per_million) * 100;

  return {
    name: spec.name,
    description: spec.description,
    blend: spec.blend,
    computed_at: new Date().toISOString(),
    data_source: dataSource,
    member_count: spec.members.length,
    members_resolved: membersResolved,
    members_with_invalid_price: invalidPriceMembers.length,
    members: resolved,
    geometric_mean_usd_per_million: geometricMean,
    arithmetic_mean_usd_per_million: arithmeticMean,
    published_value_usd_per_million: spec.published_value_usd_per_million,
    index_divergence_pct: indexDivergence,
  };
}
