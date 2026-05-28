import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '../lib/cn';
import { loadAllIndexHistories, loadAllIndices } from '../lib/indices';
import type { IndexHistory, IndexMember, IndexResult } from '../lib/indices';

type DisplayLabel = { title: string; tagline: string };

const DISPLAY_LABELS: Record<string, DisplayLabel> = {
  'atpi-replica': {
    title: 'ATPI Replica',
    tagline: 'The 16-member, 70/30 input/output reference index.',
  },
  'tpi-frontier': {
    title: 'TPI Frontier',
    tagline: 'Reference members with blended ≥ $5/M tokens — the cutting-edge cost frontier.',
  },
  'tpi-mid': {
    title: 'TPI Mid',
    tagline: 'Reference members at $1–$5/M tokens — the everyday production range.',
  },
  'tpi-fast': {
    title: 'TPI Fast',
    tagline: 'Reference members under $1/M tokens — the cost-optimised edge.',
  },
  'tpi-channel-direct': {
    title: 'TPI Direct',
    tagline: 'Reference members invoked through their provider’s first-party API.',
  },
  'tpi-channel-aggregator': {
    title: 'TPI Aggregator',
    tagline: 'Reference members invoked through OpenRouter / Vercel AI Gateway / Together / Novita.',
  },
  'tpi-channel-bedrock': {
    title: 'TPI Bedrock',
    tagline: 'Reference members invoked through AWS Bedrock — Anthropic + Mistral footprint.',
  },
  'tpi-channel-azure': {
    title: 'TPI Azure',
    tagline: 'Reference members invoked through Azure OpenAI + AI Foundry — OpenAI + Anthropic + Mistral.',
  },
  'tpi-region-useast': {
    title: 'TPI US East',
    tagline: 'AWS us-east-1 + Azure eastus — 19 frontier-shaped Bedrock + Azure OpenAI families.',
  },
  'tpi-region-eu': {
    title: 'TPI EU',
    tagline: 'AWS eu-west-1 + Azure westeurope — same 19-member candidate set as US East.',
  },
  'tpi-region-apac': {
    title: 'TPI APAC',
    tagline: 'AWS ap-southeast-1 + Azure southeastasia — regional availability is currently thinner.',
  },
};

function formatIndexValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `$${value.toFixed(2)}`;
}

function formatPerMillion(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `$${value.toFixed(4)}`;
}

function formatDivergence(pct: number | undefined): string {
  if (pct === undefined || !Number.isFinite(pct)) {
    return '—';
  }
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function divergenceTone(pct: number | undefined): string {
  if (pct === undefined) {
    return 'text-ink-600';
  }
  const abs = Math.abs(pct);
  if (abs < 1) {
    return 'text-emerald-400';
  }
  if (abs < 5) {
    return 'text-amber-400';
  }
  return 'text-ink-600';
}

function memberRowTone(member: IndexMember): string {
  if (member.excluded_reason === 'unresolved') {
    return 'text-ink-500';
  }
  if (member.excluded_reason !== undefined) {
    return 'text-amber-400';
  }
  return 'text-ink-700';
}

function memberStatusLabel(member: IndexMember): string {
  if (member.excluded_reason === 'unresolved') {
    return 'unresolved';
  }
  if (member.excluded_reason === 'non_positive_blended_price') {
    return 'invalid: ≤$0';
  }
  if (member.excluded_reason === 'non_finite_blended_price') {
    return 'invalid: NaN';
  }
  return 'resolved';
}

function changeTone(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return 'text-ink-600';
  }
  if (Math.abs(pct) < 0.01) {
    return 'text-ink-600';
  }
  return pct > 0 ? 'text-amber-400' : 'text-emerald-400';
}

function strokeColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Math.abs(pct) < 0.01) {
    return '#94a3b8';
  }
  return pct > 0 ? '#fbbf24' : '#34d399';
}

interface SparklineProps {
  history: IndexHistory;
}

