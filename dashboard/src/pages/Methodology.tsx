interface SourceRow {
  source: string;
  url: string;
  auth: string;
  scope: string;
}

const sources: SourceRow[] = [
  {
    source: 'LiteLLM',
    url: 'raw.githubusercontent.com/BerriAI/litellm',
    auth: 'none',
    scope: '~2,700 models, hand-curated by LiteLLM maintainers from public pricing pages. Carries a litellm_provider field that tells us which deployment channel each entry belongs to.',
  },
  {
    source: 'OpenRouter',
    url: 'openrouter.ai/api/v1/models',
    auth: 'none',
    scope: '~360 models, live aggregator pricing.',
  },
  {
    source: 'AWS Price List Bulk',
    url: 'pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock',
    auth: 'none',
    scope: 'Per-region Bedrock SKUs across 10 GA regions. The billing engine’s published catalog — not the model registry the Bedrock runtime reads.',
  },
  {
    source: 'Azure Retail Prices',
    url: 'prices.azure.com/api/retail/prices',
    auth: 'none',
    scope: 'Azure OpenAI per-region SKUs, filtered to inference meters (not fine-tuning, batch, audio, image, embed).',
  },
];

interface RegionalRow {
  hyperscaler: string;
  precision: 'yes' | 'partial' | 'no';
  why: string;
}

const regional: RegionalRow[] = [
  {
    hyperscaler: 'direct',
    precision: 'no',
    why: 'The vendor publishes one price.',
  },
  {
    hyperscaler: 'aggregator',
    precision: 'no',
    why: 'Aggregators publish one price.',
  },
  {
    hyperscaler: 'aws',
    precision: 'partial',
    why: 'Yes for models in Price List Bulk; baseline-only for models that only LiteLLM tracks (see the publication-lag note below).',
  },
  {
    hyperscaler: 'azure',
    precision: 'yes',
    why: 'Azure Retail Prices ships per-region meters.',
  },
  {
    hyperscaler: 'gcp',
    precision: 'no',
    why: 'Google has no equivalent public no-auth feed for Vertex regional pricing. Cloud Billing Catalog API requires an API key, which violates the no-auth principle.',
  },
];

