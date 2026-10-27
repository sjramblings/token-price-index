import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';
import { formatPricePer1K } from '../lib/format';
import {
  cacheSavings,
  channelSpreads,
  priceMovers,
  regionalSpreads,
} from '../lib/signals';
import type { PriceRecord } from '../lib/types';

/**
 * The derived read of the catalogue, shown above the table.
 *
 * Every page used to make the reader do the analysis — sort a column, pick a
 * family from a dropdown, choose a model to chart. These four panels answer the
 * questions the data can answer by itself: where region choice costs you, where
 * routing choice costs you, what moved, and where caching pays.
 *
 * Form note: these are ranked comparisons, not time series, so they are ranked
 * lists with a magnitude bar rather than charts. A bar chart of five labelled
 * rows is a list with extra chrome.
 */

const ROWS = 5;

interface SignalRowProps {
  /** Primary identifier, monospaced. */
  label: string;
  /** Secondary context line — what is being compared. */
  detail: string;
  /** Right-aligned headline value, already formatted. */
  value: string;
  /** 0–1, drives the magnitude bar width. */
  magnitude: number;
  /** Colour intent: 'up' is bad for a buyer, 'down' is good, 'neutral' is size. */
  intent?: 'up' | 'down' | 'neutral';
  title?: string;
  /** In-app destination that shows the rows behind this number. */
  href: string;
}

function SignalRow({
  label, detail, value, magnitude, intent = 'neutral', title, href,
}: SignalRowProps): JSX.Element {
  // Status hues are reserved for polarity and always ship alongside a signed
  // number, never as the only cue — the sign in `value` carries the meaning for
  // anyone who cannot separate the two hues.
  // A thin rule under the row, not a fill behind it. At full row height these
  // read as highlighted rows rather than marks, and the tint fights the mono
  // text sitting on top of it.
  // Neutral magnitude is teal, not accent-500. Amber and emerald are the
  // reserved polarity pair (up is bad for a buyer, down is good), and
  // accent-500 is close enough to amber that a plain size bar could read as a
  // price rise. Teal cannot be mistaken for either.
  const bar = intent === 'up'
    ? 'bg-amber-400'
    : intent === 'down'
      ? 'bg-emerald-400'
      : 'bg-teal-500';
  const text = intent === 'up'
    ? 'text-amber-400'
    : intent === 'down'
      ? 'text-emerald-400'
      : 'text-ink-800';

  // The whole row is the hit target, not just the label — a signal that names
  // a number and leaves you to go find the rows behind it is a dead end.
  return (
    <li title={title}>
      <Link
        to={href}
        className="block px-4 py-2.5 transition hover:bg-ink-100/40 focus:bg-ink-100/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-500/40"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-mono text-[11px] text-ink-900">{label}</span>
          <span className={cn('num-display shrink-0 text-xs font-medium', text)}>{value}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] text-ink-600">{detail}</p>
        <div aria-hidden="true" className="mt-1.5 h-[3px] w-full rounded-full bg-ink-300/20">
          <div
            className={cn('h-full rounded-full', bar)}
            style={{ width: `${Math.max(2, Math.min(100, magnitude * 100))}%` }}
          />
        </div>
      </Link>
    </li>
  );
}

interface PanelProps {
  eyebrow: string;
  question: string;
  footnote: string;
  children: React.ReactNode;
  empty: boolean;
}

function Panel({ eyebrow, question, footnote, children, empty }: PanelProps): JSX.Element {
  return (
    <section className="card flex flex-col p-0">
      <header className="border-b border-ink-300/15 px-4 py-3">
        <p className="h-eyebrow">{eyebrow}</p>
        <h3 className="mt-1.5 text-sm font-medium leading-snug text-ink-900">{question}</h3>
      </header>
      {empty
        ? <p className="px-4 py-6 font-mono text-[11px] text-ink-600">not enough data in this snapshot</p>
        : <ul className="divide-y divide-ink-300/10">{children}</ul>}
      <p className="mt-auto border-t border-ink-300/15 px-4 py-2 text-[10px] leading-relaxed text-ink-600">
        {footnote}
      </p>
    </section>
  );
}

export interface SignalsProps {
  records: PriceRecord[];
  /** Most recent earlier snapshot, for movement. Null when none has loaded. */
  previous: PriceRecord[] | null;
  previousDate: string | null;
  snapshot: string | null;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 0;
  }
  return Math.round((b - a) / 86_400_000);
}

