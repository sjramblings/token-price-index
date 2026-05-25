import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { iterateRecentDates, loadCurrent, loadHistory } from '../lib/data';
import { formatRegion } from '../lib/format';
import type { PriceRecord } from '../lib/types';

interface TimelinePoint {
  date: string;
  input: number;
  output: number;
}

const MAX_RESULTS = 12;
const HISTORY_DAYS = 30;

function recordKey(record: PriceRecord): string {
  return `${record.source}:${record.model_id}:${record.region ?? ''}`;
}

function matchesSelection(record: PriceRecord, selected: PriceRecord): boolean {
  return record.source === selected.source
    && record.model_id === selected.model_id
    && (record.region ?? '') === (selected.region ?? '');
}

export default function Timeline(): JSX.Element {
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [selected, setSelected] = useState<PriceRecord | null>(null);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [timelinePoints, setTimelinePoints] = useState<TimelinePoint[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<Error | null>(null);
  const [timelineAttempt, setTimelineAttempt] = useState(0);

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

  useEffect(() => {
    if (selected === null) {
      setTimelinePoints([]);
      setTimelineLoading(false);
      setTimelineError(null);
      return;
    }

    let active = true;
    setTimelineLoading(true);
    setTimelineError(null);

    const dates = iterateRecentDates(HISTORY_DAYS);
    void Promise.all(dates.map((date) => loadHistory(date)))
      .then((snapshots) => {
        if (!active) {
          return;
        }
        const points = snapshots.flatMap((snapshot, index) => {
          if (snapshot === null) {
            return [];
          }
          const match = snapshot.find((record) => matchesSelection(record, selected));
          if (match === undefined) {
            return [];
          }
          return [{
            date: dates[index],
            input: match.input_per_1k,
            output: match.output_per_1k,
          }];
        });
        setTimelinePoints(points.reverse());
        setTimelineLoading(false);
      })
      .catch((reason: unknown) => {
        if (active) {
          setTimelineError(reason instanceof Error ? reason : new Error('Unable to load timeline history'));
          setTimelineLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selected, timelineAttempt]);

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

  function retryTimeline(): void {
    setTimelineAttempt((attempt) => attempt + 1);
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

  return (
    <div>
      <header className="mb-8">
        <p className="h-eyebrow mb-3">price over time</p>
        <h1 className="h-section">Watch the curve.</h1>
        <p className="mt-3 max-w-2xl text-ink-600">
          Daily snapshots stretch back from today; pick a model to chart its input/output trajectory.
        </p>
      </header>

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {selected !== null ? (
              <>
                <p className="truncate font-mono text-sm text-ink-900" title={selected.model_id}>
                  {selected.model_id}
                </p>
                <p className="mt-1 font-mono text-[11px] text-ink-600">
                  {selected.provider} · {selected.hyperscaler} · {formatRegion(selected.region)} · {selected.source}
                </p>
              </>
            ) : (
              <p className="font-mono text-sm text-ink-600">no model selected</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="pill transition hover:text-ink-900"
          >
            {pickerOpen ? 'close picker' : selected === null ? 'pick a model' : 'change model'}
          </button>
        </div>

        {pickerOpen ? (
          <div className="mt-4">
            <input
              type="search"
              aria-label="Search models for timeline"
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

        <div className="mt-6">
          {selected === null ? (
            <p className="py-12 text-center font-mono text-sm text-ink-600">
              pick a model to chart its history
            </p>
          ) : timelineLoading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-ink-700">
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
              <span className="font-mono text-sm">loading timeline…</span>
            </div>
          ) : timelineError !== null ? (
            <div className="py-12 text-center">
              <p className="h-eyebrow mb-2">failed to load timeline</p>
              <p className="mb-4 text-ink-600">{timelineError.message}</p>
              <button type="button" onClick={retryTimeline} className="pill transition hover:text-ink-900">
                retry
              </button>
            </div>
          ) : timelinePoints.length < 2 ? (
            <div className="py-12 text-center">
              <p className="h-eyebrow mb-3">not enough data yet</p>
              <p className="num-display text-2xl text-ink-700">
                currently {timelinePoints.length} data point{timelinePoints.length === 1 ? '' : 's'}
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink-600">
                timeline becomes useful after a few more daily snapshots accumulate.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={timelinePoints} margin={{ top: 20, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="rgb(58 70 84 / 0.25)" strokeDasharray="2 4" />
                <XAxis
                  dataKey="date"
                  stroke="rgb(139 149 164)"
                  tick={{ fill: 'rgb(139 149 164)', fontSize: 11 }}
                />
                <YAxis
                  stroke="rgb(139 149 164)"
                  tick={{ fill: 'rgb(139 149 164)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0B0F14',
                    border: '1px solid rgba(58,70,84,0.5)',
                    borderRadius: 8,
                    fontFamily: 'Geist Mono, ui-monospace, monospace',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#F4F4F5' }}
                />
                <Legend
                  wrapperStyle={{
                    fontFamily: 'Geist Mono, ui-monospace, monospace',
                    fontSize: 11,
                    color: '#B5BCC7',
                  }}
                />
                <Line type="monotone" dataKey="input" stroke="#FF9900" strokeWidth={1.5} dot={false} name="Input $/1K" />
                <Line type="monotone" dataKey="output" stroke="#22D3D9" strokeWidth={1.5} dot={false} name="Output $/1K" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
