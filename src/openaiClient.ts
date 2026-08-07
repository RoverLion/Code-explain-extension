export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

/** Build OpenAI-compatible chat completions URL from a base like `https://api.openai.com/v1`. */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

export async function chatCompletion(request: ChatCompletionRequest): Promise<string> {
  const url = buildChatCompletionsUrl(request.baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      temperature: request.temperature ?? 0.2,
      messages: request.messages,
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`AI API ${response.status}: ${rawText.slice(0, 500)}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error('AI API returned non-JSON response');
  }

  const content = extractAssistantContent(payload);
  if (!content) {
    throw new Error('AI API response missing assistant message content');
  }
  return content;
}

export function extractAssistantContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === 'string') {
    return content;
  }
  // Some gateways return content as array of parts
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as { text?: string }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return undefined;
}
