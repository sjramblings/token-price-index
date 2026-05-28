import type { Hyperscaler, PriceRecord } from './types';

/**
 * Derive the company that owns a model from its family name. The raw
 * `provider` field on PriceRecord is LiteLLM's routing label (`bedrock`,
 * `bedrock_converse`, `azure`, `fireworks_ai`, ...) and would produce
 * tautological flows like `bedrock -> aws` in the Sankey, or splinter
 * Anthropic into three series in the streamgraph. Family names carry the
 * actual ownership signal (`claude-*` is Anthropic regardless of route).
 */
export function deriveModelOwner(record: Pick<PriceRecord, 'family' | 'provider'>): string {
  const family = record.family.toLowerCase();
  if (family.startsWith('claude')) return 'anthropic';
  if (family.startsWith('gpt')
    || family.startsWith('o1')
    || family.startsWith('o3')
    || family.startsWith('o4')
    || family.startsWith('chatgpt')
    || family.startsWith('text-davinci')
    || family.startsWith('text-embedding')
    || family.startsWith('text-curie')
    || family.startsWith('text-babbage')
    || family.startsWith('text-ada')
    || family.startsWith('dall-e')
    || family.startsWith('whisper')
    || family.startsWith('tts')
    || family.startsWith('omni-')
    || family.startsWith('davinci')
    || family.startsWith('babbage')) return 'openai';
  if (family.startsWith('gemini')
    || family.startsWith('gemma')
    || family.startsWith('palm')
    || family.startsWith('text-bison')
    || family.startsWith('chat-bison')
    || family.startsWith('code-bison')
    || family.startsWith('codechat-bison')
    || family.startsWith('imagen')) return 'google';
  if (family.startsWith('llama')
    || family.startsWith('codellama')) return 'meta';
  if (family.startsWith('mistral')
    || family.startsWith('mixtral')
    || family.startsWith('codestral')
    || family.startsWith('pixtral')
    || family.startsWith('ministral')) return 'mistral';
  if (family.startsWith('nova')
    || family.startsWith('titan')
    || family.startsWith('rerank')) return 'amazon';
  if (family.startsWith('phi')) return 'microsoft';
  if (family.startsWith('command')
    || family.startsWith('embed-english')
    || family.startsWith('embed-multilingual')
    || family.startsWith('rerank-english')
    || family.startsWith('rerank-multilingual')
    || family.startsWith('aya')) return 'cohere';
  if (family.startsWith('grok')) return 'xai';
  if (family.startsWith('deepseek')) return 'deepseek';
  if (family.startsWith('qwen')) return 'alibaba';
  if (family.startsWith('jamba')) return 'ai21';
  if (family.startsWith('stable-diffusion')
    || family.startsWith('sd3')
    || family.startsWith('sdxl')) return 'stability';
  if (family.startsWith('falcon')) return 'tii';
  const provider = record.provider.toLowerCase();
  if (provider === 'bedrock' || provider === 'bedrock_converse') return 'amazon-bedrock-hosted';
  if (provider === 'azure' || provider === 'azure_ai') return 'azure-hosted';
  if (provider === 'vertex_ai' || provider.startsWith('vertex_ai-')) return 'google';
  if (provider === 'fireworks_ai') return 'fireworks';
  if (provider === 'together_ai' || provider === 'togetherai') return 'together';
  if (provider === 'openrouter') return 'openrouter';
  if (provider === 'deepinfra') return 'deepinfra';
  if (provider === 'groq') return 'groq';
  if (provider === 'replicate') return 'replicate';
  if (provider === 'perplexity') return 'perplexity';
  return record.provider;
}

export type ProviderSharePoint = {
  date: string;
  total: number;
} & Record<string, number | string>;

export type ProviderShareSeries = {
  providers: string[];
  points: ProviderSharePoint[];
};

export type AvailabilityRow = {
  family: string;
  provider: string;
  hyperscalers: Hyperscaler[];
  hyperscalerCount: number;
  modelCount: number;
};

export type SankeyDatum = {
  nodes: { name: string; kind: 'provider' | 'hyperscaler' }[];
  links: { source: number; target: number; value: number }[];
};

const FLOW_SEPARATOR = '::';
const OTHER_BUCKET = 'other';

function pickTopOwners(records: PriceRecord[], topN: number): Set<string> {
  const counts = new Map<string, Set<string>>();
  for (const record of records) {
    const owner = deriveModelOwner(record);
    const set = counts.get(owner) ?? new Set<string>();
    set.add(record.model_id);
    counts.set(owner, set);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1].size - a[1].size);
  return new Set(sorted.slice(0, topN).map(([owner]) => owner));
}

/**
 * Group history snapshots by date+owner and emit a row per date with a
 * column per owner holding that owner's share of the snapshot's unique
 * model count. Output is shaped for Recharts <AreaChart> stacked rendering.
 *
 * The owner cardinality is capped at `topOwners` to keep the legend readable;
 * everything below the cap is folded into "other". Sizing is computed against
 * the latest snapshot — owners that dominate today stay distinct, owners that
 * were transient in earlier snapshots fold in.
 */
