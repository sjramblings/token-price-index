import type { Hyperscaler, PriceRecord } from './types';

/**
 * Derive the company that owns a model from its family name. The raw
 * `provider` field on PriceRecord is LiteLLM's routing label (`bedrock`,
 * `bedrock_converse`, `azure`, `fireworks_ai`, ...) and would produce
 * tautological flows like `bedrock -> aws` in the Sankey, or splinter
 * Anthropic into three series in the streamgraph. Family names carry the
 * actual ownership signal (`claude-*` is Anthropic regardless of route).
 */
/**
 * Prefix match that will not run on into a longer word.
 *
 * A bare `family.startsWith('command')` claimed `commander-x` for Cohere, and
 * `startsWith('phi')` would claim anything beginning "phi". Digits are still
 * allowed to follow, so `phi3` and `gpt4` keep matching — it is only a
 * continuing LETTER that means we have hit a different word.
 */
function startsWithToken(family: string, token: string): boolean {
  return family.startsWith(token) && !/^[a-z]/.test(family.slice(token.length));
}

export function deriveModelOwner(record: Pick<PriceRecord, 'family' | 'provider'>): string {
  const family = record.family.toLowerCase();
  if (startsWithToken(family, 'claude')) return 'anthropic';
  if (startsWithToken(family, 'gpt')
    || startsWithToken(family, 'o1')
    || startsWithToken(family, 'o3')
    || startsWithToken(family, 'o4')
    || startsWithToken(family, 'chatgpt')
    || startsWithToken(family, 'text-davinci')
    || startsWithToken(family, 'text-embedding')
    || startsWithToken(family, 'text-curie')
    || startsWithToken(family, 'text-babbage')
    || startsWithToken(family, 'text-ada')
    || startsWithToken(family, 'dall-e')
    || startsWithToken(family, 'whisper')
    || startsWithToken(family, 'tts')
    || startsWithToken(family, 'omni-')
    || startsWithToken(family, 'davinci')
    || startsWithToken(family, 'babbage')) return 'openai';
  if (startsWithToken(family, 'gemini')
    || startsWithToken(family, 'gemma')
    || startsWithToken(family, 'palm')
    || startsWithToken(family, 'text-bison')
    || startsWithToken(family, 'chat-bison')
    || startsWithToken(family, 'code-bison')
    || startsWithToken(family, 'codechat-bison')
    || startsWithToken(family, 'imagen')) return 'google';
  if (startsWithToken(family, 'llama')
    || startsWithToken(family, 'codellama')) return 'meta';
  if (startsWithToken(family, 'mistral')
    || startsWithToken(family, 'mixtral')
    || startsWithToken(family, 'codestral')
    || startsWithToken(family, 'pixtral')
    || startsWithToken(family, 'ministral')) return 'mistral';
  if (startsWithToken(family, 'nova')
    || startsWithToken(family, 'titan')
    || startsWithToken(family, 'rerank')) return 'amazon';
  if (startsWithToken(family, 'phi')) return 'microsoft';
  if (startsWithToken(family, 'command')
    || startsWithToken(family, 'embed-english')
    || startsWithToken(family, 'embed-multilingual')
    || startsWithToken(family, 'rerank-english')
    || startsWithToken(family, 'rerank-multilingual')
    || startsWithToken(family, 'aya')) return 'cohere';
  if (startsWithToken(family, 'grok')) return 'xai';
  if (startsWithToken(family, 'deepseek')) return 'deepseek';
  if (startsWithToken(family, 'qwen')) return 'alibaba';
  if (startsWithToken(family, 'jamba')) return 'ai21';
  if (startsWithToken(family, 'stable-diffusion')
    || startsWithToken(family, 'sd3')
    || startsWithToken(family, 'sdxl')) return 'stability';
  if (startsWithToken(family, 'falcon')) return 'tii';
  // Owners that were missing, measured from the records that fell through:
  // glm/zai 165, minimax 80, kimi 75, nemotron 40, and the long tail below.
  if (startsWithToken(family, 'glm') || startsWithToken(family, 'zai')) return 'z-ai';
  if (startsWithToken(family, 'minimax')) return 'minimax';
  if (startsWithToken(family, 'kimi') || startsWithToken(family, 'moonshot')) return 'moonshot';
  if (startsWithToken(family, 'nemotron')) return 'nvidia';
  if (startsWithToken(family, 'voyage')) return 'voyage';
  if (startsWithToken(family, 'doubao') || startsWithToken(family, 'seed-')) return 'bytedance';
  if (startsWithToken(family, 'mimo')) return 'xiaomi';
  if (startsWithToken(family, 'sonar') || startsWithToken(family, 'pplx')) return 'perplexity';
  if (startsWithToken(family, 'hunyuan')) return 'tencent';
  if (startsWithToken(family, 'ernie')) return 'baidu';
  if (startsWithToken(family, 'yi-')) return '01-ai';
  if (startsWithToken(family, 'internlm')) return 'shanghai-ai-lab';
  if (startsWithToken(family, 'granite')) return 'ibm';
  if (startsWithToken(family, 'solar')) return 'upstage';
  if (startsWithToken(family, 'inkling')) return 'thinkingmachines';
  if (startsWithToken(family, 'ling-') || startsWithToken(family, 'ring-')) return 'inclusionai';
  if (startsWithToken(family, 'laguna')) return 'poolside';
  if (startsWithToken(family, 'lfm')) return 'liquid';

  // Second pass: a distinctive brand token anywhere in the family, on word
  // boundaries. The prefix chain above misses relabelled variants — resellers
  // ship `coding-glm-5.3`, `cc-glm-5.1`, `coding-kimi-k3`, which are plainly
  // Z.ai and Moonshot models wearing a task prefix. This recovers 106 of the
  // 304 records the prefix chain could not place; the remainder (agnes,
  // longcat, hy3, step-3.7) are genuinely unrecognised and stay that way.
  //
  // Word boundaries matter: a bare substring test would read "command" inside
  // "commander" and "phi" inside "sophia".
  for (const [token, owner] of BRAND_TOKENS) {
    if (new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(family)) {
      return owner;
    }
  }

  const provider = record.provider.toLowerCase();
  if (provider === 'vertex_ai' || provider.startsWith('vertex_ai-')) return 'google';

  // A HOST is not an OWNER. The fallback used to return the routing label,
  // so a Sankey of "provider → hyperscaler" showed `fireworks → direct` with
  // 320 SKUs as though Fireworks authored those models — it hosts Llama,
  // Qwen and DeepSeek weights it did not train. 36% of records resolved to a
  // name like this. Saying "unattributed" is less satisfying than a confident
  // wrong answer and is what the data actually supports.
  if (MODEL_HOSTS.has(provider)) {
    return 'unattributed';
  }
  return record.provider;
}

