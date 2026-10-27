import { describe, expect, test } from 'bun:test';
import { deriveModelOwner } from './landscape';

function owner(family: string, provider = 'fireworks_ai'): string {
  return deriveModelOwner({ family, provider });
}

describe('deriveModelOwner', () => {
  test('reads the owner off the family name, whatever the route', () => {
    expect(owner('claude-opus-5', 'bedrock_converse')).toBe('anthropic');
    expect(owner('gpt-5.5', 'azure')).toBe('openai');
    expect(owner('gemini-3-pro', 'vertex_ai')).toBe('google');
    expect(owner('llama-4-scout', 'deepinfra')).toBe('meta');
  });

  test('places the owners the prefix chain used to miss', () => {
    expect(owner('glm-5.3')).toBe('z-ai');
    expect(owner('kimi-k3')).toBe('moonshot');
    expect(owner('minimax-m2.1')).toBe('minimax');
    expect(owner('nemotron-3-ultra')).toBe('nvidia');
    expect(owner('mimo-v2.5')).toBe('xiaomi');
    expect(owner('sonar-pro')).toBe('perplexity');
  });

  test('recovers a brand wearing a task prefix', () => {
    // Resellers relabel: these are Z.ai and Moonshot models, not new ones.
    expect(owner('coding-glm-5.3', 'aihubmix')).toBe('z-ai');
    expect(owner('cc-glm-5.1', 'aihubmix')).toBe('z-ai');
    expect(owner('coding-kimi-k3', 'aihubmix')).toBe('moonshot');
    expect(owner('coding-xiaomi-mimo-v2.5', 'aihubmix')).toBe('xiaomi');
  });

  test('matches brand tokens on word boundaries, not as substrings', () => {
    // "phi" inside "sophia", "command" inside "commander" — neither is a hit.
    expect(owner('sophia-7b', 'novita')).toBe('unattributed');
    expect(owner('commander-x', 'novita')).toBe('unattributed');
  });

  test('never lets a host pose as the owner of someone else\'s model', () => {
    // Fireworks hosts Llama and Qwen weights; it did not train them. The old
    // fallback returned the routing label, so the Sankey showed Fireworks
    // owning 320 SKUs.
    expect(owner('agnes-2.5-pro', 'fireworks_ai')).toBe('unattributed');
    expect(owner('longcat-2.0', 'deepinfra')).toBe('unattributed');
    expect(owner('step-3.7-flash', 'novita')).toBe('unattributed');
    expect(owner('muse-spark-1.2', 'bedrock')).toBe('unattributed');
    expect(owner('hy3', 'together_ai')).toBe('unattributed');
  });

  test('still credits a host for a model it actually trained', () => {
    // `fireworks/ember-1` is Fireworks' own model, and `fireworks` (not
    // `fireworks_ai`) is not in the host set.
    expect(owner('ember-1', 'fireworks')).toBe('fireworks');
  });

  test('keeps Vertex routing attributed to Google', () => {
    expect(owner('some-unknown-model', 'vertex_ai-llama_models')).toBe('google');
  });
});
