import { Inject, Injectable } from '@nestjs/common';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

@Injectable()
export class OpenRouterService {
  private baseUrl = 'https://openrouter.ai/api/v1';

  private get apiKey(): string {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY not configured');
    return key;
  }

  async chat(model: string, messages: ChatMessage[], temperature = 0.8): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-Title': 'DraftOrbit'
      },
      body: JSON.stringify({ model, messages, temperature, stream: false })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? '';
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    temperature = 0.8
  ): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-Title': 'DraftOrbit'
      },
      body: JSON.stringify({ model, messages, temperature, stream: true })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          yield { content: '', done: true };
          return;
        }
        try {
          const json = JSON.parse(payload) as any;
          const delta = json.choices?.[0]?.delta?.content ?? '';
          const finish = json.choices?.[0]?.finish_reason;
          yield {
            content: delta,
            done: finish === 'stop',
            model: json.model,
            usage: json.usage
          };
        } catch {}
      }
    }
  }
}
