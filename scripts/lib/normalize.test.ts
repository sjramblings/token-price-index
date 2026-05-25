import { describe, expect, test } from 'bun:test';
import { extractFamily } from './normalize.ts';

describe('extractFamily', () => {
  const familyCases: Array<[string, string]> = [
    ['gpt-4.1', 'gpt-4.1'],
    ['azure/gpt-4.1', 'gpt-4.1'],
    ['openai/gpt-4.1', 'gpt-4.1'],
    ['claude-3-5-sonnet', 'claude-3-5-sonnet'],
    ['claude-3.5-sonnet', 'claude-3-5-sonnet'],
    ['anthropic/claude-3.5-sonnet', 'claude-3-5-sonnet'],
    ['openrouter/anthropic/claude-3.5-sonnet', 'claude-3-5-sonnet'],
    ['bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0', 'claude-3-5-sonnet'],
    ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet'],
    ['vertex_ai/gemini-1.5-pro', 'gemini-1-5-pro'],
  ];

  test.each(familyCases)('%s maps to %s', (modelId: string, expected: string) => {
    expect(extractFamily(modelId)).toBe(expected);
  });

  test('does not reduce gpt-4.1 to its minor version', () => {
    expect(extractFamily('gpt-4.1')).not.toBe('1');
  });

  test('returns a non-empty family for versioned OpenAI identifiers', () => {
    expect(extractFamily('gpt-4.1').length).toBeGreaterThan(0);
  });
});
