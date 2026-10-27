import { deriveModelOwner } from './landscape';
import { cacheSavings, channelSpreads, regionalSpreads } from './signals';
import type { PriceRecord } from './types';

/**
 * Opening moves for the Compare page.
 *
 * Compare was a blank slate: "search above to start comparing". That only
 * works if you already know which two deployments are worth putting side by
 * side, which is the thing the catalogue is supposed to tell you. These are
 * comparisons the data says are interesting, each one click away.
 *
 * Built on the same `signals` functions that drive the Explorer panels, so the
 * two pages cannot drift apart or disagree about which spread is widest.
 */

export interface CompareSuggestion {
  id: string;
  /** Short chip label. */
  label: string;
  /** One line on why this pairing is worth looking at. */
  detail: string;
  records: PriceRecord[];
}

/** Identity of a record within a Compare selection. Mirrors Compare's own key. */
export function suggestionRecordKey(record: PriceRecord): string {
  return `${record.source}:${record.model_id}:${record.region ?? ''}`;
}

function findRecord(
  records: PriceRecord[],
  match: (record: PriceRecord) => boolean,
): PriceRecord | undefined {
  return records.find(match);
}

export function buildCompareSuggestions(records: PriceRecord[]): CompareSuggestion[] {
  if (records.length === 0) {
    return [];
  }

  const suggestions: CompareSuggestion[] = [];

  // 1. The model where the region you deploy in costs the most.
  const region = regionalSpreads(records)[0];
  if (region !== undefined) {
    const cheapest = findRecord(records, (r) => r.model_id === region.modelId
      && r.hyperscaler === region.hyperscaler && r.region === region.cheapestRegion);
    const dearest = findRecord(records, (r) => r.model_id === region.modelId
      && r.hyperscaler === region.hyperscaler && r.region === region.dearestRegion);
    if (cheapest !== undefined && dearest !== undefined) {
      suggestions.push({
        id: 'widest-region',
        label: 'Widest region gap',
        detail: `${region.modelId} costs ${region.spreadPct.toFixed(0)}% more in `
          + `${region.dearestRegion} than ${region.cheapestRegion}`,
        records: [cheapest, dearest],
      });
    }
  }

  // 2. The family where the route you take costs the most. Both ends are real
  //    deployments, named, so the comparison shows what it is actually
  //    contrasting rather than an abstract "direct vs azure".
  const route = channelSpreads(records)[0];
  if (route !== undefined) {
    const cheapest = findRecord(records, (r) => r.family === route.family
      && r.hyperscaler === route.cheapestChannel && r.input_per_1k === route.cheapestPer1k);
    const dearest = findRecord(records, (r) => r.family === route.family
      && r.hyperscaler === route.dearestChannel && r.input_per_1k === route.dearestPer1k);
    if (cheapest !== undefined && dearest !== undefined) {
      suggestions.push({
        id: 'widest-route',
        label: 'Widest route gap',
        detail: `${route.family} via ${route.dearestProvider} costs `
          + `${route.spreadPct.toFixed(0)}% more than via ${route.cheapestProvider}`,
        records: [cheapest, dearest],
      });
    }
  }

  // 3. Where prompt caching saves the most actual money.
  // One per family: the raw ranking returns `gpt-5.4-pro`,
  // `gpt-5.4-pro-2026-03-05`, `gpt-5.5-pro` — three snapshots of one model,
  // which is a list, not a comparison.
  const seenCacheFamilies = new Set<string>();
  const cached = cacheSavings(records)
    .filter((saving) => {
      const record = findRecord(records, (r) => r.model_id === saving.modelId
        && r.hyperscaler === saving.hyperscaler);
      if (record === undefined || seenCacheFamilies.has(record.family)) {
        return false;
      }
      seenCacheFamilies.add(record.family);
      return true;
    })
    .slice(0, 3);
  const cachedRecords = cached
    .map((saving) => findRecord(records, (r) => r.model_id === saving.modelId
      && r.hyperscaler === saving.hyperscaler && r.cached_input_per_1k === saving.cachedPer1k))
    .filter((record): record is PriceRecord => record !== undefined);
  if (cachedRecords.length >= 2) {
    const best = cached[0];
    suggestions.push({
      id: 'cache-leaders',
      label: 'Best cache discounts',
      detail: best === undefined
        ? 'Deployments with the deepest prompt-cache savings'
        : `${best.modelId} saves ${best.savingPct.toFixed(0)}% on a cache hit`,
      records: cachedRecords,
    });
  }

  // 4. The cheapest route to each of the most broadly available families.
  //
  //    Ranked by how many distinct CHANNELS carry the family, not by record
  //    count. Counting records measured regional coverage instead of breadth,
  //    so Azure-only SKUs with a row per region won the list and the opening
  //    comparison was `gpt-4o-1120-inp-data-zone` against
  //    `gpt-4.1-inp-data-zone` — two Azure data-zone meters, which is not a
  //    comparison anyone wants to start from.
  const byFamily = new Map<string, PriceRecord>();
  const familyChannels = new Map<string, Set<string>>();
  for (const record of records) {
    if (record.alias_of !== null || record.input_per_1k <= 0) {
      continue;
    }
    const channels = familyChannels.get(record.family) ?? new Set<string>();
    channels.add(record.hyperscaler);
    familyChannels.set(record.family, channels);
    const best = byFamily.get(record.family);
    if (best === undefined || record.input_per_1k < best.input_per_1k) {
      byFamily.set(record.family, record);
    }
  }
  // One family per owner. Ranking on channel breadth alone returned
  // claude-fable-5, claude-fable-5-1, claude-haiku-4-5 and claude-haiku-5-5 —
  // four Anthropic models, which compares Anthropic against itself.
  const seenOwners = new Set<string>();
  const widest: PriceRecord[] = [];
  for (const [family] of [...familyChannels.entries()]
    .sort((left, right) => right[1].size - left[1].size
      || left[0].localeCompare(right[0]))) {
    const record = byFamily.get(family);
    if (record === undefined) {
      continue;
    }
    const owner = deriveModelOwner(record);
    if (owner === 'unattributed' || seenOwners.has(owner)) {
      continue;
    }
    seenOwners.add(owner);
    widest.push(record);
    if (widest.length === 4) {
      break;
    }
  }
  if (widest.length >= 2) {
    suggestions.push({
      id: 'most-carried',
      label: 'Most widely carried',
      detail: `Cheapest route to the most broadly carried model from ${widest.length} different owners`,
      records: widest,
    });
  }

  return suggestions;
}
