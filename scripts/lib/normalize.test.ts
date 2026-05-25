import { describe, expect, test } from 'bun:test';
import { extractFamily, inferHyperscalerFromLitellm } from './normalize.ts';
import type { Hyperscaler } from './types.ts';

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
    ['bedrock/openai.gpt-oss-120b', 'gpt-oss-120b'],
    ['bedrock/google.gemini-2.5-pro', 'gemini-2-5-pro'],
    ['bedrock/qwen.qwen3-32b', 'qwen3-32b'],
    ['bedrock/deepseek.deepseek-v3.1', 'deepseek-v3.1'],
    ['gpt-4o-0806', 'gpt-4o'],
    ['gpt-4o-1120', 'gpt-4o'],
    ['gpt-4.5-0227', 'gpt-4.5'],
    ['o1-1217', 'o1'],
    ['o3-0416', 'o3'],
    ['gpt-35-turbo', 'gpt-3.5-turbo'],
    ['gpt-35-turbo-16k', 'gpt-3.5-turbo-16k'],
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

  test('dotted-vendor and slashed-vendor forms converge — openai/gpt-oss-120b', () => {
    expect(extractFamily('bedrock/openai.gpt-oss-120b')).toBe(
      extractFamily('openrouter/openai/gpt-oss-120b'),
    );
  });

  test('dotted-vendor and slashed-vendor forms converge — qwen3-32b', () => {
    expect(extractFamily('bedrock/qwen.qwen3-32b')).toBe(
      extractFamily('openrouter/qwen/qwen3-32b'),
    );
  });

  test('does not eat dotted suffixes that look like vendors but are not — ollama/llama3.1', () => {
    expect(extractFamily('ollama/llama3.1')).not.toBe('1');
    expect(extractFamily('ollama/llama3.1').length).toBeGreaterThan(1);
  });
});

describe('inferHyperscalerFromLitellm — data-driven via litellm_provider', () => {
  const hyperscalerCases: Array<[string, string | undefined, Hyperscaler]> = [
    ['claude-opus-4-7', 'anthropic', 'direct'],
    ['anthropic.claude-opus-4-7', 'bedrock_converse', 'aws'],
    ['us.anthropic.claude-opus-4-7', 'bedrock_converse', 'aws'],
    ['eu.anthropic.claude-opus-4-7', 'bedrock_converse', 'aws'],
    ['au.anthropic.claude-opus-4-7', 'bedrock_converse', 'aws'],
    ['global.anthropic.claude-opus-4-7', 'bedrock_converse', 'aws'],
    ['azure_ai/claude-opus-4-7', 'azure_ai', 'azure'],
    ['gpt-4o', 'azure', 'azure'],
    ['vertex_ai/claude-opus-4-7', 'vertex_ai-anthropic_models', 'gcp'],
    ['vertex_ai/llama-4', 'vertex_ai-llama_models', 'gcp'],
    ['gemini-2.0-flash', 'gemini', 'gcp'],
    ['openrouter/anthropic/claude-opus-4.7', 'openrouter', 'aggregator'],
    ['together_ai/llama-3', 'together_ai', 'aggregator'],
    ['mistral/large', 'mistral', 'direct'],
    ['deepseek-v3', 'deepseek', 'direct'],
    ['perplexity/anthropic/claude-opus-4-7', 'perplexity', 'direct'],
    ['sagemaker/some-model', 'sagemaker', 'aws'],
    // Fallback path — when litellm_provider is missing, the string-prefix
    // heuristic still works for the obvious cases.
    ['bedrock/anthropic.claude-3-5-sonnet', undefined, 'aws'],
    ['azure/gpt-4', undefined, 'azure'],
    ['vertex_ai/gemini-1.5-pro', undefined, 'gcp'],
    ['openrouter/some-model', undefined, 'aggregator'],
    ['claude-3-5-sonnet', undefined, 'direct'],
  ];

  test.each(hyperscalerCases)(
    '%s (litellm_provider=%s) → %s',
    (modelId: string, provider: string | undefined, expected: Hyperscaler) => {
      expect(inferHyperscalerFromLitellm(modelId, provider)).toBe(expected);
    },
  );
});
