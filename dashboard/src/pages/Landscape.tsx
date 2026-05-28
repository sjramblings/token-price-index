import { useEffect, useMemo, useState } from 'react';
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { loadCurrent } from '../lib/data';
import {
  buildAvailabilityRows,
  buildProviderHyperscalerSankey,
} from '../lib/landscape';
import type {
  AvailabilityRow,
  SankeyDatum,
} from '../lib/landscape';
import type { Hyperscaler, PriceRecord } from '../lib/types';

const HYPERSCALER_ORDER: Hyperscaler[] = ['aws', 'azure', 'gcp', 'direct', 'aggregator'];

const HYPERSCALER_COLOR: Record<Hyperscaler, string> = {
  aws: '#FF9900',
  azure: '#22D3D9',
  gcp: '#34D399',
  direct: '#A78BFA',
  aggregator: '#F472B6',
};

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: '#F59E0B',
  openai: '#10B981',
  google: '#0EA5E9',
  meta: '#8B5CF6',
  mistral: '#F43F5E',
  cohere: '#06B6D4',
  amazon: '#F97316',
  microsoft: '#3B82F6',
  xai: '#EC4899',
  deepseek: '#6366F1',
  alibaba: '#14B8A6',
  nvidia: '#84CC16',
};

function colorForProvider(provider: string): string {
  return PROVIDER_COLOR[provider] ?? '#9CA3AF';
}

interface SankeyNodeShapeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: { name: string; kind: 'provider' | 'hyperscaler' };
  containerWidth: number;
}

function SankeyNodeShape(props: SankeyNodeShapeProps): JSX.Element {
  const { x, y, width, height, payload, containerWidth } = props;
  const fill = payload.kind === 'provider'
    ? colorForProvider(payload.name)
    : HYPERSCALER_COLOR[payload.name as Hyperscaler] ?? '#9CA3AF';
  const isRight = x + width > containerWidth / 2;
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.85} />
      <text
        x={isRight ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isRight ? 'end' : 'start'}
        dominantBaseline="middle"
        fontSize={11}
        fontFamily="Geist Mono, monospace"
        fill="rgb(229 231 235)"
      >
        {payload.name}
      </text>
    </Layer>
  );
}

function AvailabilityMatrix({ rows }: { rows: AvailabilityRow[] }): JSX.Element {
  const topRows = rows.slice(0, 40);
  return (
    <div className="card overflow-hidden p-0">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-0 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-ink-600 md:px-7">
        <span>family · provider</span>
        <span className="text-right">substrates</span>
        <span className="text-right">SKUs</span>
      </div>
      <div className="divide-y divide-ink-300/15">
        {topRows.map((row) => (
          <div
            key={`${row.provider}::${row.family}`}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-5 py-3 transition hover:bg-ink-200/30 md:px-7"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-ink-900">{row.family}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">
                {row.provider}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {HYPERSCALER_ORDER.map((hyperscaler) => {
                const present = row.hyperscalers.includes(hyperscaler);
                return (
                  <span
                    key={hyperscaler}
                    title={`${hyperscaler}${present ? '' : ' (not available)'}`}
                    className="h-3.5 w-3.5 rounded-sm"
                    style={{
                      background: present ? HYPERSCALER_COLOR[hyperscaler] : 'transparent',
                      border: present ? 'none' : '1px solid rgb(58 70 84 / 0.4)',
                    }}
                  />
                );
              })}
            </div>
            <p className="text-right font-mono text-xs text-ink-700">{row.modelCount}</p>
          </div>
        ))}
      </div>
      {rows.length > topRows.length && (
        <div className="border-t border-ink-300/15 px-5 py-3 text-[11px] text-ink-600 md:px-7">
          showing top {topRows.length} of {rows.length} families — sorted by substrate count, then SKUs
        </div>
      )}
      <div className="border-t border-ink-300/15 px-5 py-3 md:px-7">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {HYPERSCALER_ORDER.map((hyperscaler) => (
            <div key={hyperscaler} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: HYPERSCALER_COLOR[hyperscaler] }}
              />
              <span className="font-mono text-[11px] text-ink-700">{hyperscaler}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderHyperscalerSankey({ data }: { data: SankeyDatum }): JSX.Element {
  if (data.nodes.length === 0 || data.links.length === 0) {
    return (
      <div className="card p-7 text-center text-sm text-ink-600">
        No flow data available.
      </div>
    );
  }
  return (
    <div className="card p-5 md:p-7">
      <div className="h-[28rem] md:h-[34rem]">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={data}
            nodePadding={18}
            nodeWidth={10}
            iterations={48}
            link={{ stroke: 'rgb(148 163 184 / 0.35)' }}
            node={(nodeProps: SankeyNodeShapeProps) => <SankeyNodeShape {...nodeProps} />}
            margin={{ top: 16, right: 96, bottom: 16, left: 96 }}
          >
            <Tooltip
              contentStyle={{
                background: 'rgba(11, 15, 20, 0.95)',
                border: '1px solid rgb(58 70 84 / 0.4)',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'Geist Mono, monospace',
              }}
              labelStyle={{ color: 'rgb(229 231 235)' }}
              itemStyle={{ color: 'rgb(229 231 235)' }}
              formatter={(value: number) => [`${value} SKUs`, 'flow']}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Landscape(): JSX.Element {
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadCurrent()
      .then((next) => {
        if (active) {
          setRecords(next);
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

  const availability = useMemo(() => buildAvailabilityRows(records), [records]);
  const sankey = useMemo(() => buildProviderHyperscalerSankey(records), [records]);

  function retry(): void {
    setRequestAttempt((attempt) => attempt + 1);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-ink-700">
        <div className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
        <span className="font-mono text-sm">loading landscape…</span>
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
      <header className="mb-10">
        <p className="h-eyebrow mb-3">landscape</p>
        <h1 className="h-section">Who&rsquo;s on what substrate.</h1>
        <p className="mt-4 max-w-2xl text-ink-600">
          Two views on the same question: which providers route which models through which
          hyperscalers, and which model families are everywhere versus exclusive. The Sankey
          flow weights are SKU counts — every distinct <code className="font-mono text-ink-700">(provider, hyperscaler, model_id, region)</code>{' '}
          tuple in the current snapshot. The availability matrix collapses regions and counts
          unique families across substrates.
        </p>
      </header>

      <section className="mb-12">
        <div className="mb-5">
          <p className="h-eyebrow mb-2">flow</p>
          <h2 className="text-xl font-semibold tracking-tight text-ink-900 md:text-2xl">Provider → Hyperscaler</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Each band&rsquo;s width is the number of SKUs flowing from that provider through that
            substrate. Multi-substrate providers fan out; substrate-exclusive providers stay
            single-band. Hover for exact counts.
          </p>
        </div>
        <ProviderHyperscalerSankey data={sankey} />
      </section>

      <section className="mb-12">
        <div className="mb-5">
          <p className="h-eyebrow mb-2">availability</p>
          <h2 className="text-xl font-semibold tracking-tight text-ink-900 md:text-2xl">Multi-substrate availability</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Model families ranked by how many hyperscalers carry them. Families at the top are
            de-facto commodities — pick your substrate by latency, IAM boundary, or compliance,
            not by &ldquo;is it available here.&rdquo; Families at the bottom are single-substrate
            today — those are the genuine substrate-exclusive plays.
          </p>
        </div>
        <AvailabilityMatrix rows={availability} />
      </section>
    </div>
  );
}