function Sparkline({ history }: SparklineProps): JSX.Element | null {
  const points = history.series
    .filter((p): p is typeof p & { geometric_mean_usd_per_million: number } =>
      p.geometric_mean_usd_per_million !== null && Number.isFinite(p.geometric_mean_usd_per_million),
    )
    .map((p) => ({ date: p.date, value: p.geometric_mean_usd_per_million }));

  if (points.length < 2) {
    // Single-point series — render nothing; let the card surface earliest/latest text only.
    return null;
  }

  const stroke = strokeColor(history.pct_change_earliest_to_latest);

  return (
    <div className="h-10 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            cursor={false}
            contentStyle={{
              background: 'rgba(11, 15, 20, 0.95)',
              border: '1px solid rgba(58, 70, 84, 0.4)',
              borderRadius: 8,
              fontSize: 11,
            }}
            itemStyle={{ color: 'rgb(229 231 235)' }}
            labelStyle={{ color: 'rgb(148 163 184)' }}
            formatter={(value: number) => [`$${value.toFixed(4)}/M`, 'index']}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface IndexCardProps {
  index: IndexResult;
  history?: IndexHistory;
  expanded: boolean;
  onToggle: () => void;
}

function IndexCard({ index, history, expanded, onToggle }: IndexCardProps): JSX.Element {
  const label = DISPLAY_LABELS[index.name] ?? { title: index.name, tagline: index.description ?? '' };
  const reference = index.published_value_usd_per_million;

  return (
    <article className="card overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-4 p-5 text-left transition hover:bg-ink-200/20"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'mt-1 h-4 w-4 shrink-0 text-ink-600 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <div className="flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">{index.name}</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink-900">{label.title}</h3>
          <p className="mt-1 text-sm text-ink-600">{label.tagline}</p>
          {history !== undefined && history.series.length > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <Sparkline history={history} />
              {history.earliest_date !== null && history.latest_date !== null && (
                <div className="font-mono text-[11px]">
                  {(() => {
                    const finitePoints = history.series.filter(
                      (point) => point.geometric_mean_usd_per_million !== null
                        && Number.isFinite(point.geometric_mean_usd_per_million),
                    ).length;
                    // One finite point — calling it 'stable' is misleading; show
                    // the snapshot count so it's obvious the time-series is just
                    // starting (typically the regional indices, which only began
                    // accumulating regional data once aws-pricelist + azure-retail
                    // ingestion landed).
                    if (finitePoints < 2) {
                      return (
                        <>
                          <span className="text-ink-600">{finitePoints} snapshot</span>
                          <span className="ml-2 text-ink-500">{history.latest_date}</span>
                        </>
                      );
                    }
                    return (
                      <>
                        <span className={changeTone(history.pct_change_earliest_to_latest)}>
                          {history.stable
                            ? 'stable'
                            : `${(history.pct_change_earliest_to_latest ?? 0) >= 0 ? '+' : ''}${(history.pct_change_earliest_to_latest ?? 0).toFixed(2)}%`}
                        </span>
                        <span className="ml-2 text-ink-500">
                          {history.earliest_date === history.latest_date
                            ? history.latest_date
                            : `${history.earliest_date} → ${history.latest_date}`}
                        </span>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="num-display text-3xl text-ink-900">
            {formatIndexValue(index.geometric_mean_usd_per_million)}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">per 1M tokens</p>
          <p className="mt-1 font-mono text-[11px] text-ink-600">
            {index.members_resolved}/{index.member_count} members
          </p>
          {reference !== undefined && index.index_divergence_pct !== undefined && (
            <p className={cn('mt-1 font-mono text-[11px]', divergenceTone(index.index_divergence_pct))}>
              {formatDivergence(index.index_divergence_pct)} vs published {formatIndexValue(reference)}
            </p>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-ink-300/20 px-5 py-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-300/10">
                <th scope="col" className="py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Member</th>
                <th scope="col" className="py-2 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Blended ($/M)</th>
                <th scope="col" className="py-2 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Published</th>
                <th scope="col" className="py-2 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Divergence</th>
                <th scope="col" className="py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">Source</th>
              </tr>
            </thead>
            <tbody>
              {index.members.map((member) => (
                <tr key={member.label} className={cn('border-b border-ink-300/5 last:border-0', memberRowTone(member))}>
                  <td className="py-2 pr-2 align-top">
                    <span className="text-ink-900">{member.label}</span>
                    {member.excluded_reason !== undefined && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
                        {memberStatusLabel(member)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right num-display">{formatPerMillion(member.blended_per_million)}</td>
                  <td className="py-2 pr-2 text-right num-display text-ink-600">
                    {member.published_blended_per_million === undefined
                      ? '—'
                      : formatPerMillion(member.published_blended_per_million)}
                  </td>
                  <td className={cn('py-2 pr-2 text-right num-display', divergenceTone(member.divergence_pct))}>
                    {formatDivergence(member.divergence_pct)}
                  </td>
                  <td className="py-2 text-ink-600">
                    {member.resolved === null
                      ? '—'
                      : `${member.resolved.source}/${member.resolved.model_id}${member.resolved.region !== null ? ` @${member.resolved.region}` : ''}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {index.description !== undefined && (
            <p className="mt-3 text-xs text-ink-600">{index.description}</p>
          )}
        </div>
      )}
    </article>
  );
}

interface GroupHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
}

function GroupHeader({ eyebrow, title, description }: GroupHeaderProps): JSX.Element {
  return (
    <div className="mb-4">
      <p className="h-eyebrow mb-2">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-600">{description}</p>
    </div>
  );
}

export default function Indices(): JSX.Element {
  const [indices, setIndices] = useState<IndexResult[]>([]);
  const [histories, setHistories] = useState<Map<string, IndexHistory>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void Promise.all([loadAllIndices(), loadAllIndexHistories()])
      .then(([results, historyMap]) => {
        if (active) {
          setIndices(results);
          setHistories(historyMap);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason : new Error('Unable to load indices'));
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [requestAttempt]);

  const grouped = useMemo(() => {
    const reference = indices.filter((index) => index.name === 'atpi-replica');
    const tier = indices.filter((index) => index.name.startsWith('tpi-')
      && !index.name.startsWith('tpi-channel-')
      && !index.name.startsWith('tpi-region-'));
    const channel = indices.filter((index) => index.name.startsWith('tpi-channel-'));
    const region = indices.filter((index) => index.name.startsWith('tpi-region-'));
    return { reference, tier, channel, region };
  }, [indices]);

  function toggle(slug: string): void {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  function retry(): void {
    setRequestAttempt((attempt) => attempt + 1);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-ink-700">
        <div className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
        <span className="font-mono text-sm">loading indices…</span>
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

  const atpi = grouped.reference[0];

  return (
    <div>
      <header className="mb-10">
        <p className="h-eyebrow mb-3">indices</p>
        <h1 className="h-section">The frontier of inference, priced eleven ways.</h1>
        <p className="mt-4 max-w-2xl text-ink-600">
          Eleven indices over one open catalog. Built on{' '}
          <a
            href="https://tokenpriceindex.com/methodology"
            target="_blank"
            rel="noreferrer"
            className="text-accent-500 underline-offset-2 transition hover:underline"
          >
            tokenpriceindex.com&rsquo;s methodology
          </a>{' '}
          — the same 16-member curation and 70/30 input/output blend — and extended with
          additional lenses (tier, channel, region) reproducible from our public catalog. The
          geometric-mean formula is the same in every index; only the membership filter changes.
          Click any card to inspect the resolved members and the per-member divergence against
          published prices.
        </p>
      </header>

      {atpi !== undefined && (
        <section className="mb-12">
          <GroupHeader
            eyebrow="reference index"
            title="ATPI Replica"
            description="The reference index against which the other ten are derived — same geometric-mean formula, different membership filters."
          />
          <IndexCard
            index={atpi}
            history={histories.get(atpi.name)}
            expanded={expanded.has(atpi.name)}
            onToggle={() => toggle(atpi.name)}
          />
        </section>
      )}

      <section className="mb-12">
        <GroupHeader
          eyebrow="by capability tier"
          title="Tier indices"
          description="The same 16 members partitioned by their published blended price — a mechanical price-threshold split rather than an editorial one, so the partition is reproducible. Frontier (≥ $5/M), Mid ($1–$5/M), Fast (< $1/M)."
        />
        <div className="space-y-3">
          {grouped.tier.map((index) => (
            <IndexCard
              key={index.name}
              index={index}
              history={histories.get(index.name)}
              expanded={expanded.has(index.name)}
              onToggle={() => toggle(index.name)}
            />
          ))}
        </div>
      </section>

      <section className="mb-12">
        <GroupHeader
          eyebrow="by deployment channel"
          title="Channel indices"
          description="The same 16 members, filtered by deployment channel — aggregator, provider-direct, AWS Bedrock, Azure OpenAI. A lens that extends the reference index along the channel dimension our catalog carries: cloud channels run roughly 50–90% above aggregator pricing in the data we currently have, and host fewer than half of the 16 reference members today."
        />
        <div className="space-y-3">
          {grouped.channel.map((index) => (
            <IndexCard
              key={index.name}
              index={index}
              history={histories.get(index.name)}
              expanded={expanded.has(index.name)}
              onToggle={() => toggle(index.name)}
            />
          ))}
        </div>
      </section>

      <section className="mb-12">
        <GroupHeader
          eyebrow="by cloud region"
          title="Regional indices"
          description="A different 19-member set — frontier-shaped families that carry per-region pricing in our aws-pricelist and azure-retail sources. Three canonical region pairs: AWS us-east-1 + Azure eastus, AWS eu-west-1 + Azure westeurope, AWS ap-southeast-1 + Azure southeastasia. Member resolution per card surfaces how regional capability availability varies: full coverage in US East, slightly thinner in EU, more limited in APAC."
        />
        <div className="space-y-3">
          {grouped.region.map((index) => (
            <IndexCard
              key={index.name}
              index={index}
              history={histories.get(index.name)}
              expanded={expanded.has(index.name)}
              onToggle={() => toggle(index.name)}
            />
          ))}
        </div>
      </section>

      <section className="card p-5">
        <p className="h-eyebrow mb-2">downloads</p>
        <p className="text-sm text-ink-600">
          Every index is published as a raw JSON file under{' '}
          <code className="font-mono text-ink-700">data/indices/</code> with full provenance —
          resolved record, blended price per member, geometric and arithmetic means, divergence
          against published values where available. The compute lib that produces these is in{' '}
          <code className="font-mono text-ink-700">scripts/lib/index-compute.ts</code>; the
          member sets are static JSON under{' '}
          <code className="font-mono text-ink-700">indices/members/</code>.
        </p>
      </section>
    </div>
  );
}
