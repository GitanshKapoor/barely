/**
 * Formats raw AI model slugs into clean, human-readable display names.
 * e.g.:
 * - "claude-sonnet-4-5" -> "Claude Sonnet 4.5"
 * - "anthropic/claude-sonnet-4-5" -> "Claude Sonnet 4.5"
 * - "llama-3.3-70b-versatile" -> "Llama 3.3 70B"
 */
export function formatModelName(modelId?: string | null): string {
  if (!modelId || !modelId.trim()) return 'Claude 3.7 Sonnet';

  const raw = modelId.trim();
  const slug = raw.split('/').pop() || raw;
  const lower = slug.toLowerCase();

  const exactMap: Record<string, string> = {
    'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
    'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',
    'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
    'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
    'claude-3-5-sonnet-20240620': 'Claude 3.5 Sonnet',
    'claude-3-5-haiku': 'Claude 3.5 Haiku',
    'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-3-opus-20240229': 'Claude 3 Opus',
    'claude-3-haiku': 'Claude 3 Haiku',
    'claude-3-haiku-20240307': 'Claude 3 Haiku',
    'llama-3.3-70b-versatile': 'Meta Llama 3.3 70B',
    'llama-3.3-70b': 'Meta Llama 3.3 70B',
    'llama-3.1-70b-versatile': 'Meta Llama 3.1 70B',
    'llama-3.1-8b-instant': 'Meta Llama 3.1 8B',
    'llama-3.1-8b': 'Meta Llama 3.1 8B',
    'llama-3.2-11b-vision-preview': 'Meta Llama 3.2 11B Vision',
    'llama-3.2-90b-vision-preview': 'Meta Llama 3.2 90B Vision',
    'gemma2-9b-it': 'Gemma 2 9B',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'o1': 'OpenAI o1',
    'o1-mini': 'OpenAI o1 Mini',
    'o3-mini': 'OpenAI o3-mini',
    'chatgpt-4o-latest': 'ChatGPT-4o Latest',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
    'deepseek-r1-distill-llama-70b': 'DeepSeek R1 Distill 70B',
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
