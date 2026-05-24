import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readJson<T>(path: string): Promise<T> {
  const text = await Bun.file(path).text();

  try {
    return JSON.parse(text) as T;
  } catch (error: unknown) {
    throw new Error(`Invalid JSON in ${path}: ${errorMessage(error)}`);
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