export function buildProviderShareSeries(
  snapshots: { date: string; records: PriceRecord[] }[],
  topOwners = 12,
): ProviderShareSeries {
  if (snapshots.length === 0) {
    return { providers: [], points: [] };
  }

  const latest = snapshots[snapshots.length - 1];
  const keepers = pickTopOwners(latest.records, topOwners);

  const providerSet = new Set<string>();
  for (const owner of keepers) {
    providerSet.add(owner);
  }
  let needsOther = false;
  for (const snapshot of snapshots) {
    for (const record of snapshot.records) {
      const owner = deriveModelOwner(record);
      if (!keepers.has(owner)) {
        needsOther = true;
      }
    }
  }
  if (needsOther) {
    providerSet.add(OTHER_BUCKET);
  }
  const providers = [...providerSet].sort((a, b) => {
    if (a === OTHER_BUCKET) return 1;
    if (b === OTHER_BUCKET) return -1;
    return a.localeCompare(b);
  });

  const points: ProviderSharePoint[] = snapshots.map((snapshot) => {
    const counts = new Map<string, Set<string>>();
    for (const record of snapshot.records) {
      const owner = deriveModelOwner(record);
      const bucket = keepers.has(owner) ? owner : OTHER_BUCKET;
      const set = counts.get(bucket) ?? new Set<string>();
      set.add(record.model_id);
      counts.set(bucket, set);
    }

    let total = 0;
    for (const set of counts.values()) {
      total += set.size;
    }

    const point: ProviderSharePoint = { date: snapshot.date, total };
    for (const provider of providers) {
      const set = counts.get(provider);
      point[provider] = set === undefined || total === 0 ? 0 : set.size / total;
    }
    return point;
  });

  return { providers, points };
}

/**
 * Collapse current pricing data into a model-family × hyperscaler matrix and
 * sort by how many hyperscalers carry each family. The top of the list = the
 * de-facto commodity models; the bottom = single-substrate exclusives.
 */
export function buildAvailabilityRows(records: PriceRecord[]): AvailabilityRow[] {
  const byFamily = new Map<string, {
    provider: string;
    hyperscalers: Set<Hyperscaler>;
    models: Set<string>;
  }>();

  for (const record of records) {
    const owner = deriveModelOwner(record);
    const existing = byFamily.get(record.family) ?? {
      provider: owner,
      hyperscalers: new Set<Hyperscaler>(),
      models: new Set<string>(),
    };
    existing.hyperscalers.add(record.hyperscaler);
    existing.models.add(record.model_id);
    byFamily.set(record.family, existing);
  }

  const rows: AvailabilityRow[] = [...byFamily.entries()].map(([family, value]) => ({
    family,
    provider: value.provider,
    hyperscalers: [...value.hyperscalers].sort(),
    hyperscalerCount: value.hyperscalers.size,
    modelCount: value.models.size,
  }));

  rows.sort((a, b) => {
    if (a.hyperscalerCount !== b.hyperscalerCount) {
      return b.hyperscalerCount - a.hyperscalerCount;
    }
    if (a.modelCount !== b.modelCount) {
      return b.modelCount - a.modelCount;
    }
    return a.family.localeCompare(b.family);
  });

  return rows;
}

/**
 * Build an owner→hyperscaler Sankey from current records. Node indices are
 * stable: owners first (sorted), then hyperscalers (sorted). Link weight is
 * the count of distinct model_ids flowing from that owner through that
 * hyperscaler — the literal "how many SKUs route this way" picture.
 *
 * Owner cardinality is capped at `topOwners`; everything below the cap is
 * folded into an "other" owner node so the chart stays readable.
 */
export function buildProviderHyperscalerSankey(
  records: PriceRecord[],
  topOwners = 18,
): SankeyDatum {
  const keepers = pickTopOwners(records, topOwners);

  const ownerSet = new Set<string>();
  const hyperscalerSet = new Set<Hyperscaler>();
  const flow = new Map<string, Set<string>>();

  for (const record of records) {
    const owner = deriveModelOwner(record);
    const bucket = keepers.has(owner) ? owner : OTHER_BUCKET;
    ownerSet.add(bucket);
    hyperscalerSet.add(record.hyperscaler);
    const key = `${bucket}${FLOW_SEPARATOR}${record.hyperscaler}`;
    const set = flow.get(key) ?? new Set<string>();
    set.add(record.model_id);
    flow.set(key, set);
  }

  const owners = [...ownerSet].sort((a, b) => {
    if (a === OTHER_BUCKET) return 1;
    if (b === OTHER_BUCKET) return -1;
    return a.localeCompare(b);
  });
  const hyperscalers = [...hyperscalerSet].sort();
  const ownerIndex = new Map(owners.map((name, index) => [name, index]));
  const hyperscalerIndex = new Map(
    hyperscalers.map((name, index) => [name, owners.length + index] as const),
  );

  const nodes: SankeyDatum['nodes'] = [
    ...owners.map((name) => ({ name, kind: 'provider' as const })),
    ...hyperscalers.map((name) => ({ name, kind: 'hyperscaler' as const })),
  ];

  const links: SankeyDatum['links'] = [];
  for (const [key, models] of flow.entries()) {
    const separatorIndex = key.indexOf(FLOW_SEPARATOR);
    if (separatorIndex < 0) {
      continue;
    }
    const owner = key.slice(0, separatorIndex);
    const hyperscaler = key.slice(separatorIndex + FLOW_SEPARATOR.length) as Hyperscaler;
    const source = ownerIndex.get(owner);
    const target = hyperscalerIndex.get(hyperscaler);
    if (source === undefined || target === undefined) {
      continue;
    }
    links.push({ source, target, value: models.size });
  }

  links.sort((a, b) => b.value - a.value);

  return { nodes, links };
}
