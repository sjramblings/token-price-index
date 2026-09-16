/**
 * Price per 1K tokens, at whatever precision the number actually needs.
 *
 * A flat `toFixed(4)` rendered 210 of 4,099 non-zero prices as `$0.0000` —
 * visually identical to a genuinely free model — and flattened real per-region
 * variation, so every `nova-lite` row read `$0.0001` input in all 11 regions.
 * Four decimals is still the floor, so the common case keeps its familiar
 * column alignment; cheaper prices get up to four significant digits.
 */
export function formatPricePer1K(usd: number): string {
  if (!Number.isFinite(usd)) {
    return '—';
  }
  if (usd === 0) {
    return '$0';
  }

  // Smallest exponent that keeps four significant digits, floored at 4dp.
  const magnitude = Math.floor(Math.log10(Math.abs(usd)));
  const digits = Math.min(Math.max(4, 3 - magnitude), 10);
  // Trim significant-digit padding (`$0.01500` → `$0.0150`) without dropping
  // below the 4dp floor that keeps the column aligned.
  const trimmed = usd.toFixed(digits).replace(/(\.\d{4}\d*?)0+$/, '$1');
  return `$${trimmed}`;
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

/** Whole days between a `YYYY-MM-DD` date and now; negative if in the future. */
export function daysSince(date: string): number {
  const target = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) {
    return 0;
  }
  return Math.floor((Date.now() - target.getTime()) / (1000 * 60 * 60 * 24));
}

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
