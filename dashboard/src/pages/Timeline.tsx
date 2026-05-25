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

type TimelinePoint = {
  date: string;
  input: number;
  output: number;
};

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

    const dates = iterateRecentDates(30);
    void Promise.all(dates.map((date) => loadHistory(date)))
      .then((snapshots) => {
        if (active) {
          const points = snapshots.flatMap((snapshot, index) => {
            if (snapshot === null) {
              return [];
            }

            const match = snapshot.find((record) => matchesSelection(record, selected));
            return match === undefined ? [] : [{
              date: dates[index],
              input: match.input_per_1k,
              output: match.output_per_1k,
            }];
          });
          setTimelinePoints(points.reverse());
          setTimelineLoading(false);
        }
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
    const normalizedQuery = query.toLowerCase();
    return records.filter((record) => record.model_id.toLowerCase().includes(normalizedQuery)).slice(0, 30);
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
    return <div className="loading">Loading…</div>;
  }

  if (error !== null) {
    return <div className="error">{error.message} <button onClick={retry}>Retry</button></div>;
  }

  return (
    <section>
      <h1>Timeline</h1>
      <button onClick={() => setPickerOpen((open) => !open)}>
        {selected === null ? 'Pick a model' : 'Change model'}
      </button>
      {pickerOpen ? (
        <div className="picker">
          <input
            type="search"
            aria-label="Search models for timeline"
            placeholder="Search for a model"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="picker-results">
            {pickerResults.length === 0 ? (
              <li className="empty">No matching models.</li>
            ) : pickerResults.map((record) => (
              <li key={recordKey(record)}>
                <button onClick={() => chooseRecord(record)}>
                  {record.model_id} ({record.source}, {formatRegion(record.region)})
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {selected === null ? (
        <p className="empty">Pick a model to view its price over time.</p>
      ) : (
        <>
          <h2>{selected.model_id}</h2>
          <p>{selected.provider}, {selected.hyperscaler}, {formatRegion(selected.region)}</p>
          {timelineLoading ? <div className="loading">Loading…</div> : null}
          {timelineError !== null ? (
            <div className="error">{timelineError.message} <button onClick={retryTimeline}>Retry</button></div>
          ) : null}
          {!timelineLoading && timelineError === null && timelinePoints.length < 2 ? (
            <p className="empty">
              Timeline view will become useful after a few more daily snapshots accumulate (currently{' '}
              {timelinePoints.length} data points for this model).
            </p>
          ) : null}
          {!timelineLoading && timelineError === null && timelinePoints.length >= 2 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={timelinePoints}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="input" stroke="#3b82f6" name="Input $/1K" dot={false} />
                  <Line type="monotone" dataKey="output" stroke="#ef4444" name="Output $/1K" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
