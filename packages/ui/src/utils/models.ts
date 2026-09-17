/**
 * Formats raw AI model slugs into clean, human-readable display names.
 * e.g.:
 * - "claude-sonnet-4-5" -> "Claude Sonnet 4.5"
 * - "anthropic/claude-sonnet-4-5" -> "Claude Sonnet 4.5"
 * - "llama-3.3-70b-versatile" -> "Llama 3.3 70B"
 */
export function formatModelName(modelId?: string | null): string {
  if (!modelId || !modelId.trim()) return 'Claude Sonnet 4.5';

  const raw = modelId.trim();
  const slug = raw.split('/').pop() || raw;
  const lower = slug.toLowerCase();

  const exactMap: Record<string, string> = {
    'claude-sonnet-4-5': 'Claude Sonnet 4.5',
    'claude-sonnet-4.5': 'Claude Sonnet 4.5',
    'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
    'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
    'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
    'claude-3-5-sonnet-20240620': 'Claude 3.5 Sonnet',
    'claude-3-5-haiku': 'Claude 3.5 Haiku',
    'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-3-opus-20240229': 'Claude 3 Opus',
    'claude-3-haiku': 'Claude 3 Haiku',
    'claude-3-haiku-20240307': 'Claude 3 Haiku',
    'llama-3.3-70b-versatile': 'Llama 3.3 70B',
    'llama-3.3-70b': 'Llama 3.3 70B',
    'llama-3.1-70b-versatile': 'Llama 3.1 70B',
    'llama-3.1-8b-instant': 'Llama 3.1 8B',
    'llama-3.1-8b': 'Llama 3.1 8B',
    'llama3-70b-8192': 'Llama 3 70B',
    'llama3-8b-8192': 'Llama 3 8B',
    'mixtral-8x7b-32768': 'Mixtral 8x7B',
    'gemma2-9b-it': 'Gemma 2 9B',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'deepseek-r1-distill-llama-70b': 'DeepSeek R1 (Llama 70B)',
    'deepseek-r1': 'DeepSeek R1',
  };

  if (exactMap[lower]) {
    return exactMap[lower];
  }

  // Fallback intelligent formatter
  const clean = slug
    .replace(/(\d+)-(\d+)/g, '$1.$2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(versatile|instant|preview|latest)\b/gi, '')
    .trim();

  const words = clean.split(/\s+/);
  return words
    .map((w) => {
      const wLower = w.toLowerCase();
      if (['gpt', 'llm', 'ai', 'moe', 'lpu', 'r1', 'it'].includes(wLower)) return w.toUpperCase();
      if (/^\d+[bkm]$/i.test(wLower)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}
