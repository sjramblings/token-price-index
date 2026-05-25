import { useEffect, useMemo, useState } from 'react';
import { loadCurrent } from '../lib/data';
import { formatPricePerMillion, formatRegion } from '../lib/format';
import type { PriceRecord } from '../lib/types';

const maximumTokens = 1_000_000;

function recordKey(record: PriceRecord): string {
  return `${record.source}:${record.model_id}:${record.region ?? ''}`;
}

function clampTokens(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(maximumTokens, Math.max(0, value));
}

function computeCost(tokens: number, pricePerThousand: number): number {
  return tokens * pricePerThousand / 1000;
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
          setSelected((currentSelection) => currentSelection ?? firstRecord);
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
    return records.filter((record) => record.model_id.toLowerCase().includes(normalizedQuery)).slice(0, 30);
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
    return <div className="loading">Loading…</div>;
  }

  if (error !== null) {
    return <div className="error">{error.message} <button onClick={retry}>Retry</button></div>;
  }

  if (selected === null) {
    return <p className="empty">No pricing records are available.</p>;
  }

  const inputCost = computeCost(inputTokens, selected.input_per_1k);
  const outputCost = computeCost(outputTokens, selected.output_per_1k);
  const totalCost = inputCost + outputCost;

  return (
    <section>
      <h1>Simulator</h1>
      <h2>{selected.model_id}</h2>
      <p>{selected.provider}, {selected.hyperscaler}, {formatRegion(selected.region)}</p>
      <button onClick={() => setPickerOpen((open) => !open)}>Change model</button>
      {pickerOpen ? (
        <div className="picker">
          <input
            type="search"
            aria-label="Search models for simulation"
            placeholder="Search for a model"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="picker-results">
            {pickerResults.length === 0 ? (
              <li className="empty">No matching models.</li>
            ) : pickerResults.map((record) => (
              <li key={recordKey(record)}>
                <button onClick={() => chooseRecord(record)}>{record.model_id} ({record.source})</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="simulator-controls">
        <label>
          Input tokens
          <div className="token-control">
            <input
              type="range"
              min={0}
              max={maximumTokens}
              step={1000}
              value={inputTokens}
              onChange={(event) => setInputTokens(clampTokens(Number(event.target.value)))}
            />
            <input
              type="number"
              min={0}
              max={maximumTokens}
              step={1000}
              value={inputTokens}
              onChange={(event) => setInputTokens(clampTokens(Number(event.target.value)))}
            />
          </div>
        </label>
        <label>
          Output tokens
          <div className="token-control">
            <input
              type="range"
              min={0}
              max={maximumTokens}
              step={1000}
              value={outputTokens}
              onChange={(event) => setOutputTokens(clampTokens(Number(event.target.value)))}
            />
            <input
              type="number"
              min={0}
              max={maximumTokens}
              step={1000}
              value={outputTokens}
              onChange={(event) => setOutputTokens(clampTokens(Number(event.target.value)))}
            />
          </div>
        </label>
      </div>
      <dl className="metrics">
        <dt>Input cost</dt>
        <dd>{formatCost(inputCost)}</dd>
        <dt>Output cost</dt>
        <dd>{formatCost(outputCost)}</dd>
        <dt>Total</dt>
        <dd>{formatCost(totalCost)}</dd>
      </dl>
      <p>
        Per-million reference: input {formatPricePerMillion(selected.input_per_1k)}, output{' '}
        {formatPricePerMillion(selected.output_per_1k)}
      </p>
    </section>
  );
}
