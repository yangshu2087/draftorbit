import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DraftStatus, WorkflowRunStatus } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

const OPERATION_TEMPLATES = [
  {
    key: 'hotspot-commentary',
    name: '热点点评',
    description: '快速输出对热点事件的观点与判断',
    variables: ['topic', 'audience', 'tone', 'cta'],
    defaultTone: '专业但口语化'
  },
  {
    key: 'product-update',
    name: '产品更新',
    description: '发布新功能、迭代说明与价值亮点',
    variables: ['topic', 'audience', 'tone', 'cta'],
    defaultTone: '清晰直接'
  },
  {
    key: 'case-review',
    name: '案例复盘',
    description: '输出案例背景、方法、结果与复盘结论',
    variables: ['topic', 'audience', 'tone', 'cta'],
    defaultTone: '复盘型、结构化'
  },
  {
    key: 'qa-interaction',
    name: '问答互动',
    description: '围绕用户问题给出答案并引导讨论',
    variables: ['topic', 'audience', 'tone', 'cta'],
    defaultTone: '亲和互动'
  },
  {
    key: 'campaign-warmup',
    name: '活动预热',
    description: '发布活动信息、时间节点与参与方式',
    variables: ['topic', 'audience', 'tone', 'cta'],
    defaultTone: '有号召力'
  }
] as const;

@Injectable()
export class WorkflowService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async listTemplates(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    return this.prisma.db.workflowTemplate.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async createTemplate(
    userId: string,
    input: { name: string; key: string; config?: Record<string, unknown>; isActive?: boolean }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const template = await this.prisma.db.workflowTemplate.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: input.key
        }
      },
      update: {
        name: input.name,
        config: (input.config ?? {}) as any,
        isActive: input.isActive ?? true
      },
      create: {
        workspaceId,
        name: input.name,
        key: input.key,
        config: (input.config ?? {}) as any,
        isActive: input.isActive ?? true
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'workflow_template',
        resourceId: template.id,
        payload: {
          key: template.key,
          isActive: template.isActive
        }
      }
    });

    return template;
  }

  async runTemplate(
    userId: string,
    templateId: string,
    input?: Record<string, unknown>
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const template = await this.prisma.db.workflowTemplate.findFirst({
      where: { id: templateId, workspaceId }
    });
    if (!template) throw new NotFoundException('工作流模板不存在');

    const run = await this.prisma.db.workflowRun.create({
      data: {
        workspaceId,
        templateId,
        triggerUserId: userId,
        status: WorkflowRunStatus.QUEUED,
        input: (input ?? {}) as any
      }
    });

    await this.queue.enqueueAutomation(run.id);

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'workflow_run',
        resourceId: run.id,
        payload: {
          templateId,
          key: template.key
        }
      }
    });

    return run;
  }

  async listRuns(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    return this.prisma.db.workflowRun.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        template: {
          select: {
            id: true,
            key: true,
            name: true
          }
        }
      }
    });
  }

  async listOperationTemplates() {
    return OPERATION_TEMPLATES;
  }

  private renderOperationTemplate(
    tpl: (typeof OPERATION_TEMPLATES)[number],
    input: { topic: string; audience?: string; tone?: string; cta?: string }
  ): { title: string; content: string } {
    const topic = input.topic.trim();
    const audience = input.audience?.trim() || '关注该话题的中文创作者';
    const tone = input.tone?.trim() || tpl.defaultTone;
    const cta = input.cta?.trim() || '你怎么看？欢迎在评论区交流。';

    const title = `${tpl.name}｜${topic}`;
    const content = [
      `# ${topic}`,
      '',
      `【对象】${audience}`,
      `【语气】${tone}`,
      '',
      '核心观点：',
      `- 这件事对内容运营的直接影响是什么？`,
      `- 当下最值得马上行动的步骤是什么？`,
      `- 如何降低试错成本并快速验证？`,
      '',
      '建议动作：',
      `1. 先拆成 1 个最小可执行动作（今天就能做）`,
      '2. 记录结果并在 24 小时内回看数据',
      '3. 根据反馈继续迭代表达与节奏',
      '',
      cta
    ].join('\n');

    return { title, content };
  }

  async applyOperationTemplate(
    userId: string,
    key: string,
    input: { topic: string; audience?: string; tone?: string; cta?: string }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const tpl = OPERATION_TEMPLATES.find((x) => x.key === key);
    if (!tpl) throw new NotFoundException('运营模板不存在');

    const rendered = this.renderOperationTemplate(tpl, input);

    const draft = await this.prisma.db.draft.create({
      data: {
        workspaceId,
        userId,
        title: rendered.title,
        language: 'zh',
        status: DraftStatus.DRAFT,
        latestContent: rendered.content,
        currentVersion: 1,
        metadata: {
          templateKey: tpl.key,
          templateName: tpl.name
        },
        versions: {
          create: {
            versionNo: 1,
            content: rendered.content,
            createdById: userId
          }
        }
      },
      include: {
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1
        }
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'draft',
        resourceId: draft.id,
        payload: {
          source: 'operation-template',
          templateKey: tpl.key
        }
      }
    });

    return {
      template: tpl,
      draft
    };
  }

  async runPresetPipeline(userId: string, input?: Record<string, unknown>) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const template = await this.prisma.db.workflowTemplate.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: 'pipeline-default'
        }
      },
      update: {
        name: '标准内容流水线',
        isActive: true,
        config: {
          steps: ['topic', 'draft', 'naturalize', 'image', 'approval', 'publish'],
          version: 1
        }
      },
      create: {
        workspaceId,
        key: 'pipeline-default',
        name: '标准内容流水线',
        isActive: true,
        config: {
          steps: ['topic', 'draft', 'naturalize', 'image', 'approval', 'publish'],
          version: 1
        }
      }
    });

    return this.runTemplate(userId, template.id, {
      source: 'preset-pipeline',
      ...(input ?? {})
    });
  }
}
