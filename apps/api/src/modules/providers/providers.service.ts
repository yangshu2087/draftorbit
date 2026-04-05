import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProviderType, UsageEventType } from '@draftorbit/db';
import { decryptSecret, encryptSecret, maskSecret } from '@draftorbit/shared';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

type RouteTextInput = {
  prompt: string;
  taskType: string;
  model?: string;
  providerType?: ProviderType;
  temperature?: number;
};

@Injectable()
export class ProvidersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  private usageEventFromTask(taskType: string): UsageEventType {
    const normalized = taskType.trim().toLowerCase();
    if (normalized.includes('natural')) return UsageEventType.NATURALIZATION;
    if (normalized.includes('reply')) return UsageEventType.REPLY;
    if (normalized.includes('image')) return UsageEventType.IMAGE;
    if (normalized.includes('publish')) return UsageEventType.PUBLISH;
    return UsageEventType.GENERATION;
  }

  private async callOpenRouter(input: {
    apiKey: string;
    prompt: string;
    model: string;
    temperature: number;
  }): Promise<{ content: string; inputTokens: number; outputTokens: number; costUsd: number; modelUsed: string }> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'DraftOrbit Provider Hub'
      },
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature,
        messages: [
          {
            role: 'user',
            content: input.prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim() ?? '';
    const usageAny = data as Record<string, any>;
    const costRaw = usageAny?.usage?.cost ?? usageAny?.usage?.total_cost ?? 0;
    const costUsd = Number.isFinite(Number(costRaw)) ? Number(costRaw) : 0;
    return {
      content,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      costUsd,
      modelUsed: data.model ?? input.model
    };
  }

  async list(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const rows = await this.prisma.db.providerConnection.findMany({
      where: { workspaceId },
      orderBy: [{ isEnabled: 'desc' }, { createdAt: 'desc' }]
    });

    return rows.map((row) => {
      let apiKeyMasked: string | null = null;
      if (row.apiKeyEnc) {
        try {
          apiKeyMasked = maskSecret(decryptSecret(row.apiKeyEnc));
        } catch {
          apiKeyMasked = '***';
        }
      }

      return {
        ...row,
        apiKeyEnc: undefined,
        apiKeyMasked
      };
    });
  }

  async upsert(
    userId: string,
    input: {
      id?: string;
      name: string;
      providerType: ProviderType;
      apiKey?: string;
      baseUrl?: string;
      modelAllowlist?: string[];
      isEnabled?: boolean;
    }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    if (input.id) {
      const existing = await this.prisma.db.providerConnection.findFirst({
        where: { id: input.id, workspaceId }
      });
      if (!existing) throw new NotFoundException('Provider connection 不存在');

      const updated = await this.prisma.db.providerConnection.update({
        where: { id: input.id },
        data: {
          name: input.name,
          providerType: input.providerType,
          apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : undefined,
          baseUrl: input.baseUrl,
          modelAllowlist: input.modelAllowlist,
          isEnabled: input.isEnabled
        }
      });

      await this.prisma.db.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'UPDATE',
          resourceType: 'provider_connection',
          resourceId: updated.id,
          payload: {
            providerType: updated.providerType,
            isEnabled: updated.isEnabled
          }
        }
      });

      return updated;
    }

    const created = await this.prisma.db.providerConnection.create({
      data: {
        workspaceId,
        name: input.name,
        providerType: input.providerType,
        apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : null,
        baseUrl: input.baseUrl ?? null,
        modelAllowlist: input.modelAllowlist ?? [],
        isEnabled: input.isEnabled ?? true
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'provider_connection',
        resourceId: created.id,
        payload: {
          providerType: created.providerType,
          isEnabled: created.isEnabled
        }
      }
    });

    return created;
  }

  async toggle(userId: string, id: string, isEnabled: boolean) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const existing = await this.prisma.db.providerConnection.findFirst({
      where: { id, workspaceId }
    });
    if (!existing) throw new NotFoundException('Provider connection 不存在');

    const updated = await this.prisma.db.providerConnection.update({
      where: { id },
      data: { isEnabled }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'provider_connection',
        resourceId: id,
        payload: { isEnabled }
      }
    });

    return updated;
  }

  async byokStatus(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const connections = await this.prisma.db.providerConnection.findMany({
      where: { workspaceId, isEnabled: true }
    });

    const byokEnabled = connections.some((c) => Boolean(c.apiKeyEnc));

    return {
      workspaceId,
      byokEnabled,
      enabledConnections: connections.length,
      platformFallbackEnabled: Boolean(process.env.OPENROUTER_API_KEY)
    };
  }

  async routeText(userId: string, input: RouteTextInput) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const connections = await this.prisma.db.providerConnection.findMany({
      where: {
        workspaceId,
        isEnabled: true,
        ...(input.providerType ? { providerType: input.providerType } : {})
      },
      orderBy: { createdAt: 'asc' }
    });

    const selected = connections[0] ?? null;
    const selectedProviderType = selected?.providerType ?? ProviderType.OPENROUTER;
    const model = input.model?.trim() || 'openrouter/free';
    const temperature = typeof input.temperature === 'number' ? input.temperature : 0.7;

    let providerKey: string | null = null;
    if (selected?.apiKeyEnc) {
      try {
        providerKey = decryptSecret(selected.apiKeyEnc);
      } catch {
        providerKey = null;
      }
    }

    let fallbackUsed = false;
    if (!providerKey && process.env.OPENROUTER_API_KEY) {
      providerKey = process.env.OPENROUTER_API_KEY;
      fallbackUsed = true;
    }

    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let requestCostUsd = 0;
    let modelUsed = model;
    let fallbackDepth = 0;
    let routingTier = 'free_first';

    if (providerKey) {
      const candidates = input.model?.trim()
        ? [input.model.trim()]
        : ['openrouter/free', 'deepseek/deepseek-chat'];

      let lastError: Error | null = null;
      for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i];
        try {
          const result = await this.callOpenRouter({
            apiKey: providerKey,
            prompt: input.prompt,
            model: candidate,
            temperature
          });
          content = result.content;
          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;
          requestCostUsd = result.costUsd;
          modelUsed = result.modelUsed;
          fallbackDepth = i;
          routingTier = i === 0 ? 'free_first' : 'floor';
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (!content && lastError) {
        throw lastError;
      }
    } else {
      fallbackUsed = true;
      content = `【Mock ${selectedProviderType}】${input.prompt}`;
      inputTokens = Math.ceil(input.prompt.length / 2);
      outputTokens = Math.ceil(content.length / 2);
      requestCostUsd = 0;
      modelUsed = `mock/${selectedProviderType.toLowerCase()}`;
      routingTier = 'floor';
    }

    const usage = await this.prisma.db.usageLog.create({
      data: {
        userId,
        workspaceId,
        eventType: this.usageEventFromTask(input.taskType),
        model: modelUsed,
        modelUsed,
        routingTier,
        fallbackDepth,
        inputTokens,
        outputTokens,
        costUsd: String(requestCostUsd),
        requestCostUsd: String(requestCostUsd),
        trialMode: false
      }
    });

    await this.prisma.db.tokenCostLog.create({
      data: {
        workspaceId,
        usageLogId: usage.id,
        providerType: selectedProviderType,
        model: modelUsed,
        inputTokens,
        outputTokens,
        costUsd: String(requestCostUsd)
      }
    });

    return {
      providerType: selectedProviderType,
      model: modelUsed,
      content,
      fallbackUsed,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: requestCostUsd
      }
    };
  }
}
