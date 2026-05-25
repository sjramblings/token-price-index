import { useEffect, useMemo, useState } from 'react';
import { loadCurrent } from '../lib/data';
import { formatContextWindow, formatPricePer1K, formatRegion } from '../lib/format';
import type {
  ExplorerFilterState,
  Hyperscaler,
  PriceRecord,
  SortDirection,
  SortKey,
  Source,
} from '../lib/types';

type Column = {
  key: SortKey;
  label: string;
  render: (record: PriceRecord) => string;
};

const columns: Column[] = [
  { key: 'provider', label: 'Provider', render: (record) => record.provider },
  { key: 'model_id', label: 'Model ID', render: (record) => record.model_id },
  { key: 'hyperscaler', label: 'Hyperscaler', render: (record) => record.hyperscaler },
  { key: 'region', label: 'Region', render: (record) => formatRegion(record.region) },
  { key: 'input_per_1k', label: 'Input $/1K', render: (record) => formatPricePer1K(record.input_per_1k) },
  { key: 'output_per_1k', label: 'Output $/1K', render: (record) => formatPricePer1K(record.output_per_1k) },
  { key: 'context_window', label: 'Context', render: (record) => formatContextWindow(record.context_window) },
  { key: 'source', label: 'Source', render: (record) => record.source },
];

function compareValues(left: string | number | null, right: string | number | null): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left ?? '').localeCompare(String(right ?? ''));
}

function compareDefaultOrder(left: PriceRecord, right: PriceRecord): number {
  return left.provider.localeCompare(right.provider) || left.model_id.localeCompare(right.model_id);
}

export default function Explorer(): JSX.Element {
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [filter, setFilter] = useState<ExplorerFilterState>({
    query: '',
    hyperscalers: new Set<Hyperscaler>(),
    source: 'all',
  });
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadCurrent()
      .then((currentRecords) => {
        if (active) {
          setRecords(currentRecords);
          setFilter((currentFilter) => ({
            ...currentFilter,
            hyperscalers: new Set(currentRecords.map((record) => record.hyperscaler)),
          }));
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

  const hyperscalers = useMemo(
    () => [...new Set(records.map((record) => record.hyperscaler))].sort(),
    [records],
  );
  const sources = useMemo(
    () => [...new Set(records.map((record) => record.source))].sort(),
    [records],
  );
  const sorted = useMemo(() => {
    const query = filter.query.toLowerCase();
    const filtered = records.filter((record) => record.model_id.toLowerCase().includes(query)
      && filter.hyperscalers.has(record.hyperscaler)
      && (filter.source === 'all' || record.source === filter.source));

    return [...filtered].sort((left, right) => {
      if (sortKey !== null && sortDir !== null) {
        const primaryResult = compareValues(left[sortKey], right[sortKey]);
        if (primaryResult !== 0) {
          return sortDir === 'asc' ? primaryResult : -primaryResult;
        }
      }

      return compareDefaultOrder(left, right);
    });
  }, [filter, records, sortDir, sortKey]);

  function retry(): void {
    setRequestAttempt((attempt) => attempt + 1);
  }

  function toggleHyperscaler(hyperscaler: Hyperscaler): void {
    setFilter((currentFilter) => {
      const nextHyperscalers = new Set(currentFilter.hyperscalers);
      if (nextHyperscalers.has(hyperscaler)) {
        nextHyperscalers.delete(hyperscaler);
      } else {
        nextHyperscalers.add(hyperscaler);
      }
      return { ...currentFilter, hyperscalers: nextHyperscalers };
    });
  }

  function toggleSort(nextKey: SortKey): void {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortKey(null);
      setSortDir(null);
    } else {
      setSortDir('asc');
    }
  }

  if (loading) {
    return <div className="loading">Loading…</div>;
  }

  if (error !== null) {
    return <div className="error">{error.message} <button onClick={retry}>Retry</button></div>;
  }

  return (
    <section>
      <h1>Explorer</h1>
      <div className="filters">
        <input
          type="search"
          aria-label="Filter by model ID"
          placeholder="Filter model ID"
          value={filter.query}
          onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))}
        />
        <div className="checkbox-group" aria-label="Hyperscaler filters">
          {hyperscalers.map((hyperscaler) => (
            <label key={hyperscaler}>
              <input
                type="checkbox"
                checked={filter.hyperscalers.has(hyperscaler)}
                onChange={() => toggleHyperscaler(hyperscaler)}
              />
              {hyperscaler}
            </label>
          ))}
        </div>
        <select
          aria-label="Filter by source"
          value={filter.source}
          onChange={(event) => setFilter((current) => ({
            ...current,
            source: event.target.value as Source | 'all',
          }))}
        >
          <option value="all">all</option>
          {sources.map((source) => <option key={source} value={source}>{source}</option>)}
        </select>
      </div>
      <p>Showing {sorted.length} of {records.length} records</p>
      {sorted.length === 0 ? (
        <p className="empty">No records match the current filters.</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col">
                    <button className="sortable" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      {sortKey === column.key && sortDir !== null ? (
                        <span className="sort-indicator">{sortDir === 'asc' ? '▲' : '▼'}</span>
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((record, index) => (
                <tr key={`${record.source}:${record.model_id}:${record.region ?? ''}:${index}`}>
                  {columns.map((column) => <td key={column.key}>{column.render(record)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
