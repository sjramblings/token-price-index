import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { loadCurrent } from '../lib/data';
import { formatContextWindow, formatPricePer1K, formatRegion } from '../lib/format';
import { cn } from '../lib/cn';
import type { PriceRecord } from '../lib/types';

type MetricKey = 'input_per_1k' | 'output_per_1k' | 'context_window';

interface Extremes {
  minimum: number;
  maximum: number;
}

interface MetricRowProps {
  label: string;
  value: string;
  highlight: boolean;
  indicator: string;
}

const MAX_SELECTIONS = 6;
const MAX_RESULTS = 12;

function recordKey(record: PriceRecord): string {
  return `${record.source}:${record.model_id}:${record.region ?? ''}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function metricExtremes(selection: PriceRecord[], key: MetricKey): Extremes | null {
  if (selection.length === 0) {
    return null;
  }
  const values = selection.map((record) => record[key]);
  return { minimum: Math.min(...values), maximum: Math.max(...values) };
}

function indicatorFor(value: number, extremes: Extremes | null, direction: 'low' | 'high'): string {
  if (extremes === null) {
    return '';
  }
  if (direction === 'low' && value === extremes.minimum && extremes.minimum !== extremes.maximum) {
    return '▼';
  }
  if (direction === 'high' && value === extremes.maximum && extremes.minimum !== extremes.maximum) {
    return '▲';
  }
  return '';
}

function MetricRow({ label, value, highlight, indicator }: MetricRowProps): JSX.Element {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">{label}</dt>
      <dd className={cn('num-display text-base', highlight ? 'text-accent-500' : 'text-ink-900')}>
        {value}
        {indicator !== '' ? <span className="ml-1 text-xs text-accent-500">{indicator}</span> : null}
      </dd>
    </div>
  );
}

export default function Compare(): JSX.Element {
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [selection, setSelection] = useState<PriceRecord[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadCurrent()
      .then((currentRecords) => {
        if (active) {
          setRecords(currentRecords);
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
      return [];
    }
    const selectedKeys = new Set(selection.map(recordKey));
    return records
      .filter((record) => {
        if (selectedKeys.has(recordKey(record))) {
          return false;
        }
        return record.model_id.toLowerCase().includes(normalizedQuery)
          || record.provider.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, MAX_RESULTS);
  }, [query, records, selection]);

  const inputExtremes = metricExtremes(selection, 'input_per_1k');
  const outputExtremes = metricExtremes(selection, 'output_per_1k');
  const contextExtremes = metricExtremes(selection, 'context_window');

  function retry(): void {
    setRequestAttempt((attempt) => attempt + 1);
  }

  function addRecord(record: PriceRecord): void {
    if (selection.length < MAX_SELECTIONS) {
      setSelection((current) => [...current, record]);
      setQuery('');
    }
  }

  function removeRecord(record: PriceRecord): void {
    const key = recordKey(record);
    setSelection((current) => current.filter((selected) => recordKey(selected) !== key));
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

  return (
    <div>
      <header className="mb-8">
        <p className="h-eyebrow mb-3">compare across substrates</p>
        <h1 className="h-section">Side-by-side, any model, any cloud.</h1>
        <p className="mt-3 max-w-2xl text-ink-600">
          Pick up to {MAX_SELECTIONS} models from any provider, any hyperscaler, any region. Cheapest input / output and largest context are flagged.
        </p>
      </header>

      <section className="card mb-6 p-5">
        {selection.length < MAX_SELECTIONS ? (
          <div>
            <input
              type="search"
              aria-label="Search models to compare"
              placeholder="search model_id · provider"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-full border border-ink-300/30 bg-ink-100/30 px-4 py-2 font-mono text-sm text-ink-900 placeholder-ink-500 transition focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/20"
            />
            {query.trim() === '' ? (
              <p className="mt-3 font-mono text-sm text-ink-600">search above to start comparing</p>
            ) : pickerResults.length === 0 ? (
              <p className="mt-3 font-mono text-sm text-ink-600">no matches</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-300/20 overflow-hidden rounded-xl border border-ink-300/20 bg-ink-100/20">
                {pickerResults.map((record) => (
                  <li key={recordKey(record)}>
                    <button
                      type="button"
                      onClick={() => addRecord(record)}
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
        ) : (
          <p className="font-mono text-xs text-ink-600">
            maximum {MAX_SELECTIONS} models reached — remove one to add another.
          </p>
        )}
      </section>

      {selection.length === 0 ? (
        <p className="py-12 text-center font-mono text-sm text-ink-600">
          no models selected — search above
        </p>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {selection.map((record) => (
            <article key={recordKey(record)} className="card relative p-5">
              <button
                type="button"
                aria-label={`Remove ${record.model_id}`}
                onClick={() => removeRecord(record)}
                className="absolute right-3 top-3 text-ink-600 transition hover:text-accent-500"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="mb-1 truncate pr-8 font-mono text-sm text-ink-900" title={record.model_id}>
                {truncate(record.model_id, 32)}
              </p>
              <p className="mb-4 font-mono text-[11px] text-ink-600">
                {record.provider} · {record.hyperscaler} · {formatRegion(record.region)}
              </p>
              <dl className="space-y-3">
                <MetricRow
                  label="Input $/1K"
                  value={formatPricePer1K(record.input_per_1k)}
                  highlight={inputExtremes !== null && record.input_per_1k === inputExtremes.minimum && inputExtremes.minimum !== inputExtremes.maximum}
                  indicator={indicatorFor(record.input_per_1k, inputExtremes, 'low')}
                />
                <MetricRow
                  label="Output $/1K"
                  value={formatPricePer1K(record.output_per_1k)}
                  highlight={outputExtremes !== null && record.output_per_1k === outputExtremes.minimum && outputExtremes.minimum !== outputExtremes.maximum}
                  indicator={indicatorFor(record.output_per_1k, outputExtremes, 'low')}
                />
                <MetricRow
                  label="Context"
                  value={formatContextWindow(record.context_window)}
                  highlight={contextExtremes !== null && record.context_window === contextExtremes.maximum && contextExtremes.minimum !== contextExtremes.maximum}
                  indicator={indicatorFor(record.context_window, contextExtremes, 'high')}
                />
              </dl>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
