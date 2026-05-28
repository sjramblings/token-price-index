import { useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/cn';
import { loadCurrent } from '../lib/data';
import { formatContextWindow, formatPricePer1K, formatRegion } from '../lib/format';
import type { PriceRecord } from '../lib/types';

const DEFAULT_FAMILY = 'claude-3-5-sonnet';

function rowKey(record: PriceRecord): string {
  return `${record.hyperscaler}:${record.region ?? 'null'}:${record.source}:${record.model_id}`;
}

interface PivotFamilies {
  readonly families: readonly string[];
  readonly singleChannelFamilies: ReadonlySet<string>;
}

// Every family with at least one price record qualifies for the pivot dropdown.
// Earlier iterations filtered to families spanning >1 hyperscaler, but that hid
// brand-new models like `claude-opus-4.8` (released 2026-05-29) that ship on a
// single channel for hours/days before Bedrock + Vertex + direct catch up.
// "Same model, every channel" reads truthfully with 1 channel too — the table
// just renders one row, which is itself the answer to "where is this listed?".
function pivotFamilyList(records: readonly PriceRecord[]): PivotFamilies {
  const byFamily = new Map<string, Set<string>>();
  for (const record of records) {
    if (record.family.length === 0) {
      continue;
    }
    const set = byFamily.get(record.family) ?? new Set<string>();
    set.add(record.hyperscaler);
    byFamily.set(record.family, set);
  }
  const families = [...byFamily.keys()].sort((left, right) => left.localeCompare(right));
  const singleChannelFamilies = new Set<string>();
  for (const [family, hyperscalers] of byFamily) {
    if (hyperscalers.size === 1) {
      singleChannelFamilies.add(family);
    }
  }
  return { families, singleChannelFamilies };
}

function pickInitialFamily(families: readonly string[]): string | null {
  if (families.length === 0) {
    return null;
  }
  return families.includes(DEFAULT_FAMILY) ? DEFAULT_FAMILY : families[0];
}

export default function Pivot(): JSX.Element {
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [family, setFamily] = useState<string | null>(null);

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

  const { families, singleChannelFamilies } = useMemo(
    () => pivotFamilyList(records),
    [records],
  );

  useEffect(() => {
    if (family === null && families.length > 0) {
      setFamily(pickInitialFamily(families));
    }
  }, [families, family]);

  // Many upstream sources expose multiple identifiers for the same model on
  // the same deployment channel (LiteLLM alone lists ~12 IDs for Claude Opus
  // 4.7 — bedrock regional profiles, dated direct variants, vertex aliases).
  // The pivot view's promise is "same model across channels," so collapse
  // duplicates per (hyperscaler, region) and keep the cheapest input price.
  const selectedRows = useMemo(() => {
    if (family === null) {
      return [];
    }
    const candidates = records.filter((record) => record.family === family);
    const byChannel = new Map<string, PriceRecord>();
    for (const candidate of candidates) {
      const key = `${candidate.hyperscaler}|${candidate.region ?? ''}`;
      const incumbent = byChannel.get(key);
      if (incumbent === undefined || candidate.input_per_1k < incumbent.input_per_1k) {
        byChannel.set(key, candidate);
      }
    }
    return [...byChannel.values()].sort((left, right) => left.input_per_1k - right.input_per_1k);
  }, [records, family]);

  const lowestInput = useMemo(() => {
    if (selectedRows.length === 0) {
      return null;
    }
    return Math.min(...selectedRows.map((record) => record.input_per_1k));
  }, [selectedRows]);

  const hasBaselineRow = useMemo(
    () => selectedRows.some((record) => record.region === null),
    [selectedRows],
  );

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

  if (families.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="h-eyebrow mb-2">no families loaded</p>
        <p className="text-ink-600">
          The current pricing snapshot did not parse into any model families. Check the latest
          refresh ran cleanly.
        </p>
      </div>
    );
  }

  const selectedIsSingleChannel = family !== null && singleChannelFamilies.has(family);

  return (
    <div>
      <header className="mb-8">
        <p className="h-eyebrow mb-3">hyperscaler pivot</p>
        <h1 className="h-section">Same model, every channel.</h1>
        <p className="mt-3 max-w-2xl text-ink-600">
          Pick a model family to see every hyperscaler and region it ships on. The cheapest input
          price is highlighted; the source column links out to each upstream pricing page.
        </p>
      </header>

      <section className="card mb-6 p-5">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600" htmlFor="pivot-family">
          model family
        </label>
        <select
          id="pivot-family"
          value={family ?? ''}
          onChange={(event) => setFamily(event.target.value)}
          className="w-full rounded-full border border-ink-300/30 bg-ink-100/30 px-4 py-2 font-mono text-sm text-ink-900 transition focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/20"
        >
          {families.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
              {singleChannelFamilies.has(candidate) ? '  ·  single-channel' : ''}
            </option>
          ))}
        </select>
        <p className="mt-2 font-mono text-[11px] text-ink-600">
          {families.length} families · {families.length - singleChannelFamilies.size} multi-channel · {singleChannelFamilies.size} single-channel (emerging or channel-exclusive)
        </p>
      </section>

      {selectedIsSingleChannel ? (
        <aside className="card mb-4 border-l-4 border-accent-500/40 p-4">
          <p className="font-mono text-xs text-ink-700">
            <span className="font-bold text-ink-900">single-channel</span> — this family is currently
            priced on only one hyperscaler. Either it is newly released and other channels have not
            yet listed it, or it is exclusive to this channel by design.
          </p>
        </aside>
      ) : null}

      {hasBaselineRow ? (
        <aside className="card mb-4 border-l-4 border-amber-500/40 p-4">
          <p className="font-mono text-xs text-ink-700">
            Some rows show a baseline price (region unknown) — regional precision is available only
            for hyperscalers we ingest per-region.
          </p>
        </aside>
      ) : null}

      {selectedRows.length === 0 ? (
        <p className="py-12 text-center font-mono text-sm text-ink-600">
          no rows for {family ?? '—'}
        </p>
      ) : (
        <section className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-ink-300/20">
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Hyperscaler</th>
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Region</th>
                <th scope="col" className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Input $/1K</th>
                <th scope="col" className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Output $/1K</th>
                <th scope="col" className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Context</th>
                <th scope="col" className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Source</th>
              </tr>
            </thead>
            <tbody>
              {selectedRows.map((record) => {
                const isCheapest = lowestInput !== null && record.input_per_1k === lowestInput;
                return (
                  <tr
                    key={rowKey(record)}
                    className={cn(
                      'border-b border-ink-300/15 transition hover:bg-ink-100/40',
                      isCheapest && 'border-l-4 border-l-accent-500 bg-accent-500/5',
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-ink-800">{record.hyperscaler}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-700">{formatRegion(record.region)}</td>
                    <td className="num-display px-4 py-3 text-right text-xs text-ink-900">
                      {formatPricePer1K(record.input_per_1k)}
                      {isCheapest ? <span className="ml-2 text-accent-500">▼</span> : null}
                    </td>
                    <td className="num-display px-4 py-3 text-right text-xs text-ink-800">{formatPricePer1K(record.output_per_1k)}</td>
                    <td className="num-display px-4 py-3 text-right text-xs text-ink-800">{formatContextWindow(record.context_window)}</td>
                    <td className="px-4 py-3">
                      <a
                        href={record.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[11px] text-ink-700 underline-offset-2 hover:text-ink-900 hover:underline"
                      >
                        {record.source}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
