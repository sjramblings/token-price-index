import { readJson, todayISO } from './lib/io.ts';

const DIFF_PATH = 'data/_raw/diff.json';
const CURRENT_PATH = 'data/current.json';
const dryRun = process.argv.includes('--dry-run');

type DiffSummary = {
  added: number;
  removed: number;
  changed: number;
  addedList: unknown[];
  removedList: unknown[];
  changedList: unknown[];
};

type ReleaseModel = { model_id: string; source: string };

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireCount(value: unknown, property: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${DIFF_PATH} property ${property} must be a non-negative integer`);
  }

  return value;
}

function requireDiffSummary(value: unknown): DiffSummary {
  if (!isObject(value)) {
    throw new Error(`${DIFF_PATH} must contain a JSON object`);
  }
  if (
    !Array.isArray(value.addedList)
    || !Array.isArray(value.removedList)
    || !Array.isArray(value.changedList)
  ) {
    throw new Error(`${DIFF_PATH} must contain addedList, removedList, and changedList arrays`);
  }

  return {
    added: requireCount(value.added, 'added'),
    removed: requireCount(value.removed, 'removed'),
    changed: requireCount(value.changed, 'changed'),
    addedList: value.addedList,
    removedList: value.removedList,
    changedList: value.changedList,
  };
}

function requireCurrentSourceMap(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) {
    throw new Error(`${CURRENT_PATH} must contain a JSON array of price records`);
  }

  const sources = new Map<string, string>();
  for (const item of value) {
    if (!isObject(item) || typeof item.model_id !== 'string' || typeof item.source !== 'string') {
      throw new Error(`${CURRENT_PATH} contains an invalid price record`);
    }
    if (!sources.has(item.model_id)) {
      sources.set(item.model_id, item.source);
    }
  }

  return sources;
}

function requireReleaseModel(value: unknown, currentSources: Map<string, string>): ReleaseModel {
  if (typeof value === 'string') {
    return { model_id: value, source: currentSources.get(value) ?? 'unknown' };
  }
  if (!isObject(value) || typeof value.model_id !== 'string' || typeof value.source !== 'string') {
    throw new Error(`${DIFF_PATH} contains an invalid added or removed list entry`);
  }

  return { model_id: value.model_id, source: value.source };
}

function requirePrice(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${DIFF_PATH} changed entry ${label} must be a finite number`);
  }

  return value;
}

function formatModelSection(
  title: string,
  count: number,
  values: unknown[],
  currentSources: Map<string, string>,
): string[] {
  const lines = [`## ${title} (${count})`];
  for (const value of values.slice(0, 20)) {
    const item = requireReleaseModel(value, currentSources);
    lines.push(`- ${item.model_id} [${item.source}]`);
  }
  if (count > 20) {
    lines.push(`- (${count - 20} more not shown)`);
  }

  return lines;
}

function formatChangedSection(count: number, values: unknown[]): string[] {
  const lines = [`## Changed (${count})`];

  for (const value of values.slice(0, 20)) {
    if (
      !isObject(value)
      || typeof value.model_id !== 'string'
      || !isObject(value.prior)
      || !isObject(value.current)
    ) {
      throw new Error(`${DIFF_PATH} contains an invalid changed list entry`);
    }

    const priorInput = requirePrice(value.prior.input_per_1k, 'prior.input_per_1k');
    const priorOutput = requirePrice(value.prior.output_per_1k, 'prior.output_per_1k');
    const currentInput = requirePrice(value.current.input_per_1k, 'current.input_per_1k');
    const currentOutput = requirePrice(value.current.output_per_1k, 'current.output_per_1k');
    lines.push(
      `- ${value.model_id}: in $${priorInput.toFixed(4)} -> $${currentInput.toFixed(4)} `
        + `/ out $${priorOutput.toFixed(4)} -> $${currentOutput.toFixed(4)}`,
    );
  }
  if (count > 20) {
    lines.push(`- (${count - 20} more not shown)`);
  }

  return lines;
}

function formatNotes(summary: DiffSummary, currentSources: Map<string, string>): string {
  return [
    ...formatModelSection('Added', summary.added, summary.addedList, currentSources),
    '',
    ...formatModelSection('Removed', summary.removed, summary.removedList, currentSources),
    '',
    ...formatChangedSection(summary.changed, summary.changedList),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  if (!(await Bun.file(DIFF_PATH).exists())) {
    console.error('[BuildRelease] diff.json missing -- run Diff.ts first');
    process.exit(1);
  }

  const summary = requireDiffSummary(await readJson<unknown>(DIFF_PATH));
  if (summary.added + summary.removed + summary.changed === 0) {
    console.log('[BuildRelease] no content changes -- skipping release');
    process.exit(0);
  }

  const currentSources = requireCurrentSourceMap(await readJson<unknown>(CURRENT_PATH));
  const date = todayISO();
  const tag = `v${date.replace(/-/g, '.')}`;
  const notes = formatNotes(summary, currentSources);

  if (dryRun) {
    console.log(`--- TAG ---\n${tag}\n--- NOTES ---\n${notes}`);
    process.exit(0);
  }

  const notesPath = `data/_raw/release-notes-${date}.md`;
  await Bun.write(notesPath, notes);

  const proc = Bun.spawn(
    [
      'gh',
      'release',
      'create',
      tag,
      CURRENT_PATH,
      `data/history/${date}.json`,
      '--title',
      tag,
      '--notes-file',
      notesPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      `gh release create failed with exit code ${exitCode}: ${stderr.trim() || stdout.trim()}`,
    );
  }

  console.log(`[BuildRelease] OK -- released ${tag}`);
  process.exit(0);
}

void main().catch((error: unknown): void => {
  console.error(`[BuildRelease] FAIL: ${messageForError(error)}`);
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
