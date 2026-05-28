import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { SortingState } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { CountUp } from '../lib/CountUp';
import { cn } from '../lib/cn';
import type { HistoryManifest } from '../lib/data';
import { loadCurrent, loadHistoryManifest } from '../lib/data';
import { fmt, fmtRelative, formatContextWindow, formatPricePer1K, formatRegion } from '../lib/format';
import type { Hyperscaler, PriceRecord, Source } from '../lib/types';

type HyperscalerFilter = 'all' | Hyperscaler;
type SourceFilter = 'all' | Source;

interface StatCardProps {
  label: string;
  value: number;
}

const hyperscalerFilters: HyperscalerFilter[] = ['all', 'aws', 'azure', 'gcp', 'direct', 'aggregator'];
const columnHelper = createColumnHelper<PriceRecord>();

function StatCard({ label, value }: StatCardProps): JSX.Element {
  return (
    <div className="card p-5 md:p-7">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-600">{label}</p>
      <p className="text-3xl font-semibold tracking-tightest text-ink-900 md:text-5xl">
        <CountUp to={value} />
      </p>
    </div>
  );
}

function colorFor(hyperscaler: Hyperscaler): string {
  const colors: Record<Hyperscaler, string> = {
    aws: 'border-accent-500/40 text-accent-300',
    azure: 'border-teal-500/40 text-teal-400',
    gcp: 'border-purple-500/40 text-purple-300',
    direct: 'border-ink-400/40 text-ink-700',
    aggregator: 'border-ink-500/40 text-ink-600',
  };
  return colors[hyperscaler];
}

function isSourceFilter(value: string): value is SourceFilter {
  return value === 'all'
    || value === 'litellm'
    || value === 'openrouter'
    || value === 'aws-pricelist'
    || value === 'azure-retail';
}

