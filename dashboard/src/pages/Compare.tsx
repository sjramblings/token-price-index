import { useEffect, useMemo, useState } from 'react';
import { loadCurrent } from '../lib/data';
import { formatContextWindow, formatPricePer1K, formatRegion } from '../lib/format';
import type { PriceRecord } from '../lib/types';

type MetricKey = 'input_per_1k' | 'output_per_1k' | 'context_window';

function recordKey(record: PriceRecord): string {
  return `${record.source}:${record.model_id}:${record.region ?? ''}`;
}

function truncateModelId(modelId: string): string {
  return modelId.length > 30 ? `${modelId.slice(0, 30)}…` : modelId;
}

function metricExtremes(selection: PriceRecord[], key: MetricKey): { minimum: number; maximum: number } | null {
  if (selection.length === 0) {
    return null;
  }

  const values = selection.map((record) => record[key]);
  return { minimum: Math.min(...values), maximum: Math.max(...values) };
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
    const normalizedQuery = query.toLowerCase();
    return records.filter((record) => record.model_id.toLowerCase().includes(normalizedQuery)
      && !selection.some((selected) => selected.model_id === record.model_id
        && selected.source === record.source
        && (selected.region ?? '') === (record.region ?? '')))
      .slice(0, 30);
  }, [query, records, selection]);

  const inputExtremes = metricExtremes(selection, 'input_per_1k');
  const outputExtremes = metricExtremes(selection, 'output_per_1k');
  const contextExtremes = metricExtremes(selection, 'context_window');

  function retry(): void {
    setRequestAttempt((attempt) => attempt + 1);
  }

  function addRecord(record: PriceRecord): void {
    if (selection.length < 6) {
      setSelection((currentSelection) => [...currentSelection, record]);
      setQuery('');
    }
  }

  function removeRecord(record: PriceRecord): void {
    setSelection((currentSelection) => currentSelection.filter((selected) => recordKey(selected) !== recordKey(record)));
  }

  function indicator(value: number, extremes: { minimum: number; maximum: number } | null): string {
    if (extremes === null) {
      return '';
    }

    const highest = value === extremes.maximum ? ' ▲' : '';
    const lowest = value === extremes.minimum ? ' ▼' : '';
    return `${highest}${lowest}`;
  }

  if (loading) {
    return <div className="loading">Loading…</div>;
  }

  if (error !== null) {
    return <div className="error">{error.message} <button onClick={retry}>Retry</button></div>;
  }

  return (
    <section>
      <h1>Compare</h1>
      {selection.length < 6 ? (
        <div className="picker">
          <input
            type="search"
            aria-label="Search models to compare"
            placeholder="Search for a model"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="picker-results">
            {pickerResults.length === 0 ? (
              <li className="empty">No matching models.</li>
            ) : pickerResults.map((record) => (
              <li key={recordKey(record)}>
                <button onClick={() => addRecord(record)}>
                  {record.model_id} ({record.source}, {formatRegion(record.region)})
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {selection.length === 0 ? (
        <p className="empty">Search for a model above to start comparing.</p>
      ) : (
        <div className="compare-cards">
          {selection.map((record) => (
            <article className="card" key={recordKey(record)}>
              <button className="remove" aria-label={`Remove ${record.model_id}`} onClick={() => removeRecord(record)}>×</button>
              <h2 title={record.model_id}>{truncateModelId(record.model_id)}</h2>
              <p>{record.provider} · {record.hyperscaler} · {formatRegion(record.region)}</p>
              <dl className="metrics">
                {/* Arrows show numeric direction; best highlights pricing value or usable capacity. */}
                <dt>Input $/1K</dt>
                <dd className={`metric ${record.input_per_1k === inputExtremes?.minimum ? 'best' : ''}`}>
                  {formatPricePer1K(record.input_per_1k)}{indicator(record.input_per_1k, inputExtremes)}
                </dd>
                <dt>Output $/1K</dt>
                <dd className={`metric ${record.output_per_1k === outputExtremes?.minimum ? 'best' : ''}`}>
                  {formatPricePer1K(record.output_per_1k)}{indicator(record.output_per_1k, outputExtremes)}
                </dd>
                <dt>Context</dt>
                <dd className={`metric ${record.context_window === contextExtremes?.maximum ? 'best' : ''}`}>
                  {formatContextWindow(record.context_window)}{indicator(record.context_window, contextExtremes)}
                </dd>
                <dt>Source</dt>
                <dd>{record.source}</dd>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
