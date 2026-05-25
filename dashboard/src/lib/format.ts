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
  return region ?? '—';
}

export const fmt = new Intl.NumberFormat('en-US');

export function fmtRelative(date: string): string {
  const target = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) {
    return date;
  }
  const now = new Date();
  const days = Math.floor((now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}