function PrecisionTag({ kind }: { kind: 'yes' | 'partial' | 'no' }): JSX.Element {
  const styles: Record<typeof kind, string> = {
    yes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    partial: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    no: 'bg-ink-300/20 text-ink-600 border-ink-300/40',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${styles[kind]}`}
    >
      {kind}
    </span>
  );
}

export default function Methodology(): JSX.Element {
  return (
    <div>
      <header className="mb-10">
        <p className="h-eyebrow mb-3">methodology</p>
        <h1 className="h-section">Where the data comes from, and what it isn&rsquo;t.</h1>
        <p className="mt-4 max-w-2xl text-ink-600">
          A read-only data product that mirrors public LLM pricing across direct providers,
          aggregators, and hyperscalers. Four upstream sources, normalized into one schema,
          published as <code className="font-mono text-ink-700">data/current.json</code> plus a
          dated history snapshot every day at 17:00 UTC.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-900 mb-4">Where the data comes from</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-ink-300/20">
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Source</th>
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">URL</th>
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Auth</th>
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Scope</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((row) => (
                <tr key={row.source} className="border-b border-ink-300/10 last:border-0">
                  <td className="px-4 py-3 align-top font-mono text-xs text-ink-900">{row.source}</td>
                  <td className="px-4 py-3 align-top font-mono text-[11px] text-ink-700">{row.url}</td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-ink-700">{row.auth}</td>
                  <td className="px-4 py-3 align-top text-sm text-ink-600">{row.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-900 mb-4">What &ldquo;hyperscaler&rdquo; means here</h2>
        <p className="max-w-2xl text-ink-600">
          Every record carries a <code className="font-mono text-ink-700">hyperscaler</code> tag:
          one of <code className="font-mono text-ink-700">direct</code>,{' '}
          <code className="font-mono text-ink-700">aggregator</code>,{' '}
          <code className="font-mono text-ink-700">aws</code>,{' '}
          <code className="font-mono text-ink-700">azure</code>, or{' '}
          <code className="font-mono text-ink-700">gcp</code>. For LiteLLM rows, the tag is derived
          from LiteLLM&rsquo;s own <code className="font-mono text-ink-700">litellm_provider</code>{' '}
          metadata field, not from pattern-matching the model ID string. For AWS / Azure rows, the
          tag comes from the fetcher itself.
        </p>
        <p className="mt-3 max-w-2xl text-ink-600">
          Adding a new LiteLLM provider to the classifier is a one-line allowlist change with a
          paired test. The failure mode (an unrecognized provider falls to{' '}
          <code className="font-mono text-ink-700">direct</code>) is safe — it doesn&rsquo;t
          misclassify, it under-classifies.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-900 mb-4">The Bedrock availability vs Price List publication gap</h2>
        <p className="max-w-2xl text-ink-600">
          A model can be <em>invocable</em> on Bedrock without being in the AWS Price List Bulk
          API. The most current example is Claude Opus 4.7 — you can call it today via
          cross-region inference profiles like{' '}
          <code className="font-mono text-ink-700">au.anthropic.claude-opus-4-7</code> or{' '}
          <code className="font-mono text-ink-700">global.anthropic.claude-opus-4-7</code>, but it
          doesn&rsquo;t appear anywhere in our 11 ingested AWS regional offer files.
        </p>
        <p className="mt-3 max-w-2xl text-ink-600">
          Two different AWS APIs are at play:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-600">
          <li>
            <strong className="text-ink-900">Bedrock runtime</strong> — the service registry
            that <code className="font-mono text-ink-700">InvokeModel</code> reads. Updates when
            AWS makes a model available.
          </li>
          <li>
            <strong className="text-ink-900">Price List Bulk API</strong> — the billing
            engine&rsquo;s published catalog. Typically lags days to weeks behind GA, and only
            includes SKUs that have a publishable on-demand list price.
          </li>
        </ul>
        <p className="mt-3 max-w-2xl text-ink-600">
          When a new model is invocable but not yet in the bulk catalog, the row you see in our
          dataset comes from LiteLLM’s hand-curated table, with{' '}
          <code className="font-mono text-ink-700">region: null</code> (LiteLLM doesn’t carry
          region). The price is the global baseline from the vendor’s public pricing page,
          not a per-region rate. We pick this up automatically the next time AWS publishes the
          SKU.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-900 mb-4">Regional precision</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-ink-300/20">
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Hyperscaler</th>
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Per-region price?</th>
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Why</th>
              </tr>
            </thead>
            <tbody>
              {regional.map((row) => (
                <tr key={row.hyperscaler} className="border-b border-ink-300/10 last:border-0">
                  <td className="px-4 py-3 align-top font-mono text-xs text-ink-900">{row.hyperscaler}</td>
                  <td className="px-4 py-3 align-top"><PrecisionTag kind={row.precision} /></td>
                  <td className="px-4 py-3 align-top text-sm text-ink-600">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-900 mb-4">Refresh cadence</h2>
        <p className="max-w-2xl text-ink-600">
          Daily, <code className="font-mono text-ink-700">0 17 * * *</code> UTC, via GitHub
          Actions. Each refresh commits a new{' '}
          <code className="font-mono text-ink-700">data/current.json</code> and a dated snapshot to{' '}
          <code className="font-mono text-ink-700">data/history/YYYY-MM-DD.json</code>. Git history
          is the time-series database.
        </p>
        <p className="mt-3 max-w-2xl text-ink-600">
          No hourly polling, no real-time. Upstream APIs don’t change sub-daily; faster
          cadence would just write near-identical commits and pollute the time-series signal.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-900 mb-4">What this project doesn&rsquo;t do</h2>
        <ul className="list-disc space-y-2 pl-6 text-ink-600">
          <li>No provider API keys. Every read operation is public HTTPS without authentication.</li>
          <li>No AWS, Azure, or GCP infrastructure is provisioned for this project itself.</li>
          <li>No hourly cron. Daily is a hard rule.</li>
          <li>No Vertex AI regional pricing — no public no-auth Google source exists today.</li>
          <li>No private price sheets, billing-account discounts, or per-customer rates.</li>
          <li>No write operations against any upstream system.</li>
        </ul>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight text-ink-900 mb-4">Source code</h2>
        <p className="max-w-2xl text-ink-600">
          Code, data, and full commit history are public at{' '}
          <a
            href="https://github.com/sjramblings/token-price-index"
            target="_blank"
            rel="noreferrer"
            className="text-accent-500 underline-offset-2 transition hover:underline"
          >
            github.com/sjramblings/token-price-index
          </a>
          . The unified schema (<code className="font-mono text-ink-700">PriceRecord</code>) and
          anti-criteria are documented in{' '}
          <code className="font-mono text-ink-700">SPEC.md</code>.
        </p>
      </section>
    </div>
  );
}