export default function Explorer(): JSX.Element {
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [historyManifest, setHistoryManifest] = useState<HistoryManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [hyperscalerFilter, setHyperscalerFilter] = useState<HyperscalerFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void Promise.all([loadCurrent(), loadHistoryManifest().catch(() => null)])
      .then(([currentRecords, manifest]) => {
        if (active) {
          setRecords(currentRecords);
          setHistoryManifest(manifest);
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

  const sources = useMemo<Source[]>(
    () => [...new Set(records.map((record) => record.source))].sort(),
    [records],
  );
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return records.filter((record) => {
      if (hyperscalerFilter !== 'all' && record.hyperscaler !== hyperscalerFilter) {
        return false;
      }
      if (sourceFilter !== 'all' && record.source !== sourceFilter) {
        return false;
      }
      if (query
        && !record.model_id.toLowerCase().includes(query)
        && !record.provider.toLowerCase().includes(query)
        && !record.hyperscaler.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [hyperscalerFilter, records, search, sourceFilter]);
  const columns = useMemo(
    () => [
      columnHelper.accessor('provider', {
        header: 'Provider',
        cell: (info) => <span className="font-mono text-xs text-ink-700">{info.getValue()}</span>,
      }),
      columnHelper.accessor('model_id', {
        header: 'Model ID',
        cell: (info) => <span className="font-mono text-ink-900">{info.getValue()}</span>,
      }),
      columnHelper.accessor('hyperscaler', {
        header: 'Hyperscaler',
        cell: (info) => (
          <span className={cn('pill !px-2 !py-0.5 text-[10px]', colorFor(info.getValue()))}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('region', {
        header: 'Region',
        cell: (info) => <span className="font-mono text-xs text-ink-600">{formatRegion(info.getValue())}</span>,
      }),
      columnHelper.accessor('input_per_1k', {
        header: 'Input $/1K',
        cell: (info) => <span className="num-display text-xs text-ink-800">{formatPricePer1K(info.getValue())}</span>,
      }),
      columnHelper.accessor('output_per_1k', {
        header: 'Output $/1K',
        cell: (info) => <span className="num-display text-xs text-ink-800">{formatPricePer1K(info.getValue())}</span>,
      }),
      columnHelper.accessor('context_window', {
        header: 'Context',
        cell: (info) => <span className="num-display text-xs text-ink-800">{formatContextWindow(info.getValue())}</span>,
      }),
      columnHelper.accessor('source', {
        header: 'Source',
        cell: (info) => <span className="font-mono text-[11px] text-ink-600">{info.getValue()}</span>,
      }),
    ],
    [],
  );
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });
  const today = new Date().toISOString().slice(0, 10);

  function retry(): void {
    setRequestAttempt((attempt) => attempt + 1);
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

  const statCards: StatCardProps[] = [
    { label: 'Models', value: records.length },
    { label: 'Providers', value: new Set(records.map((record) => record.provider)).size },
    { label: 'Hyperscalers', value: new Set(records.map((record) => record.hyperscaler)).size },
    {
      label: 'Daily snapshots',
      value: historyManifest === null
        ? new Set(records.map((record) => record.fetched_at.slice(0, 10))).size
        : historyManifest.dates.length,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <section>
        <p className="h-eyebrow">Every model · every substrate · captured daily</p>
        <h1 className="mt-5 text-5xl font-semibold leading-[0.95] tracking-tightest text-ink-900 md:text-7xl lg:text-8xl">
          LLM token pricing,
          <br />
          <span className="bg-gradient-to-r from-accent-500 to-teal-400 bg-clip-text text-transparent">
            across providers and hyperscalers
          </span>
          <span className="text-accent-500">.</span>
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ink-600 md:text-xl">
          {fmt.format(records.length)} models from LiteLLM, OpenRouter, AWS Bedrock, Azure OpenAI, Vertex — normalized
          into one machine-readable JSON, refreshed daily, free forever.
        </p>
        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {statCards.map((stat) => <StatCard key={stat.label} label={stat.label} value={stat.value} />)}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="pill">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
            updated {fmtRelative(today)}
          </span>
          <span className="pill font-mono">source: litellm + openrouter</span>
          <span className="pill">snapshot {today}</span>
        </div>
      </section>

      <section className="card mt-12 p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            aria-label="Search pricing records"
            placeholder="search model_id · provider · hyperscaler"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-[240px] flex-1 rounded-full border border-ink-300/30 bg-ink-100/30 px-4 py-2 font-mono text-sm text-ink-900 placeholder-ink-500 transition focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/20"
          />
          <select
            aria-label="Filter by source"
            value={sourceFilter}
            onChange={(event) => {
              if (isSourceFilter(event.target.value)) {
                setSourceFilter(event.target.value);
              }
            }}
            className="rounded-full border border-ink-300/30 bg-ink-100/30 px-3 py-2 font-mono text-xs text-ink-700"
          >
            <option value="all">all sources</option>
            {sources.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
          <div className="flex items-center gap-1 rounded-full border border-ink-300/30 bg-ink-100/30 p-0.5">
            {hyperscalerFilters.map((hyperscaler) => (
              <button
                type="button"
                key={hyperscaler}
                onClick={() => setHyperscalerFilter(hyperscaler)}
                className={cn(
                  'rounded-full px-3 py-1 font-mono text-xs transition',
                  hyperscalerFilter === hyperscaler
                    ? 'bg-accent-500/15 text-accent-300'
                    : 'text-ink-600 hover:text-ink-900',
                )}
              >
                {hyperscaler}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 font-mono text-xs text-ink-600">
          showing {fmt.format(filtered.length)} of {fmt.format(records.length)}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className="cursor-pointer select-none px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600 hover:text-ink-900"
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1.5"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? <span className="text-accent-500">↑</span> : null}
                            {sorted === 'desc' ? <span className="text-accent-500">↓</span> : null}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-10 text-center font-mono text-sm text-ink-600">
                    no records match the current filters
                  </td>
                </tr>
              ) : table.getRowModel().rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-ink-300/15 transition hover:bg-ink-100/40',
                    index % 2 === 1 && 'bg-ink-100/15',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between font-mono text-xs text-ink-600">
          <span>
            page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="pill transition hover:text-ink-900 disabled:opacity-30"
            >
              prev
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="pill transition hover:text-ink-900 disabled:opacity-30"
            >
              next
            </button>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
