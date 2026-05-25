export function formatPricePer1K(usd: number): string {
  return Number.isFinite(usd) ? `$${usd.toFixed(4)}` : '—';
}

export function formatPricePerMillion(usd: number): string {
  return Number.isFinite(usd) ? `$${(usd * 1000).toFixed(2)} / 1M` : '—';
}

export function formatContextWindow(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return '—';
  }

  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 1000)}K`;
  }

  return `${Math.round(tokens / 1_000_000)}M`;
}

export function formatRegion(region: string | null): string {
  return region ?? 'global';
}
