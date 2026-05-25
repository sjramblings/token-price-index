export type { Hyperscaler, PriceRecord, Source } from '@scripts/lib/types';

import type { Hyperscaler, Source } from '@scripts/lib/types';

export type SortKey =
  | 'provider'
  | 'model_id'
  | 'hyperscaler'
  | 'region'
  | 'input_per_1k'
  | 'output_per_1k'
  | 'context_window'
  | 'source';

export type SortDirection = 'asc' | 'desc' | null;

export type ExplorerFilterState = {
  query: string;
  hyperscalers: Set<Hyperscaler>;
  source: Source | 'all';
};