export function Signals({
  records, previous, previousDate, snapshot,
}: SignalsProps): JSX.Element {
  const regions = useMemo(() => regionalSpreads(records), [records]);
  const routes = useMemo(() => channelSpreads(records), [records]);
  const caching = useMemo(() => cacheSavings(records), [records]);
  const moves = useMemo(
    () => (previous === null ? [] : priceMovers(previous, records)),
    [previous, records],
  );

  const topRegions = regions.slice(0, ROWS);
  const topRoutes = routes.slice(0, ROWS);
  const topCaching = caching.slice(0, ROWS);
  const topMoves = moves.slice(0, ROWS);

  const maxRegion = topRegions[0]?.spreadPct ?? 1;
  const maxRoute = topRoutes[0]?.spreadPct ?? 1;
  const maxCache = topCaching[0]?.savingPer1k ?? 1;
  const maxMove = Math.max(...topMoves.map((m) => Math.abs(m.deltaPct)), 1);

  // The gap between snapshots is NOT always a day — the series has holes where
  // refresh runs failed. Say which two dates are being compared rather than
  // implying a cadence the data does not have.
  const span = previousDate !== null && snapshot !== null
    ? daysBetween(previousDate, snapshot)
    : 0;
  const movementFootnote = previousDate === null
    ? 'No earlier snapshot loaded, so there is nothing to compare against.'
    : `Input price, ${previousDate} → ${snapshot ?? 'now'}`
      + `${span > 1 ? ` (${span} days apart — the series has gaps)` : ''}`
      + `. ${moves.length} moved by more than 1%.`;

  return (
    <section aria-labelledby="signals-heading">
      <h2 id="signals-heading" className="sr-only">What this snapshot says</h2>
      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <Panel
          eyebrow="region arbitrage"
          question="What does picking the wrong region cost?"
          footnote={`Same model, same channel, cheapest vs dearest region. ${regions.length} models are priced in 3+ regions.`}
          empty={topRegions.length === 0}
        >
          {topRegions.map((s) => (
            <SignalRow
              key={`${s.modelId}-${s.hyperscaler}`}
              label={s.modelId}
              detail={`${s.cheapestRegion} ${formatPricePer1K(s.cheapestPer1k)} → ${s.dearestRegion} ${formatPricePer1K(s.dearestPer1k)}`}
              value={`+${s.spreadPct.toFixed(0)}%`}
              magnitude={s.spreadPct / maxRegion}
              title={`${s.regionCount} regions carry ${s.modelId} on ${s.hyperscaler}`}
              href={`/?q=${encodeURIComponent(s.modelId)}`}
            />
          ))}
        </Panel>

        <Panel
          eyebrow="routing arbitrage"
          question="What does picking the wrong route cost?"
          footnote={'Cheapest vs dearest way to reach the same family. Both endpoints are named because "direct" is every provider that is not a hyperscaler or aggregator — including resellers, not just the vendor itself.'}
          empty={topRoutes.length === 0}
        >
          {topRoutes.map((s) => (
            <SignalRow
              key={s.family}
              label={s.family}
              detail={`${s.cheapestProvider}·${s.cheapestChannel} ${formatPricePer1K(s.cheapestPer1k)} → ${s.dearestProvider}·${s.dearestChannel} ${formatPricePer1K(s.dearestPer1k)}`}
              value={`+${s.spreadPct.toFixed(0)}%`}
              magnitude={s.spreadPct / maxRoute}
              title={`${s.family} is carried on ${s.channelCount} channels`}
              href={`/pivot?family=${encodeURIComponent(s.family)}`}
            />
          ))}
        </Panel>

        <Panel
          eyebrow="movement"
          question="What changed since the last snapshot?"
          footnote={movementFootnote}
          empty={topMoves.length === 0}
        >
          {topMoves.map((m) => (
            <SignalRow
              key={`${m.source}-${m.modelId}-${m.region ?? ''}`}
              label={m.modelId}
              detail={`${formatPricePer1K(m.fromPer1k)} → ${formatPricePer1K(m.toPer1k)}${m.region === null ? '' : ` · ${m.region}`}`}
              value={`${m.deltaPct > 0 ? '+' : ''}${m.deltaPct.toFixed(1)}%`}
              magnitude={Math.abs(m.deltaPct) / maxMove}
              intent={m.deltaPct > 0 ? 'up' : 'down'}
              title={`${m.modelId} on ${m.hyperscaler} via ${m.source}`}
              href={`/timeline?model=${encodeURIComponent(m.modelId)}`
                + `&source=${encodeURIComponent(m.source)}`
                + `&region=${encodeURIComponent(m.region ?? '')}`}
            />
          ))}
        </Panel>

        <Panel
          eyebrow="prompt caching"
          question="Where does caching pay the most?"
          footnote={`Money saved per 1K cached input tokens, not percent — a 100% discount on a near-free model is worth nothing. ${caching.length} deployments publish a cache-read price.`}
          empty={topCaching.length === 0}
        >
          {topCaching.map((c) => (
            <SignalRow
              key={`${c.modelId}-${c.hyperscaler}`}
              label={c.modelId}
              detail={`${formatPricePer1K(c.inputPer1k)} → ${formatPricePer1K(c.cachedPer1k)} cached · ${c.savingPct.toFixed(0)}% off`}
              value={`−${formatPricePer1K(c.savingPer1k)}`}
              magnitude={c.savingPer1k / maxCache}
              title={`${c.modelId} on ${c.hyperscaler}`}
              href={`/?q=${encodeURIComponent(c.modelId)}`}
            />
          ))}
        </Panel>
      </div>
    </section>
  );
}
