import { useEffect, useMemo, useState } from 'react';
import { loadCurrent } from '../lib/data';
import { fmt, formatPricePer1K, formatPricePerMillion, formatRegion } from '../lib/format';
import type { PriceRecord } from '../lib/types';

const MAX_TOKENS = 1_000_000;
const MAX_RESULTS = 12;

function recordKey(record: PriceRecord): string {
  return `${record.source}:${record.model_id}:${record.region ?? ''}`;
}

function clampTokens(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_TOKENS, Math.max(0, Math.round(value)));
}

function computeCost(tokens: number, pricePerThousand: number): number {
  return (tokens * pricePerThousand) / 1000;
}

function formatCost(usd: number): string {
  return Number.isFinite(usd) ? `$${usd.toFixed(4)}` : '—';
}

export default function Simulator(): JSX.Element {
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [selected, setSelected] = useState<PriceRecord | null>(null);
  const [inputTokens, setInputTokens] = useState(10_000);
  const [outputTokens, setOutputTokens] = useState(2_000);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadCurrent()
      .then((currentRecords) => {
        if (active) {
          const firstRecord = [...currentRecords]
            .sort((left, right) => left.model_id.localeCompare(right.model_id))[0] ?? null;
          setRecords(currentRecords);
          setSelected((current) => current ?? firstRecord);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason : new Error('Unable to load current pricing data'));
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [requestAttempt]);

  const pickerResults = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    if (normalizedQuery === '') {
      return records.slice(0, MAX_RESULTS);
    }
    return records
      .filter((record) => record.model_id.toLowerCase().includes(normalizedQuery)
        || record.provider.toLowerCase().includes(normalizedQuery))
      .slice(0, MAX_RESULTS);
  }, [query, records]);

  function retry(): void {
    setRequestAttempt((attempt) => attempt + 1);
  }

  function chooseRecord(record: PriceRecord): void {
    setSelected(record);
    setQuery('');
    setPickerOpen(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-ink-700">
        <div className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
        <span className="font-mono text-sm">loading pricing data…</span>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="py-24 text-center">
        <p className="h-eyebrow mb-2">failed to load</p>
        <p className="mb-4 text-ink-600">{error.message}</p>
        <button type="button" onClick={retry} className="pill transition hover:text-ink-900">retry</button>
      </div>
    );
  }

  if (selected === null) {
    return (
      <p className="py-24 text-center font-mono text-sm text-ink-600">no pricing records are available.</p>
    );
  }

  const inputCost = computeCost(inputTokens, selected.input_per_1k);
  const outputCost = computeCost(outputTokens, selected.output_per_1k);
  const totalCost = inputCost + outputCost;

  return (
    <div>
      <header className="mb-8">
        <p className="h-eyebrow mb-3">cost simulator</p>
        <h1 className="h-section">What will it cost?</h1>
        <p className="mt-3 max-w-2xl text-ink-600">
          Project the per-call dollar cost for any model. Drag the sliders; the numbers update live.
        </p>
      </header>

      <section className="card mb-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm text-ink-900" title={selected.model_id}>
              {selected.model_id}
            </p>
            <p className="mt-1 font-mono text-[11px] text-ink-600">
              {selected.provider} · {selected.hyperscaler} · {formatRegion(selected.region)} · {selected.source}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="pill transition hover:text-ink-900"
          >
            {pickerOpen ? 'close picker' : 'change model'}
          </button>
        </div>

        {pickerOpen ? (
          <div className="mt-4">
            <input
              type="search"
              aria-label="Search models for simulation"
              placeholder="search model_id · provider"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-full border border-ink-300/30 bg-ink-100/30 px-4 py-2 font-mono text-sm text-ink-900 placeholder-ink-500 transition focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/20"
            />
            {pickerResults.length === 0 ? (
              <p className="mt-3 font-mono text-sm text-ink-600">no matches</p>
            ) : (
              <ul className="mt-3 max-h-72 divide-y divide-ink-300/20 overflow-y-auto rounded-xl border border-ink-300/20 bg-ink-100/20">
                {pickerResults.map((record) => (
                  <li key={recordKey(record)}>
                    <button
                      type="button"
                      onClick={() => chooseRecord(record)}
                      className="block w-full px-4 py-2 text-left transition hover:bg-ink-100/40"
                    >
                      <p className="font-mono text-sm text-ink-900">{record.model_id}</p>
                      <p className="font-mono text-[11px] text-ink-600">
                        {record.provider} · {record.hyperscaler} · {formatRegion(record.region)} · {record.source}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      <section className="card mb-4 p-6">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="h-eyebrow">input tokens</p>
            <p className="num-display text-3xl text-ink-900">{fmt.format(inputTokens)}</p>
          </div>
          <input
            type="range"
            aria-label="Input tokens"
            min={0}
            max={MAX_TOKENS}
            step={1000}
            value={inputTokens}
            onChange={(event) => setInputTokens(clampTokens(Number(event.target.value)))}
            className="w-full"
          />
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] text-ink-600">
              priced at {formatPricePer1K(selected.input_per_1k)} per 1K
            </p>
            <input
              type="number"
              aria-label="Input tokens number"
              min={0}
              max={MAX_TOKENS}
              step={1000}
              value={inputTokens}
              onChange={(event) => setInputTokens(clampTokens(Number(event.target.value)))}
              className="w-32 rounded-full border border-ink-300/30 bg-ink-100/30 px-3 py-1 text-right font-mono text-xs text-ink-900 transition focus:border-accent-500/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="my-6 h-px bg-ink-300/30" />

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="h-eyebrow">output tokens</p>
            <p className="num-display text-3xl text-ink-900">{fmt.format(outputTokens)}</p>
          </div>
          <input
            type="range"
            aria-label="Output tokens"
            min={0}
            max={MAX_TOKENS}
            step={1000}
            value={outputTokens}
            onChange={(event) => setOutputTokens(clampTokens(Number(event.target.value)))}
            className="w-full"
          />
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] text-ink-600">
              priced at {formatPricePer1K(selected.output_per_1k)} per 1K
            </p>
            <input
              type="number"
              aria-label="Output tokens number"
              min={0}
              max={MAX_TOKENS}
              step={1000}
              value={outputTokens}
              onChange={(event) => setOutputTokens(clampTokens(Number(event.target.value)))}
              className="w-32 rounded-full border border-ink-300/30 bg-ink-100/30 px-3 py-1 text-right font-mono text-xs text-ink-900 transition focus:border-accent-500/50 focus:outline-none"
            />
          </div>
        </div>
      </section>

      <section className="card p-6">
        <p className="h-eyebrow mb-3">estimated cost</p>
        <p className="num-display text-5xl text-accent-500 md:text-6xl">{formatCost(totalCost)}</p>
        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">input subtotal</dt>
            <dd className="num-display text-ink-900">{formatCost(inputCost)}</dd>
          </div>
          <div>
            <dt className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">output subtotal</dt>
            <dd className="num-display text-ink-900">{formatCost(outputCost)}</dd>
          </div>
          <div>
            <dt className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">per million ref</dt>
            <dd className="num-display text-xs text-ink-700">
              in {formatPricePerMillion(selected.input_per_1k)} · out {formatPricePerMillion(selected.output_per_1k)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