/**
 * Distinctive model-name tokens and who trained them. Ordered most to least
 * specific, since the first match wins.
 */
const BRAND_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['nemotron', 'nvidia'],
  ['hunyuan', 'tencent'],
  ['minimax', 'minimax'],
  ['deepseek', 'deepseek'],
  ['doubao', 'bytedance'],
  ['mistral', 'mistral'],
  ['command', 'cohere'],
  ['claude', 'anthropic'],
  ['gemini', 'google'],
  ['gemma', 'google'],
  ['llama', 'meta'],
  ['qwen', 'alibaba'],
  ['kimi', 'moonshot'],
  ['grok', 'xai'],
  ['mimo', 'xiaomi'],
  ['glm', 'z-ai'],
  ['phi', 'microsoft'],
  ['gpt', 'openai'],
];

/**
 * Providers that serve other companies' models. Never an owner — when the
 * family name does not identify who trained the model, these resolve to
 * `unattributed` rather than lending their name to someone else's work.
 */
const MODEL_HOSTS: ReadonlySet<string> = new Set([
  'bedrock', 'bedrock_converse', 'bedrock_mantle', 'sagemaker',
  'azure', 'azure_ai', 'azure_text',
  'openrouter', 'vercel_ai_gateway', 'llamagate', 'aiml', 'aihubmix',
  'fireworks_ai', 'together_ai', 'togetherai', 'deepinfra', 'novita',
  'groq', 'replicate', 'anyscale', 'nebius', 'cloudflare', 'databricks',
  'watsonx', 'sambanova', 'cerebras', 'hyperbolic', 'lepton', 'octoai',
  'ollama', 'lm_studio', 'vllm', 'openai_like', 'custom_openai',
]);

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
