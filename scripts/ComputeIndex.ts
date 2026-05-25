#!/usr/bin/env bun
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { PriceRecord } from './lib/types.ts';
import { computeIndex } from './lib/index-compute.ts';
import type { IndexSpec, IndexResult } from './lib/index-compute.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DATA_CURRENT = join(REPO_ROOT, 'data', 'current.json');
const MEMBERS_DIR = join(REPO_ROOT, 'indices', 'members');
const OUTPUT_DIR = join(REPO_ROOT, 'data', 'indices');

function usage(): never {
  console.error('usage: bun scripts/ComputeIndex.ts <index-name> [--max-divergence=PCT]');
  console.error('  <index-name>   matches indices/members/<index-name>.json');
  console.error('  --max-divergence  optional CI gate; non-zero exit if |index_divergence_pct| > PCT');
  process.exit(2);
}

function parseArgs(argv: string[]): { indexName: string; maxDivergencePct: number | null } {
  const positional: string[] = [];
  let maxDivergencePct: number | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--max-divergence=')) {
      const raw = arg.slice('--max-divergence='.length);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        console.error(`invalid --max-divergence value: ${raw}`);
        process.exit(2);
      }
      maxDivergencePct = parsed;
    } else if (arg.startsWith('-')) {
      console.error(`unknown flag: ${arg}`);
      usage();
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1 || positional[0] === undefined) {
    usage();
  }
  return { indexName: positional[0], maxDivergencePct };
}

async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as T;
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `$${value.toFixed(4)}`;
}

function formatDivergence(pct: number | undefined): string {
  if (pct === undefined || !Number.isFinite(pct)) {
    return '—';
  }
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function printReport(result: IndexResult): void {
  console.log(`\n=== Index: ${result.name} ===`);
  if (result.description !== undefined) {
    console.log(result.description);
  }
  console.log(`Data source:                 ${result.data_source}`);
  console.log(`Members configured:          ${result.member_count}`);
  console.log(`Members resolved:            ${result.members_resolved}`);
  console.log(`Members with invalid price:  ${result.members_with_invalid_price}`);
  console.log(`Blend ratio:                 input ${result.blend.input}, output ${result.blend.output}\n`);

  console.log('Member resolution:');
  for (const m of result.members) {
    if (m.resolved === null) {
      console.log(`  ✗ ${m.label.padEnd(22)} UNRESOLVED — no selector matched`);
      continue;
    }
    if (m.excluded_reason === 'non_positive_blended_price' || m.excluded_reason === 'non_finite_blended_price') {
      console.log(
        `  ⚠ ${m.label.padEnd(22)} EXCLUDED — ${m.excluded_reason} (resolved ${m.resolved.source}/${m.resolved.model_id} with blended=${m.blended_per_million})`,
      );
      continue;
    }
    const blendedStr = formatPrice(m.blended_per_million);
    const publishedStr = m.published_blended_per_million === undefined
      ? '—'
      : formatPrice(m.published_blended_per_million);
    const divStr = formatDivergence(m.divergence_pct);
    console.log(
      `  ✓ ${m.label.padEnd(22)} ${blendedStr.padStart(10)}  vs published ${publishedStr.padStart(10)}  ${divStr.padStart(8)}  ${m.resolved.source}/${m.resolved.model_id}`,
    );
  }

  console.log('\nResults:');
  console.log(`  Geometric mean (TPI):  ${formatPrice(result.geometric_mean_usd_per_million)} per million tokens`);
  console.log(`  Arithmetic mean:       ${formatPrice(result.arithmetic_mean_usd_per_million)} per million tokens (reference)`);
  if (result.published_value_usd_per_million !== undefined) {
    console.log(`  Published value:       ${formatPrice(result.published_value_usd_per_million)} per million tokens`);
    console.log(`  Index divergence:      ${formatDivergence(result.index_divergence_pct)}`);
  }
}

async function main(): Promise<void> {
  const { indexName, maxDivergencePct } = parseArgs(process.argv.slice(2));

  const specPath = join(MEMBERS_DIR, `${indexName}.json`);
  if (!existsSync(specPath)) {
    console.error(`spec not found: ${specPath}`);
    process.exit(1);
  }
  if (!existsSync(DATA_CURRENT)) {
    console.error(`data/current.json not found at ${DATA_CURRENT}`);
    process.exit(1);
  }

  const spec = await readJsonFile<IndexSpec>(specPath);
  const records = await readJsonFile<PriceRecord[]>(DATA_CURRENT);
  const result = computeIndex(records, spec, { dataSource: 'data/current.json' });

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, `${indexName}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');

  printReport(result);
  console.log(`\nWrote ${outPath}`);

  if (maxDivergencePct !== null) {
    // Refuse to silently pass the CI gate when divergence cannot be
    // evaluated. Either the spec lacks `published_value_usd_per_million`
    // (nothing to compare against) or the index computation produced a
    // null geometric mean (e.g. invalid-priced members). Failing loudly
    // is the only honest behavior — a green CI signal here would falsely
    // imply the threshold was checked.
    if (result.geometric_mean_usd_per_million === null) {
      console.error(
        `\nFAIL: --max-divergence=${maxDivergencePct}% requested but geometric_mean_usd_per_million is null` +
          (result.members_with_invalid_price > 0
            ? ` (${result.members_with_invalid_price} member(s) with invalid price)`
            : ''),
      );
      process.exit(1);
    }
    if (result.published_value_usd_per_million === undefined) {
      console.error(
        `\nFAIL: --max-divergence=${maxDivergencePct}% requested but the spec has no published_value_usd_per_million to compare against`,
      );
      process.exit(1);
    }
    if (result.index_divergence_pct === undefined) {
      console.error(
        `\nFAIL: --max-divergence=${maxDivergencePct}% requested but index_divergence_pct could not be computed`,
      );
      process.exit(1);
    }
    const absolute = Math.abs(result.index_divergence_pct);
    if (absolute > maxDivergencePct) {
      console.error(
        `\nFAIL: index divergence ${formatDivergence(result.index_divergence_pct)} exceeds --max-divergence=${maxDivergencePct}%`,
      );
      process.exit(1);
    }
    console.log(
      `\nPASS: index divergence ${formatDivergence(result.index_divergence_pct)} within --max-divergence=${maxDivergencePct}%`,
    );
  }

  const unresolved = result.members.filter((m) => m.resolved === null);
  if (unresolved.length > 0) {
    console.warn(`\nWARNING: ${unresolved.length} member(s) unresolved:`);
    for (const m of unresolved) {
      console.warn(`  - ${m.label}`);
    }
  }
}

await main();
