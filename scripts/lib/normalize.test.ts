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
    // Bedrock cross-region inference profiles (regional prefix + vendor-dot)
    ['eu.anthropic.claude-opus-4-7', 'claude-opus-4-7'],
    ['us.anthropic.claude-opus-4-1', 'claude-opus-4-1'],
    ['global.anthropic.claude-opus-4-5', 'claude-opus-4-5'],
    ['au.anthropic.claude-opus-4-6-v1', 'claude-opus-4-6'],
    ['apac.anthropic.claude-3-5-sonnet', 'claude-3-5-sonnet'],
    // Bedrock bare -v\d+ versioned aliases (no :0 suffix)
    ['claude-opus-4-6-v1', 'claude-opus-4-6'],
    ['claude-opus-4-7-v2', 'claude-opus-4-7'],
    // LiteLLM @-suffix snapshot pins
    ['claude-opus-4-1@20250805', 'claude-opus-4-1'],
    ['claude-opus-4-7@default', 'claude-opus-4-7'],
    ['claude-opus-4@20250514', 'claude-opus-4'],
    // Databricks-rebranded Anthropic SKUs
    ['databricks-claude-opus-4', 'claude-opus-4'],
    ['databricks-claude-opus-4-1', 'claude-opus-4-1'],
    ['databricks-claude-opus-4-5', 'claude-opus-4-5'],
    // Dashed anthropic- re-export form
    ['anthropic-claude-3-opus', 'claude-3-opus'],
    ['anthropic-claude-3.5-sonnet', 'claude-3-5-sonnet'],
    ['anthropic-claude-3.5-haiku', 'claude-3-5-haiku'],
    ['anthropic-claude-3.7-sonnet', 'claude-3-7-sonnet'],
    // Stacked: regional prefix + Bedrock versioned alias collapses to canonical
    ['eu.anthropic.claude-opus-4-6-v1', 'claude-opus-4-6'],
    ['global.anthropic.claude-opus-4-7-v1', 'claude-opus-4-7'],
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

  // Convergence guarantees — every aliasing form of the same model collapses
  // to one family. Before this change the dashboard counted five separate
  // "claude-opus-4-7" families because of LiteLLM's identifier proliferation.
  test('every Claude Opus 4.7 alias converges to claude-opus-4-7', () => {
    const expected = 'claude-opus-4-7';
    const variants = [
      'claude-opus-4-7',
      'claude-opus-4-7@default',
      'claude-opus-4-7@20260416',
      'anthropic/claude-opus-4.7',
      'openrouter/anthropic/claude-opus-4.7',
      'bedrock/anthropic.claude-opus-4-7-v1:0',
      'anthropic.claude-opus-4-7',
      'eu.anthropic.claude-opus-4-7',
      'us.anthropic.claude-opus-4-7',
      'global.anthropic.claude-opus-4-7',
      'au.anthropic.claude-opus-4-7',
      'eu.anthropic.claude-opus-4-7-v1',
      'databricks-claude-opus-4-7',
    ];
    for (const variant of variants) {
      expect(extractFamily(variant)).toBe(expected);
    }
  });

  // The Bedrock '-v1' bare suffix is distinct from the '-v\d+:\d+' tagged form
  // — both must drop. Before this change, only the ':0' form was stripped, so
  // every `-v1` SKU survived as a separate family.
  test('-v\\d+ and -v\\d+:\\d+ both strip', () => {
    expect(extractFamily('claude-opus-4-6-v1')).toBe('claude-opus-4-6');
    expect(extractFamily('claude-opus-4-6-v1:0')).toBe('claude-opus-4-6');
    expect(extractFamily('claude-opus-4-6-v2')).toBe('claude-opus-4-6');
    expect(extractFamily('claude-opus-4-6-v2:1')).toBe('claude-opus-4-6');
  });

  // '@' suffix strip must not leak into model-id bodies that contain '@'
  // elsewhere. (None do today across the four upstream sources, but the
  // regex is `@.*$` so as long as the '@' is followed by suffix-y content
  // this remains a clean prefix-of-tail strip.)
  test('@-suffix strip removes everything from @ to end', () => {
    expect(extractFamily('claude-opus-4-1@20250805')).toBe('claude-opus-4-1');
    expect(extractFamily('claude-opus-4-7@default')).toBe('claude-opus-4-7');
    expect(extractFamily('gpt-4o@stable')).toBe('gpt-4o');
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
