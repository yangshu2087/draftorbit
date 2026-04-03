export type ProviderCapability = 'text' | 'image' | 'moderation';

export type ProviderTaskType =
  | 'generation'
  | 'naturalization'
  | 'reply'
  | 'image'
  | 'moderation'
  | 'workflow';

export interface ProviderRequest {
  workspaceId: string;
  userId: string;
  taskType: ProviderTaskType;
  prompt: string;
  model?: string;
  capability?: ProviderCapability;
  temperature?: number;
}

export interface ProviderResponse {
  providerType: string;
  model: string;
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd?: number;
  };
  fallbackUsed?: boolean;
}

export interface TextGenerationProvider {
  generateText(input: ProviderRequest): Promise<ProviderResponse>;
}

