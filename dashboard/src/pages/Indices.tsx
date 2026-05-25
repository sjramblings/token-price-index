import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { loadAllIndices } from '../lib/indices';
import type { IndexMember, IndexResult } from '../lib/indices';

type DisplayLabel = { title: string; tagline: string };

const DISPLAY_LABELS: Record<string, DisplayLabel> = {
  'atpi-replica': {
    title: 'ATPI Replica',
    tagline: 'Replication of tokenpriceindex.com on our open catalog — 16 members, geometric mean.',
  },
  'tpi-frontier': {
    title: 'TPI Frontier',
    tagline: 'ATPI members with blended ≥ $5/M tokens — the cutting-edge cost frontier.',
  },
  'tpi-mid': {
    title: 'TPI Mid',
    tagline: 'ATPI members at $1–$5/M tokens — the everyday production range.',
  },
  'tpi-fast': {
    title: 'TPI Fast',
    tagline: 'ATPI members under $1/M tokens — the cost-optimised edge.',
  },
  'tpi-channel-direct': {
    title: 'TPI Direct',
    tagline: "Same 16 members, provider's first-party API only.",
  },
  'tpi-channel-aggregator': {
    title: 'TPI Aggregator',
    tagline: 'Same 16 members, OpenRouter / Vercel AI Gateway / Together / Novita.',
  },
  'tpi-channel-bedrock': {
    title: 'TPI Bedrock',
    tagline: 'Same 16 members, AWS Bedrock only — the major-cloud Anthropic + Mistral footprint.',
  },
  'tpi-channel-azure': {
    title: 'TPI Azure',
    tagline: 'Same 16 members, Azure OpenAI + AI Foundry — OpenAI + Anthropic + Mistral.',
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

interface IndexCardProps {
  index: IndexResult;
  expanded: boolean;
  onToggle: () => void;
}

function IndexCard({ index, expanded, onToggle }: IndexCardProps): JSX.Element {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadAllIndices()
      .then((results) => {
        if (active) {
          setIndices(results);
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
    const tier = indices.filter((index) => index.name.startsWith('tpi-') && !index.name.startsWith('tpi-channel-'));
    const channel = indices.filter((index) => index.name.startsWith('tpi-channel-'));
    return { reference, tier, channel };
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
        <h1 className="h-section">The frontier of inference, priced eight ways.</h1>
        <p className="mt-4 max-w-2xl text-ink-600">
          The same 16 frontier-tier models, projected through tier, channel, and (soon) regional
          lenses. The geometric-mean formula and 70/30 input/output blend are the same in every
          index — only the membership filter changes. Click any card to inspect the resolved
          members and per-member divergence against published prices.
        </p>
      </header>

      {atpi !== undefined && (
        <section className="mb-12">
          <GroupHeader
            eyebrow="reference index"
            title="ATPI Replica"
            description="Our reproduction of tokenpriceindex.com's published index on the same 16 members and 70/30 input/output blend. Validates that our catalog produces the right answer when the inputs match."
          />
          <IndexCard
            index={atpi}
            expanded={expanded.has(atpi.name)}
            onToggle={() => toggle(atpi.name)}
          />
        </section>
      )}

      <section className="mb-12">
        <GroupHeader
          eyebrow="by capability tier"
          title="Tier indices"
          description="ATPI's 16 members partitioned by published blended price — no editorial judgement, just a price threshold. Frontier (≥ $5/M), Mid ($1–$5/M), Fast (< $1/M)."
        />
        <div className="space-y-3">
          {grouped.tier.map((index) => (
            <IndexCard
              key={index.name}
              index={index}
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
          description="Same 16 members, hyperscaler filter applied. Surfaces the deployment-channel gap ATPI structurally cannot show: cloud channels are 50–90% more expensive than aggregators and cover less than half of ATPI's frontier set."
        />
        <div className="space-y-3">
          {grouped.channel.map((index) => (
            <IndexCard
              key={index.name}
              index={index}
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
